import fs from "node:fs";
import path from "node:path";
import type {SysCall} from "../../renderer/platform/backend/sys";
import {SYS_KV_BATCH, SYS_READ_ASSET} from "../../renderer/platform/backend/protocol";
import {decodeBatch, type KvStore, type RangeOptions} from "./kvStore";
import {openccText} from "../language/opencc";
import type {MiteiruAddon, UserWord} from "./nativeAddon";
import {readingCommands} from "./readingCommands";

/**
 * The app's `sys(...)` commands (src-tauri/src/lib.rs) as the headless server answers them, so the
 * backend's own shims run unchanged: kuromoji.ts and jieba.ts reach the Rust tokenizers through the
 * addon, level.ts reaches the dictionary tables through the addon and the saved words through the
 * same SQLite file the app uses. Like the app's, a failure rejects with its "CODE: message" text.
 */

const PATHEXT = () => (process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean) : [""]);

/** proc_which: the program on PATH, or null. */
export const findOnPath = (name: string): string | null => {
  if (!name || /[\\/]/.test(name)) return null;
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const extension of PATHEXT()) {
      const candidate = path.join(directory, name + (name.toLowerCase().endsWith(extension.toLowerCase()) ? "" : extension.toLowerCase()));
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Not here.
      }
    }
  }
  return null;
};

const text = (value: unknown) => String(value ?? "");
const words = (value: unknown): UserWord[] => (Array.isArray(value) ? value : []).map((word) => ({surface: text(word?.surface), source: text(word?.source)}));

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const createNodeSys = (addon: MiteiruAddon, kv: KvStore): SysCall => {
  const commands: Record<string, (args: Record<string, unknown>) => unknown> = {
    japanese_load: (args) => addon.japaneseLoad(text(args.dictPath), typeof args.jmdictPath === "string" ? args.jmdictPath : null, args.appWords === true),
    japanese_set_words: (args) => addon.japaneseSetWords(text(args.dictPath), text(args.revision), words(args.words)),
    japanese_tokenize: async (args) => JSON.parse(await addon.japaneseTokenizeBatch(text(args.dictPath), [text(args.text)]))[0],
    japanese_tokenize_batch: async (args) => JSON.parse(await addon.japaneseTokenizeBatch(text(args.dictPath), (args.texts as unknown[]).map(text))),
    jieba_load: (args) => addon.jiebaLoad(text(args.key), text(args.dictPath), typeof args.dictionaryPath === "string" ? args.dictionaryPath : null),
    jieba_cut_tagged: (args) => addon.jiebaCutTagged(text(args.key), text(args.text), args.hmm !== false),
    jieba_cut: (args) => addon.jiebaCut(text(args.key), text(args.text), args.hmm !== false),
    opencc_convert_batch: (args) => addon.openccConvertBatch(text(args.mode), (args.lines as Array<string | number[]>).map(openccText)),
    ...readingCommands(addon),
    jieba_user_words: (args) => addon.jiebaUserWords(text(args.key), words(args.words)),
    table_open: (args) => addon.tableOpen(text(args.path)),
    table_close: (args) => addon.tableClose(Number(args.handle)),
    table_get_many: (args) => addon.tableGetMany(Number(args.handle), (args.keys as unknown[]).map(text)),
    table_values: (args) => addon.tableValues(Number(args.handle), typeof args.gte === "string" ? args.gte : null, typeof args.lt === "string" ? args.lt : null, Number(args.limit ?? -1)),
    [SYS_READ_ASSET]: (args) => {
      const bytes = addon.readAsset(text(args.path));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    kv_open: (args) => kv.open(text(args.location)),
    kv_close: (args) => kv.close(Number(args.handle)),
    kv_get: (args) => kv.get(Number(args.handle), text(args.key)),
    kv_get_many: (args) => kv.getMany(Number(args.handle), (args.keys as unknown[]).map(text)),
    kv_put: (args) => kv.put(Number(args.handle), text(args.key), text(args.value)),
    kv_del: (args) => kv.del(Number(args.handle), text(args.key)),
    [SYS_KV_BATCH]: (args) => kv.batch(Number(args.handle), decodeBatch(args.data as ArrayBuffer)),
    kv_range: (args) => kv.range(Number(args.handle), (args.opts ?? {}) as RangeOptions),
    kv_clear: (args) => kv.clear(Number(args.handle), (args.opts ?? {}) as RangeOptions),
    proc_which: (args) => findOnPath(text(args.name)),
    // A development checkout keeps dictionaries as JSON, which only the app imports (dict_import.rs);
    // installed packs, and data in their format, hold ready tables and never need this.
    kv_import_dictionary: (args) => {
      throw `ENOSYS: function not implemented, the headless server reads dictionaries as tables (.pack), as installed language packs hold them, and does not import ${text(args.path)}. Use the installed packs, or --assets with a folder in their format.`;
    }
  };
  return async (cmd, args = {}) => {
    const command = commands[cmd];
    if (!command) throw `ENOSYS: function not implemented, ${cmd} is not available in the headless server`;
    try {
      return await command(args);
    } catch (error) {
      // The app's sys rejects with the Rust error's text; the shims turn it into an Error with a code.
      throw messageOf(error);
    }
  };
};
