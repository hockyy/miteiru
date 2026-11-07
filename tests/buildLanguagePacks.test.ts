import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {clearTableCaches, get, openTable, scan} from "../main/helpers/dataTable";
import {
  PACKS,
  assignFiles,
  buildLanguagePacks,
  checkPackKey,
  contentVersion,
  listFiles,
  packFileName,
  repositoryFrom,
  type PackManifest
} from "../scripts/data/buildLanguagePacks";

let directory: string;

/** A tiny language-assets tree: a few bytes per plugin folder, one file over a block, and files that no pack carries. */
const FILES: Record<string, Buffer> = {
  "japanese/asset-manifest.json": Buffer.from("{}"),
  "japanese/dict/base.dat.zst": Buffer.from("kuromoji"),
  "japanese/dict/jmdict.pack": crypto.createHash("sha256").update("a").digest(),
  "japanese/pitch/accents.json": Buffer.from("not in a pack"),
  "japanese/grammar/jp_grammar.json": Buffer.from("not in a pack"),
  "han-character-core/asset-manifest.json": Buffer.from("{}"),
  "han-character-core/kanji.pack": Buffer.from("kanji strokes"),
  "han-character-core/hanzi.pack": Buffer.from("hanzi strokes"),
  "han-character-core/wanikani/kanji.json.zst": Buffer.from("wanikani"),
  "han-character-core/wanikani/radical/bar.png": Buffer.from("png"),
  "mandarin/asset-manifest.json": Buffer.from("{}"),
  "mandarin/chinese/chinese.pack": Buffer.from("cedict 中国"),
  "cantonese/cantonese/cantodict.pack": Buffer.from("canto"),
  "vietnamese/vietnamese/vnedict.txt.zst": Buffer.from("nước")
};

/** Over a megabyte of bytes that do not compress, so the file has to sit alone in its block. */
const bigFile = () => {
  const out = Buffer.alloc(1_500_000);
  let seed = 7;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = seed >> 16;
  }
  return out;
};

const writeTree = (root: string, files: Record<string, Buffer>) => {
  for (const [relative, data] of Object.entries(files)) {
    const target = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, data);
  }
};

const sha = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");

before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-packs-test-"));
  writeTree(path.join(directory, "assets"), {...FILES, "japanese/dict/cc.dat.zst": bigFile()});
  fs.writeFileSync(path.join(directory, "assets", "japanese", ".DS_Store"), "finder");
});

after(() => {
  fs.rmSync(directory, {recursive: true, force: true});
});

const build = (name: string): PackManifest => buildLanguagePacks(path.join(directory, "assets"), path.join(directory, name), {appVersion: "9.9.9"});

test("every pack is built, and the files inside read back byte for byte", async () => {
  const manifest = build("out-a");
  assert.deepEqual(manifest.packs.map((pack) => pack.id), ["japanese", "hanzi", "mandarin", "cantonese", "vietnamese"]);
  const expected: Record<string, string[]> = {
    japanese: [
      "han-character-core/asset-manifest.json", "han-character-core/kanji.pack", "han-character-core/wanikani/kanji.json.zst",
      "han-character-core/wanikani/radical/bar.png", "japanese/asset-manifest.json", "japanese/dict/base.dat.zst",
      "japanese/dict/cc.dat.zst", "japanese/dict/jmdict.pack"
    ],
    hanzi: ["han-character-core/asset-manifest.json", "han-character-core/hanzi.pack"],
    mandarin: ["mandarin/asset-manifest.json", "mandarin/chinese/chinese.pack"],
    cantonese: ["cantonese/cantonese/cantodict.pack"],
    vietnamese: ["vietnamese/vietnamese/vnedict.txt.zst"]
  };
  const sources = {...FILES, "japanese/dict/cc.dat.zst": bigFile()};
  for (const pack of manifest.packs) {
    const file = path.join(directory, "out-a", pack.file);
    clearTableCaches();
    const {header} = await openTable(file);
    assert.equal(header.dataset, `language-pack/${pack.id}`);
    assert.equal(header.codec, "file");
    assert.equal(header.compression, "zstd");
    assert.match(header.version, /^[0-9a-f]{12}$/);
    assert.equal(header.entries, expected[pack.id].length);
    const entries = await scan(file);
    assert.deepEqual(entries.map(([key]) => key), expected[pack.id]);
    for (const [key, value] of entries) assert.ok(value.equals(sources[key as keyof typeof sources]), `${pack.id}: ${key}`);
    assert.ok((await get(file, expected[pack.id][0]))?.equals(sources[expected[pack.id][0] as keyof typeof sources]));
  }
});

test("a file over a block sits alone in its block", async () => {
  const {header} = await openTable(path.join(directory, "out-a", packFileName("japanese")));
  const big = header.blocks.find(([first]) => first === "japanese/dict/cc.dat.zst");
  assert.ok(big);
  assert.equal(big[3], 1);
  assert.ok(header.blocks.length >= 2);
});

test("the manifest matches the files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "out-a", "language-packs.json"), "utf8")) as PackManifest;
  assert.equal(manifest.format, 1);
  assert.equal(manifest.appVersion, "9.9.9");
  assert.equal(manifest.baseUrl, "https://github.com/hockyy/miteiru/releases/download/v9.9.9/");
  for (const pack of manifest.packs) {
    const bytes = fs.readFileSync(path.join(directory, "out-a", pack.file));
    assert.equal(pack.bytes, bytes.length);
    assert.equal(pack.sha256, sha(bytes));
    assert.equal(pack.file, `Miteiru-language-${pack.id}.mtrpack`);
    const definition = PACKS.find(({id}) => id === pack.id)!;
    assert.deepEqual(pack.plugins, definition.plugins);
    assert.deepEqual(pack.languages, definition.languages);
    assert.equal(pack.title, definition.title);
  }
});

test("building twice gives identical bytes, and the version follows the content, not the app version", async () => {
  build("out-b");
  const second = buildLanguagePacks(path.join(directory, "assets"), path.join(directory, "out-c"), {appVersion: "10.0.0", repository: "someone/else"});
  assert.equal(second.baseUrl, "https://github.com/someone/else/releases/download/v10.0.0/");
  for (const {file} of second.packs) {
    const a = fs.readFileSync(path.join(directory, "out-a", file));
    assert.ok(a.equals(fs.readFileSync(path.join(directory, "out-b", file))), `${file} differs between two builds`);
    assert.ok(a.equals(fs.readFileSync(path.join(directory, "out-c", file))), `${file} depends on the app version`);
  }
});

test("changing a file changes the version", () => {
  const a: Array<[string, Buffer]> = [["a", Buffer.from("1")], ["b", Buffer.from("2")]];
  assert.equal(contentVersion(a), contentVersion([...a].reverse()));
  assert.notEqual(contentVersion(a), contentVersion([["a", Buffer.from("1")], ["b", Buffer.from("3")]]));
  assert.notEqual(contentVersion(a), contentVersion([["a", Buffer.from("1")], ["c", Buffer.from("2")]]));
});

test("pitch, grammar and .DS_Store stay out of every pack", () => {
  const files = listFiles(path.join(directory, "assets"));
  assert.ok(files.includes("japanese/pitch/accents.json"));
  assert.ok(!files.some((file) => file.endsWith(".DS_Store")));
  const carried = [...assignFiles(files).values()].flat();
  assert.ok(!carried.some((file) => file.includes("/pitch/") || file.includes("/grammar/")));
});

test("a staged file that no pack carries fails the build", () => {
  const root = path.join(directory, "assets-new-data");
  writeTree(root, {...FILES, "han-character-core/new-strokes.pack": Buffer.from("new"), "korean/dict.pack": Buffer.from("new")});
  assert.throws(() => buildLanguagePacks(root, path.join(directory, "out-d"), {appVersion: "1.0.0"}), /han-character-core\/new-strokes\.pack, korean\/dict\.pack/);
});

test("a pack with no files fails the build", () => {
  const root = path.join(directory, "assets-no-vietnamese");
  const {"vietnamese/vietnamese/vnedict.txt.zst": _gone, ...rest} = FILES;
  void _gone;
  writeTree(root, rest);
  assert.throws(() => buildLanguagePacks(root, path.join(directory, "out-e"), {appVersion: "1.0.0"}), /vietnamese has no files/);
});

test("keys that are not plain relative paths are rejected", () => {
  for (const key of ["", "../x", "a/../x", "/x", "a\\b", "C:x", "a//b", "./a", "a/./b", "a/", "x".repeat(513)]) {
    assert.throws(() => checkPackKey(key), /Bad pack key/, JSON.stringify(key).slice(0, 40));
  }
  for (const key of ["a", "japanese/dict/base.dat.zst", "han-character-core/wanikani/radical/corn-2.png", "日本/語", "x".repeat(512)]) {
    assert.equal(checkPackKey(key), key);
  }
});

test("the repository slug comes from package.json's repository field", () => {
  assert.equal(repositoryFrom("https://github.com/owner/name.git"), "owner/name");
  assert.equal(repositoryFrom({type: "git", url: "git+https://github.com/owner/name.git"}), "owner/name");
  assert.equal(repositoryFrom("github:owner/name"), "owner/name");
  assert.equal(repositoryFrom("owner/name"), "owner/name");
  assert.equal(repositoryFrom(undefined), undefined);
});
