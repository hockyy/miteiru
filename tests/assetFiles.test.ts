import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {assetExists, readAsset, readTextAsset} from "../main/helpers/assetFiles";
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
  const words = "人 10 n\n";
  const svg = "<svg><path d=\"M1 1\"/></svg>";
  const accents = "{\"人\": [0]}";
  await write("app/language-assets/mandarin/chinese/zh.jieba.txt", words);
  await write("app/language-assets/japanese/dict/base.dat.gz", "already compressed");
  await write("app/language-assets/japanese/pitch/accents.json", accents);
  await write("app/language-assets/han-character-core/kanji/04eba.svg", svg);

  const totals = compressLanguageAssets(appDirectory);
  assert.equal(totals.files, 2);

  const root = path.join(appDirectory, "language-assets");
  const wordsPath = path.join(root, "mandarin/chinese/zh.jieba.txt");
  // Originals are replaced; the renderer's URL-fetched files and existing .gz files are untouched.
  await assert.rejects(fs.access(wordsPath));
  await fs.access(wordsPath + ".gz");
  assert.equal(await fs.readFile(path.join(root, "japanese/pitch/accents.json"), "utf8"), accents);
  assert.equal(await fs.readFile(path.join(root, "japanese/dict/base.dat.gz"), "utf8"), "already compressed");

  assert.equal(await assetExists(wordsPath), true);
  assert.equal(await readTextAsset(wordsPath), words);
  assert.equal(await readStrokeSvg(path.join(root, "han-character-core/kanji"), "04eba.svg"), svg);

  // Running again (another architecture in the same build) finds nothing left to do and keeps the copies.
  assert.equal(compressLanguageAssets(appDirectory).files, 0);
  await fs.access(wordsPath + ".gz");

  // A fresh export brings the plain file back: it is compressed again.
  await write("app/language-assets/mandarin/chinese/zh.jieba.txt", words);
  assert.equal(compressLanguageAssets(appDirectory).files, 1);
  assert.equal(await readTextAsset(wordsPath), words);
});

test("packaging without downloaded language assets compresses nothing instead of failing", () => {
  assert.equal(compressLanguageAssets(path.join(directory, "no-assets-app")).files, 0);
});

test("plain assets still read directly, and missing ones fail clearly", async () => {
  const plain = await write("plain/kanjidic.json", "{\"plain\": true}");
  assert.equal(await readTextAsset(plain), "{\"plain\": true}");
  assert.equal(await assetExists(path.join(directory, "plain/missing.json")), false);
  await assert.rejects(readAsset(path.join(directory, "plain/missing.json")), /ENOENT/);
  assert.equal(await readStrokeSvg(path.join(directory, "plain"), "0abcd.svg"), "");
});
