import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {assetExists, readAsset, readAssetSync, readTextAsset} from "../main/helpers/assetFiles";
import {readStrokeSvg} from "../main/helpers/strokeSvg";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {compressLanguageAssets} = require("../scripts/compressLanguageAssets.js");

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-assets-test-"));
});

after(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

const write = async (relative: string, contents: string) => {
  const file = path.join(directory, relative);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, contents, "utf8");
  return file;
};

test("packaged (gzipped) language assets read the same as the plain ones", async () => {
  const appDirectory = path.join(directory, "app");
  const jmdict = JSON.stringify({words: [{id: "1", kanji: [{text: "人"}]}]});
  const svg = "<svg><path d=\"M1 1\"/></svg>";
  const accents = "{\"人\": [0]}";
  await write("app/language-assets/japanese/dict/jmdict.json", jmdict);
  await write("app/language-assets/japanese/dict/base.dat.gz", "already compressed");
  await write("app/language-assets/japanese/pitch/accents.json", accents);
  await write("app/language-assets/han-character-core/kanji/04eba.svg", svg);
  await write("app/language-assets/mandarin/chinese/zh.jieba.txt", "人 10 n\n");

  const totals = compressLanguageAssets(appDirectory);
  assert.equal(totals.files, 3);

  const root = path.join(appDirectory, "language-assets");
  const jmdictPath = path.join(root, "japanese/dict/jmdict.json");
  // Originals are replaced; the renderer's URL-fetched files and existing .gz files are untouched.
  await assert.rejects(fs.access(jmdictPath));
  await fs.access(jmdictPath + ".gz");
  assert.equal(await fs.readFile(path.join(root, "japanese/pitch/accents.json"), "utf8"), accents);
  assert.equal(await fs.readFile(path.join(root, "japanese/dict/base.dat.gz"), "utf8"), "already compressed");

  assert.equal(assetExists(jmdictPath), true);
  assert.equal(await readTextAsset(jmdictPath), jmdict);
  assert.equal(readAssetSync(path.join(root, "mandarin/chinese/zh.jieba.txt")).toString("utf8"), "人 10 n\n");
  assert.equal(await readStrokeSvg(path.join(root, "han-character-core/kanji"), "04eba.svg"), svg);

  // Running again (another architecture in the same build) finds nothing left to do.
  assert.equal(compressLanguageAssets(appDirectory).files, 0);
});

test("plain assets still read directly, and missing ones fail clearly", async () => {
  const plain = await write("plain/kanjidic.json", "{\"plain\": true}");
  assert.equal(await readTextAsset(plain), "{\"plain\": true}");
  assert.equal(assetExists(path.join(directory, "plain/missing.json")), false);
  await assert.rejects(readAsset(path.join(directory, "plain/missing.json")), /ENOENT/);
  assert.equal(await readStrokeSvg(path.join(directory, "plain"), "0abcd.svg"), "");
});
