import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {test} from "node:test";
import BrowserDictionaryLoader from "../node_modules/kuromoji/src/loader/BrowserDictionaryLoader.js";
import {setSys} from "../renderer/platform/backend/sys";
import "../renderer/platform/backend/shims/kuromojiFallback";

const dictionary = path.join(process.cwd(), "node_modules", "kuromoji", "dict");

const load = () => new Promise<unknown>((resolve, reject) => {
  new BrowserDictionaryLoader(dictionary).load((error: unknown, loaded: unknown) => (error ? reject(error) : resolve(loaded)));
});

/**
 * kuromoji asks for `<name>.dat.gz`; the shim makes one fs_read_asset call per file with the path
 * minus `.gz` and uses the returned bytes as they are (Rust has decompressed them). The fake serves
 * the package's own gzipped dictionary the way the Rust command does for a development tree.
 */
test("the kuromoji loader reads each dictionary file with one fs_read_asset call and no JS decompression", async () => {
  const calls: string[] = [];
  setSys(async (cmd, args = {}) => {
    assert.equal(cmd, "fs_read_asset");
    const asset = args.path as string;
    calls.push(asset);
    assert.ok(!asset.endsWith(".gz"), asset);
    const bytes = zlib.gunzipSync(fs.readFileSync(`${asset}.gz`));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });

  const dictionaries = await load() as { trie: unknown; token_info_dictionary: unknown };
  assert.ok(dictionaries.trie && dictionaries.token_info_dictionary);

  const expected = fs.readdirSync(dictionary).filter((name) => name.endsWith(".dat.gz")).map((name) => name.slice(0, -3)).sort();
  assert.equal(expected.length, 12);
  assert.deepEqual(calls.map((file) => path.basename(file)).sort(), expected);
});

test("a missing dictionary file reaches kuromoji's callback as an error", async () => {
  setSys(async () => {
    throw new Error("ENOENT: no such file or directory, open 'x'");
  });
  await assert.rejects(load(), /ENOENT/);
});
