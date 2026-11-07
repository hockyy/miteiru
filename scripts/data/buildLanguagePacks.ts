/*
 * Builds the language packs (docs/DATA_FORMAT.md, "Language packs"): the staged, compressed
 * language-assets folder cut into five downloads, `Miteiru-language-<id>.mtrpack`, and the manifest
 * `language-packs.json` the app reads to know what exists. A pack is an MTRPACK2 table with codec
 * `file`: the key is a file's path under language-assets/, the value is its bytes.
 *
 *   npx tsx scripts/data/buildLanguagePacks.ts [language-assets directory] [output directory]
 *
 * With no arguments, `npm run build:language-packs` stages and compresses renderer/public/language-assets
 * itself (see the bottom of this file) and writes to dist/language-packs/.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {writeTable, type TableFields} from "./writeTable";

export interface PackDefinition {
  id: string;
  title: string;
  /** Language plugin ids (renderer/languages/manifest.ts `pluginId`) the pack serves. */
  languages: string[];
  /** The language-assets folders the pack fills; a build that carries all of them counts as bundling it. */
  plugins: string[];
  /** Paths under language-assets/: a trailing "/" takes a whole folder, anything else is one file. */
  include: string[];
}

/** Staged files that no pack carries, on purpose. The page fetches these from its own export. */
export const EXCLUDED = ["japanese/pitch/", "japanese/grammar/"];

export const PACKS: PackDefinition[] = [
  {
    id: "japanese",
    title: "Japanese",
    languages: ["japanese-kuromoji"],
    plugins: ["japanese", "han-character-core"],
    include: ["japanese/", "han-character-core/kanji.pack", "han-character-core/wanikani/", "han-character-core/asset-manifest.json"]
  },
  {
    id: "hanzi",
    title: "Chinese character strokes",
    languages: ["mandarin-jieba", "cantonese-jieba"],
    plugins: ["han-character-core"],
    include: ["han-character-core/hanzi.pack", "han-character-core/asset-manifest.json"]
  },
  {id: "mandarin", title: "Chinese (Mandarin)", languages: ["mandarin-jieba"], plugins: ["mandarin"], include: ["mandarin/"]},
  {id: "cantonese", title: "Cantonese", languages: ["cantonese-jieba"], plugins: ["cantonese"], include: ["cantonese/"]},
  {id: "vietnamese", title: "Vietnamese", languages: ["vietnamese"], plugins: ["vietnamese"], include: ["vietnamese/"]}
];

export const PACK_DATASET_PREFIX = "language-pack/";
export const MANIFEST_NAME = "language-packs.json";
/** The contents are already compressed, so a cheap level; about 1 MB blocks keep a single read small. */
const PACK_LEVEL = 3;
const BLOCK_BYTES = 1024 * 1024;
const MAX_KEY_BYTES = 512;
/** Finder litter in the downloaded archives. */
const IGNORED_NAMES = new Set([".DS_Store"]);

export const packFileName = (id: string) => `Miteiru-language-${id}.mtrpack`;

/** The rules the app applies when it unpacks (src-tauri/src/sys/langpack.rs): a key is a plain relative path. */
export const checkPackKey = (key: string) => {
  const bad = (why: string) => new Error(`Bad pack key ${JSON.stringify(key)}: ${why}`);
  if (key.length === 0) throw bad("empty");
  if (Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES) throw bad(`longer than ${MAX_KEY_BYTES} bytes`);
  if (key.includes("\\")) throw bad("has a backslash");
  if (key.includes(":")) throw bad("has a colon");
  if (key.startsWith("/")) throw bad("is absolute");
  for (const segment of key.split("/")) {
    if (segment === "" || segment === "." || segment === "..") throw bad("has an empty, . or .. segment");
  }
  return key;
};

/** Every file under `root` as a "/"-separated relative path, sorted by those bytes. */
export const listFiles = (root: string): string[] => {
  const found: string[] = [];
  const walk = (directory: string, prefix: string) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), `${relative}/`);
      else if (entry.isFile()) found.push(relative);
    }
  };
  walk(root, "");
  return found.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
};

const matches = (patterns: string[], file: string) => patterns.some((pattern) => (
  pattern.endsWith("/") ? file.startsWith(pattern) : file === pattern
));

/** Which files each pack carries. Throws when a file is in no pack and not excluded: new data must not be left out silently. */
export const assignFiles = (files: string[], packs: PackDefinition[] = PACKS, excluded: string[] = EXCLUDED): Map<string, string[]> => {
  const assigned = new Map(packs.map((pack) => [pack.id, [] as string[]]));
  const orphans: string[] = [];
  for (const file of files) {
    if (matches(excluded, file)) continue;
    const owners = packs.filter((pack) => matches(pack.include, file));
    if (owners.length === 0) orphans.push(file);
    for (const owner of owners) assigned.get(owner.id)!.push(file);
  }
  if (orphans.length > 0) {
    const shown = orphans.slice(0, 10).join(", ") + (orphans.length > 10 ? `, and ${orphans.length - 10} more` : "");
    throw new Error(`Files in no language pack: ${shown}. Add them to a pack in scripts/data/buildLanguagePacks.ts, or to EXCLUDED.`);
  }
  return assigned;
};

const sha256 = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");

/** The pack's version: the first 12 hex digits of a hash of its sorted (key, hash of value) list, so unchanged data keeps its version and its bytes. */
export const contentVersion = (entries: Array<[string, Buffer]>) => {
  const hash = crypto.createHash("sha256");
  const sorted = [...entries].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  for (const [key, value] of sorted) hash.update(`${key}\0${sha256(value)}\n`);
  return hash.digest("hex").slice(0, 12);
};

export interface BuiltPack {
  id: string;
  title: string;
  file: string;
  bytes: number;
  sha256: string;
  plugins: string[];
  languages: string[];
}

export interface PackManifest {
  format: 1;
  appVersion: string;
  baseUrl: string;
  packs: BuiltPack[];
}

export const buildPack = (assetsRoot: string, outputDirectory: string, pack: PackDefinition, files: string[]): BuiltPack => {
  if (files.length === 0) throw new Error(`Language pack ${pack.id} has no files in ${assetsRoot}`);
  const entries = files.map((file): [string, Buffer] => [checkPackKey(file), fs.readFileSync(path.join(assetsRoot, ...file.split("/")))]);
  const fields: TableFields = {
    dataset: PACK_DATASET_PREFIX + pack.id,
    version: contentVersion(entries),
    codec: "file",
    source: {
      name: `Miteiru language pack: ${pack.title}`,
      url: "https://github.com/hockyy/miteiru/blob/main/docs/DATA_FORMAT.md",
      license: "Each table inside carries its own source and licence in its header."
    }
  };
  const file = packFileName(pack.id);
  const target = path.join(outputDirectory, file);
  writeTable(target, fields, entries, {blockBytes: BLOCK_BYTES, soloBytes: BLOCK_BYTES, level: PACK_LEVEL});
  const bytes = fs.readFileSync(target);
  return {id: pack.id, title: pack.title, file, bytes: bytes.length, sha256: sha256(bytes), plugins: pack.plugins, languages: pack.languages};
};

export interface BuildOptions {
  appVersion: string;
  /** "owner/name" on GitHub, where the release assets live. */
  repository?: string;
  packs?: PackDefinition[];
  excluded?: string[];
}

export const DEFAULT_REPOSITORY = "hockyy/miteiru";

/** The "owner/name" in package.json's `repository` field (a string or {url}), when it names a GitHub repository. */
export const repositoryFrom = (field: unknown): string | undefined => {
  const url = typeof field === "string" ? field : (field as { url?: unknown } | null | undefined)?.url;
  if (typeof url !== "string") return undefined;
  return /^(?:github:)?(?:.*github\.com[/:])?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1];
};

/** Builds every pack from `assetsRoot` into `outputDirectory`, writes the manifest beside them and returns it. */
export const buildLanguagePacks = (assetsRoot: string, outputDirectory: string, options: BuildOptions): PackManifest => {
  const packs = options.packs ?? PACKS;
  const assigned = assignFiles(listFiles(assetsRoot), packs, options.excluded ?? EXCLUDED);
  fs.mkdirSync(outputDirectory, {recursive: true});
  const built = packs.map((pack) => buildPack(assetsRoot, outputDirectory, pack, assigned.get(pack.id)!));
  const manifest: PackManifest = {
    format: 1,
    appVersion: options.appVersion,
    baseUrl: `https://github.com/${options.repository ?? DEFAULT_REPOSITORY}/releases/download/v${options.appVersion}/`,
    packs: built
  };
  fs.writeFileSync(path.join(outputDirectory, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

const repoRoot = path.resolve(__dirname, "..", "..");

/** The command line: stage and compress the downloaded assets in a temp folder, then build the packs. */
const stageAndBuild = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {compressLanguageAssets} = require("../compressLanguageAssets.js") as { compressLanguageAssets: (appDirectory: string) => void };
  const source = path.join(repoRoot, "renderer", "public", "language-assets");
  if (!fs.existsSync(source)) throw new Error(`No language assets in ${source}; run npm run script:download-language-assets first.`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-language-packs-"));
  try {
    fs.cpSync(source, path.join(stage, "language-assets"), {recursive: true, filter: (name) => !IGNORED_NAMES.has(path.basename(name))});
    compressLanguageAssets(stage);
    return buildFromArguments(path.join(stage, "language-assets"), path.join(repoRoot, "dist", "language-packs"));
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
};

const buildFromArguments = (assetsRoot: string, outputDirectory: string) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string; repository?: unknown };
  const manifest = buildLanguagePacks(assetsRoot, outputDirectory, {appVersion: packageJson.version, repository: repositoryFrom(packageJson.repository)});
  for (const pack of manifest.packs) {
    console.log(`[buildLanguagePacks] ${pack.file}: ${(pack.bytes / 1048576).toFixed(2)} MB, sha256 ${pack.sha256}`);
  }
  console.log(`[buildLanguagePacks] wrote ${path.join(outputDirectory, MANIFEST_NAME)}`);
  return manifest;
};

if (require.main === module) {
  const [assets, output] = process.argv.slice(2);
  try {
    if (assets) buildFromArguments(path.resolve(assets), path.resolve(output ?? path.join(repoRoot, "dist", "language-packs")));
    else stageAndBuild();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
