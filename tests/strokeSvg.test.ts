import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {after, before, beforeEach, test} from "node:test";
import {readStrokeSvg} from "../main/helpers/strokeSvg";
import {readTextAsset} from "../main/helpers/assetFiles";
import {clearTableCaches} from "../main/helpers/dataTable";
import {writeTable} from "../scripts/data/writeTable";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {compressLanguageAssets} = require("../scripts/compressLanguageAssets.js");

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-stroke-test-"));
});

after(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

beforeEach(() => clearTableCaches());

const FIELDS = {dataset: "test/strokes", version: "1", source: {name: "Test", url: "https://example.test/", license: "CC0"}};

const write = async (relative: string, contents: string | Buffer) => {
  const file = path.join(directory, relative);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, contents);
  return file;
};

const fixture = (name: string) => fs.readFile(path.join(__dirname, "fixtures", "hanzi", name), "utf8");

test("readStrokeSvg prefers a table, ignores loose files beside it, and falls back without one", async () => {
  const packed = path.join(directory, "set-packed");
  await write("set-packed/065e5.svg", "loose");
  await write("set-packed/04eba.svg", "loose too");
  writeTable(packed + ".pack", {...FIELDS, codec: "text"}, [["065e5.svg", Buffer.from("from table")]]);
  assert.equal(await readStrokeSvg(packed, "065e5.svg"), "from table");
  assert.equal(await readStrokeSvg(packed, "04eba.svg"), "");

  const loose = path.join(directory, "set-loose");
  await write("set-loose/065e5.svg", "loose");
  await write("set-loose/04eba.svg.gz", zlib.gzipSync("gzipped loose"));
  assert.equal(await readStrokeSvg(loose, "065e5.svg"), "loose");
  assert.equal(await readStrokeSvg(loose, "04eba.svg"), "gzipped loose");
  assert.equal(await readStrokeSvg(loose, "fffff.svg"), "");
});

test("readStrokeSvg decodes by the table's codec", async () => {
  const hanzi = path.join(directory, "set-hanzi");
  const svg = await fixture("26085.svg");
  const {mmahSvgCodec} = await import("../main/helpers/dataCodecs");
  writeTable(hanzi + ".pack", {...FIELDS, codec: "mmah-svg-1"}, [["26085.svg", mmahSvgCodec.encode(svg)]]);
  assert.equal(await readStrokeSvg(hanzi, "26085.svg"), svg);
});

test("readStrokeSvg answers '' for names that are not plain code-point file names, and for a corrupt or unknown-codec table", async () => {
  const packed = path.join(directory, "set-bad");
  writeTable(packed + ".pack", {...FIELDS, codec: "text"}, [["065e5.svg", Buffer.from("x")]]);
  for (const bad of ["../065e5.svg", "04e14-Kaisho.svg", "065e5.svg.gz", "", 5, null]) {
    assert.equal(await readStrokeSvg(packed, bad), "", String(bad));
  }
  const odd = path.join(directory, "set-odd");
  writeTable(odd + ".pack", {...FIELDS, codec: "nope-1"}, [["065e5.svg", Buffer.from("x")]]);
  await write("set-odd/065e5.svg", "loose");
  assert.equal(await readStrokeSvg(odd, "065e5.svg"), "", "a table that exists is never skipped for loose files");
  const broken = path.join(directory, "set-broken");
  await write("set-broken.pack", "not a table at all");
  assert.equal(await readStrokeSvg(broken, "065e5.svg"), "");
});

test("staging packs the stroke folders into tables and keeps gzipping the dictionaries", async () => {
  const app = path.join(directory, "staged");
  const root = "staged/language-assets";
  const kanjiSvg = "<svg xmlns=http://www.w3.org/2000/svg>日</svg>";
  await write(`${root}/han-character-core/kanji/065e5.svg`, kanjiSvg);
  await write(`${root}/han-character-core/kanji/04e14-Kaisho.svg`, "<svg>variant</svg>");
  await write(`${root}/han-character-core/hanzi/26085.svg`, await fixture("26085.svg"));
  await write(`${root}/han-character-core/hanzi/odd.svg`, "not readable");
  await write(`${root}/han-character-core/hanzi/00041.svg`, "<svg>not a make me a hanzi file</svg>");
  await write(`${root}/japanese/dict/jmdict.json`, "{}");
  const strokes = path.join(app, "language-assets/han-character-core");

  const totals = compressLanguageAssets(app);
  assert.equal(totals.files, 4);
  for (const set of ["kanji", "hanzi"]) {
    await fs.access(path.join(strokes, `${set}.pack`));
    await assert.rejects(fs.access(path.join(strokes, set)));
  }
  assert.equal(await readStrokeSvg(path.join(strokes, "kanji"), "065e5.svg"), kanjiSvg);
  assert.equal(await readStrokeSvg(path.join(strokes, "kanji"), "04e14-Kaisho.svg"), "");
  assert.equal(await readStrokeSvg(path.join(strokes, "hanzi"), "26085.svg"), await fixture("26085.svg"));
  assert.equal(await readStrokeSvg(path.join(strokes, "hanzi"), "00041.svg"), "<svg>not a make me a hanzi file</svg>");
  assert.equal(await readTextAsset(path.join(app, "language-assets/japanese/dict/jmdict.json")), "{}");
  await fs.access(path.join(app, "language-assets/japanese/dict/jmdict.json.gz"));

  // A second run finds the folders already packed and leaves the tables alone.
  const before = await fs.readFile(path.join(strokes, "kanji.pack"));
  assert.equal(compressLanguageAssets(app).files, 0);
  assert.deepEqual(await fs.readFile(path.join(strokes, "kanji.pack")), before);
});
