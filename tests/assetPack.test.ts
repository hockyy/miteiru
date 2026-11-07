import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {after, before, test} from "node:test";
import {PACK_SUFFIX, readPackEntry} from "../main/helpers/assetPack";
import {readTextAsset} from "../main/helpers/assetFiles";
import {readStrokeSvg} from "../main/helpers/strokeSvg";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {writeAssetPack} = require("../scripts/assetPack.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {compressLanguageAssets} = require("../scripts/compressLanguageAssets.js");

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-pack-test-"));
});

after(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

const gz = (text: string) => zlib.gzipSync(Buffer.from(text, "utf8"));

const write = async (relative: string, contents: string | Buffer) => {
  const file = path.join(directory, relative);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, contents);
  return file;
};

const header = (indexLength: number) => {
  const bytes = Buffer.alloc(12);
  bytes.write("MTRPACK1", 0, "latin1");
  bytes.writeUInt32LE(indexLength, 8);
  return bytes;
};

test("a pack reads back every entry, including an empty file, and null for a missing name", async () => {
  const pack = path.join(directory, "round.pack");
  const files: Record<string, string> = {"065e5.svg": "<svg>日</svg>", "04eba.svg": "<svg>人</svg>", "empty.svg": "", "0a.svg": "x".repeat(100000)};
  writeAssetPack(pack, Object.entries(files).map(([name, text]) => [name, gz(text)]));
  for (const [name, text] of Object.entries(files)) {
    assert.equal((await readPackEntry(pack, name))?.toString("utf8"), text, name);
  }
  assert.equal(await readPackEntry(pack, "nothere.svg"), null);
  assert.equal((await fs.readFile(pack)).subarray(0, 8).toString("latin1"), "MTRPACK1");
});

test("a missing pack rejects with ENOENT, and is retried once it exists", async () => {
  const pack = path.join(directory, "later.pack");
  await assert.rejects(readPackEntry(pack, "a.svg"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  writeAssetPack(pack, [["a.svg", gz("A")]]);
  assert.equal((await readPackEntry(pack, "a.svg"))?.toString(), "A");
});

test("a corrupt pack rejects with a clear message", async () => {
  await assert.rejects(readPackEntry(await write("badmagic.pack", Buffer.from("NOTAPACK0000{}")), "a.svg"), /bad magic/);
  await assert.rejects(readPackEntry(await write("short.pack", "MTR"), "a.svg"), /too short/);
  await assert.rejects(readPackEntry(await write("longindex.pack", Buffer.concat([header(500), Buffer.from("{}")])), "a.svg"), /does not fit/);
  const index = Buffer.from(JSON.stringify({"a.svg": [0, 99]}));
  await assert.rejects(readPackEntry(await write("outside.pack", Buffer.concat([header(index.length), index, Buffer.from("abc")])), "a.svg"), /bad entry for a.svg/);
});

test("readStrokeSvg prefers a pack, ignores loose files beside it, and falls back without one", async () => {
  const packed = path.join(directory, "set-packed");
  await write("set-packed/065e5.svg", "loose");
  await write("set-packed/04eba.svg", "loose too");
  writeAssetPack(packed + PACK_SUFFIX, [["065e5.svg", gz("from pack")]]);
  assert.equal(await readStrokeSvg(packed, "065e5.svg"), "from pack");
  assert.equal(await readStrokeSvg(packed, "04eba.svg"), "");

  const loose = path.join(directory, "set-loose");
  await write("set-loose/065e5.svg", "loose");
  await write("set-loose/04eba.svg.gz", gz("gzipped loose"));
  assert.equal(await readStrokeSvg(loose, "065e5.svg"), "loose");
  assert.equal(await readStrokeSvg(loose, "04eba.svg"), "gzipped loose");
  assert.equal(await readStrokeSvg(loose, "fffff.svg"), "");

  for (const bad of ["../065e5.svg", "04e14-Kaisho.svg", "065e5.svg.gz", "", 5, null]) {
    assert.equal(await readStrokeSvg(packed, bad), "", String(bad));
  }
});

test("staging packs the stroke folders and keeps gzipping the dictionaries", async () => {
  const app = path.join(directory, "staged");
  const root = "staged/language-assets";
  await write(`${root}/han-character-core/kanji/065e5.svg`, "<svg>日</svg>");
  await write(`${root}/han-character-core/kanji/04e14-Kaisho.svg`, "<svg>variant</svg>");
  await write(`${root}/han-character-core/hanzi/26085.svg`, "<svg>日</svg>");
  await write(`${root}/japanese/dict/jmdict.json`, "{}");
  const kanji = path.join(app, "language-assets/han-character-core/kanji");

  const totals = compressLanguageAssets(app);
  assert.equal(totals.files, 3);
  await fs.access(kanji + ".pack");
  await assert.rejects(fs.access(kanji));
  assert.equal(await readStrokeSvg(kanji, "065e5.svg"), "<svg>日</svg>");
  assert.equal(await readStrokeSvg(kanji, "04e14-Kaisho.svg"), "");
  assert.equal(await readStrokeSvg(path.join(app, "language-assets/han-character-core/hanzi"), "26085.svg"), "<svg>日</svg>");
  assert.equal(await readTextAsset(path.join(app, "language-assets/japanese/dict/jmdict.json")), "{}");
  await fs.access(path.join(app, "language-assets/japanese/dict/jmdict.json.gz"));

  // A second run finds the folders already packed and leaves the packs alone.
  const packBefore = await fs.readFile(kanji + ".pack");
  assert.equal(compressLanguageAssets(app).files, 0);
  assert.deepEqual(await fs.readFile(kanji + ".pack"), packBefore);
});
