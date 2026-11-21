import fs from "node:fs";
import path from "node:path";

/**
 * The Node-API addon (native/rust/crates/miteiru-node): the same Rust tokenizers and data tables the
 * app's backend commands use (miteiru-langdata), so the headless server tokenizes exactly as the app.
 */
export interface UserWord {
  surface: string;
  source: string;
}

export interface MiteiruAddon {
  ADDON_API: number;
  japaneseLoad(dictPath: string, jmdictPath: string | null, appWords?: boolean | null): Promise<void>;
  japaneseSetWords(dictPath: string, revision: string, words: UserWord[]): void;
  japaneseTokenizeBatch(dictPath: string, texts: string[]): Promise<string>;
  jiebaLoad(key: string, dictPath: string, dictionaryPath?: string | null): Promise<void>;
  jiebaCut(key: string, text: string, hmm: boolean): string[];
  openccConvertBatch(mode: string, lines: string[]): string[];
  jyutpingBatch(texts: string[]): string;
  jiebaUserWords(key: string, words: UserWord[]): void;
  tableOpen(path: string): number;
  tableClose(handle: number): void;
  tableGetMany(handle: number, keys: string[]): Array<string | null>;
  tableValues(handle: number, gte: string | null, lt: string | null, limit: number): string[];
  readAsset(path: string): Buffer;
}

/** The ADDON_API this code is written against; a build with another one is refused. */
export const EXPECTED_ADDON_API = 3;

/** The file cargo builds for the crate on this system. */
export const addonFileName = (platform: NodeJS.Platform = process.platform) => (
  platform === "win32" ? "miteiru_node.dll" : platform === "darwin" ? "libmiteiru_node.dylib" : "libmiteiru_node.so"
);

/** Cargo's release output, including checkouts with a shared CARGO_TARGET_DIR. */
export const defaultAddonPath = (repoRoot: string) => path.join(process.env.CARGO_TARGET_DIR || path.join(repoRoot, "native", "rust", "target"), "release", addonFileName());

/** Loads the addon at `file` (MITEIRU_NODE_ADDON overrides it) and checks its API version. */
export const loadAddon = (file: string): MiteiruAddon => {
  const target = process.env.MITEIRU_NODE_ADDON || file;
  if (!fs.existsSync(target)) {
    throw new Error(`The Miteiru Node addon is not built: ${target} is missing. Build it with: cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-node`);
  }
  const module = {exports: {}} as {exports: MiteiruAddon};
  process.dlopen(module, target);
  if (module.exports.ADDON_API !== EXPECTED_ADDON_API) {
    throw new Error(`The Miteiru Node addon at ${target} is API ${module.exports.ADDON_API}, not ${EXPECTED_ADDON_API}: rebuild it.`);
  }
  return module.exports;
};
