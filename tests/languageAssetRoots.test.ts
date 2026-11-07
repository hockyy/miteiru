import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {loadLanguagePlugin, resolveAsset, setLanguageAssetRoots} from "../main/handler/languages/registry";

let directory: string;
let bundled: string;
let japanese: string;
let hanzi: string;

const put = (root: string, relative: string, contents = "x") => {
  const file = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
};

before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-roots-test-"));
  bundled = path.join(directory, "bundled", "language-assets");
  japanese = path.join(directory, "japanese-pack", "language-assets");
  hanzi = path.join(directory, "hanzi-pack", "language-assets");
  fs.mkdirSync(bundled, {recursive: true});
  // What the Japanese pack unpacks to (tables beside where a JSON file or a folder would be), and the hanzi pack.
  put(japanese, "japanese/dict/jmdict.pack");
  put(japanese, "japanese/dict/base.dat.zst");
  put(japanese, "han-character-core/kanji.pack");
  put(japanese, "han-character-core/wanikani/kanji.json.zst");
  put(hanzi, "han-character-core/hanzi.pack");
  put(bundled, "vietnamese/vietnamese/vnedict.txt", "bundled");
  put(japanese, "vietnamese/vietnamese/vnedict.txt.gz", "also in a pack");
});

after(() => {
  fs.rmSync(directory, {recursive: true, force: true});
});

const roots = () => [bundled, japanese, hanzi];

test("a file is found in the root that holds it, in any stored form", async () => {
  assert.equal(await resolveAsset(roots(), "japanese", "dict/base.dat", ""), path.join(japanese, "japanese/dict/base.dat"));
  assert.equal(
    await resolveAsset(roots(), "han-character-core", "wanikani/kanji.json", "wanikani/kanji.json"),
    path.join(japanese, "han-character-core/wanikani/kanji.json")
  );
});

test("a table stands in for the JSON file or the folder it replaces", async () => {
  assert.equal(await resolveAsset(roots(), "japanese", "dict/jmdict.json", "dict/jmdict.json"), path.join(japanese, "japanese/dict/jmdict.json"));
  assert.equal(await resolveAsset(roots(), "han-character-core", "kanji", "kanji"), path.join(japanese, "han-character-core/kanji"));
  // The strokes of the other pack come from that pack's root.
  assert.equal(await resolveAsset(roots(), "han-character-core", "hanzi", "hanzi"), path.join(hanzi, "han-character-core/hanzi"));
});

test("a plain folder in a pack counts", async () => {
  assert.equal(await resolveAsset(roots(), "japanese", "dict", "dict"), path.join(japanese, "japanese/dict"));
});

test("the bundled root comes first", async () => {
  assert.equal(await resolveAsset(roots(), "vietnamese", "vietnamese/vnedict.txt", ""), path.join(bundled, "vietnamese/vietnamese/vnedict.txt"));
  assert.equal(
    await resolveAsset([japanese, bundled], "vietnamese", "vietnamese/vnedict.txt", ""),
    path.join(japanese, "vietnamese/vietnamese/vnedict.txt")
  );
});

test("a pack's root is only asked for the plugin folders it carries", async () => {
  // The Japanese pack's folder happens to hold a Vietnamese file, but its manifest entry does not list it.
  const packRoots = [{dir: japanese, plugins: ["japanese", "han-character-core"]}, {dir: bundled}];
  assert.equal(await resolveAsset(packRoots, "vietnamese", "vietnamese/vnedict.txt", ""), path.join(bundled, "vietnamese/vietnamese/vnedict.txt"));
  assert.equal(await resolveAsset(packRoots, "japanese", "dict/jmdict.json", ""), path.join(japanese, "japanese/dict/jmdict.json"));
  // A root that may hold anything (a plain string, or no plugin list) is asked for every plugin.
  assert.equal(await resolveAsset([japanese], "vietnamese", "vietnamese/vnedict.txt", ""), path.join(japanese, "vietnamese/vietnamese/vnedict.txt"));
});

test("with no root that may hold the plugin, the bundled location is named", async () => {
  const named = await resolveAsset([{dir: hanzi, plugins: ["han-character-core"]}], "mandarin", "chinese/chinese.json", "");
  assert.ok(named.endsWith(path.join("language-assets", "mandarin", "chinese", "chinese.json")), named);
});

test("data nowhere falls back to the first root, so the error names the bundled location", async () => {
  assert.equal(await resolveAsset(roots(), "mandarin", "chinese/chinese.json", ""), path.join(bundled, "mandarin/chinese/chinese.json"));
  const legacy = await resolveAsset([], "mandarin", "chinese/chinese.json", "x/y.json");
  assert.ok(legacy.endsWith(path.join("x", "y.json")), legacy);
});

test("the roots are asked for again at each language load, and a failing provider leaves the bundled data", async () => {
  let asked = 0;
  setLanguageAssetRoots(async () => {
    asked++;
    return [bundled, japanese];
  });
  const context = {appDataDirectory: directory, setTokenizer: () => undefined} as unknown as Parameters<typeof loadLanguagePlugin>[1];
  await loadLanguagePlugin("no-such-plugin", context);
  await loadLanguagePlugin("no-such-plugin", context);
  assert.equal(asked, 2);

  const errors = console.error;
  console.error = () => undefined;
  try {
    setLanguageAssetRoots(async () => {
      throw new Error("the command is not there");
    });
    const result = await loadLanguagePlugin("no-such-plugin", context);
    assert.equal(result.ok, 0);
  } finally {
    console.error = errors;
    setLanguageAssetRoots(async () => [bundled]);
  }
});

test("Han Character Core loads without the WaniKani data, which only the Japanese pack carries", async () => {
  const {default: Japanese} = await import("../main/handler/japanese");
  const warn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    const missing = await Japanese.setupHanCharacterCore({
      importWanikaniKanji: path.join(directory, "no", "kanji.json"),
      importWanikaniRadical: path.join(directory, "no", "radical.json"),
      importBaseSVG: hanzi
    });
    assert.equal(missing, undefined);
    assert.deepEqual(Japanese.wanikanji, {});
    assert.deepEqual(Japanese.waniradical, {});
    await Japanese.setupHanCharacterCore({
      importWanikaniKanji: path.join(directory, "no", "kanji.json"),
      importWanikaniRadical: path.join(directory, "no", "radical.json"),
      importBaseSVG: hanzi
    });
    assert.equal(warnings.length, 1, "said once, not per load");
  } finally {
    console.warn = warn;
  }
  // Present data still loads.
  put(directory, "wk/kanji.json", "{\"日\": {\"level\": 1}}");
  put(directory, "wk/radical.json", "{}");
  await Japanese.setupHanCharacterCore({
    importWanikaniKanji: path.join(directory, "wk", "kanji.json"),
    importWanikaniRadical: path.join(directory, "wk", "radical.json"),
    importBaseSVG: hanzi
  });
  assert.deepEqual(Japanese.wanikanji, {"日": {level: 1}});
});
