/*
 * Shrinks the language assets in a staged app directory (scripts/stageTauriResources.mjs) before
 * they are packed:
 *  - the stroke-order SVGs (21,000 small files, which made installing slow) go into one pack per
 *    set, `han-character-core/kanji.pack` and `hanzi.pack`, data tables (docs/DATA_FORMAT.md) built
 *    by scripts/data/buildStrokePacks.ts; the folder is removed, and with it the KanjiVG variants
 *    (`04e14-Kaisho.svg`) nothing can read;
 *  - each dictionary (JMdict, KANJIDIC, CC-CEDICT, CantoDict) becomes a table beside its JSON,
 *    `jmdict.pack` and so on, built by scripts/data/buildDictionaryTables.ts with the keys the
 *    first-load import used to write; the JSON is removed, and the app reads the table directly;
 *  - the other large files the main process or the Rust side reads (kuromoji's `.dat`, the jieba word
 *    lists, the Vietnamese dictionary, the WaniKani JSON) are zstd-compressed in place, `<name>`
 *    becoming `<name>.zst` (docs/DATA_FORMAT.md). kuromoji's files come gzipped in the asset
 *    download (`base.dat.gz`); they are decompressed first and stored as `base.dat.zst`.
 * Only files read by the main process through main/helpers/assetFiles.ts are listed; files the
 * renderer fetches by URL (pitch accents, grammar) and anything read another way stay plain.
 *
 * Also runnable by hand: node scripts/compressLanguageAssets.js [appDirectory]
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');

// Directory (under language-assets) → the files in it to compress. Add a file here only if the
// main process reads it through readAsset/readTextAsset or Rust through sys::fs::read_asset.
// A target's name is the plain one; a gzipped source (`name.gz`) is accepted too, for kuromoji.
const TARGETS = [
  ['japanese/dict', (name) => /^[a-z_]+.dat$/.test(name)],
  ['mandarin/chinese', (name) => name === 'zh.jieba.txt'],
  ['cantonese/cantonese', (name) => name === 'yue.jieba.txt'],
  ['vietnamese/vietnamese', (name) => name === 'vnedict.txt'],
  ['han-character-core/wanikani', (name) => name === 'kanji.json' || name === 'radical.json'],
];

const GZIP_SUFFIX = '.gz';
const ZSTD_SUFFIX = '.zst';
// Level 19 with a 128 MB window and long-distance matching: kuromoji's files repeat across a long
// distance, and the app's decoder (the zstd crate) accepts windows up to 128 MB.
const ZSTD_OPTIONS = {params: {
  [zlib.constants.ZSTD_c_compressionLevel]: 19,
  [zlib.constants.ZSTD_c_windowLog]: 27,
  [zlib.constants.ZSTD_c_enableLongDistanceMatching]: 1,
}};

// Builds the stroke tables with the TypeScript builder (run through tsx, from the repo root so the
// import resolves). Without the stroke folders (none staged, or already packed) nothing changes.
const packStrokes = (root) => {
  const result = {files: 0, before: 0, after: 0};
  const repo = path.resolve(__dirname, '..');
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', path.join(__dirname, 'data', 'buildStrokePacks.ts'), root],
    {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 20}
  );
  const megabytes = (bytes) => (bytes / 1048576).toFixed(2);
  const lastLine = output.trim().split(/\r?\n/).pop();
  for (const set of JSON.parse(lastLine)) {
    console.log(`[compressLanguageAssets] ${set.folder}.pack: ${set.files} files, ${megabytes(set.rawBytes)} MB -> ${megabytes(set.packBytes)} MB, ${set.fallbacks} stored as plain text`);
    result.files += set.files;
    result.before += set.rawBytes;
    result.after += set.packBytes;
  }
  return result;
};

// Builds the dictionary tables the same way. The builder holds a whole dictionary in memory
// (CC-CEDICT's substring index is 1.3 million keys), so it gets a larger heap than the default.
const packDictionaries = (root) => {
  const result = {files: 0, before: 0, after: 0};
  const repo = path.resolve(__dirname, '..');
  const output = execFileSync(
    process.execPath,
    ['--max-old-space-size=8192', '--import', 'tsx', path.join(__dirname, 'data', 'buildDictionaryTables.ts'), root],
    {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 20}
  );
  const megabytes = (bytes) => (bytes / 1048576).toFixed(2);
  const lastLine = output.trim().split(/\r?\n/).pop();
  for (const table of JSON.parse(lastLine)) {
    console.log(`[compressLanguageAssets] ${table.table}: ${table.entries} entries, ${table.blocks} blocks, ${megabytes(table.rawBytes)} MB JSON -> ${megabytes(table.packBytes)} MB`);
    result.files++;
    result.before += table.rawBytes;
    result.after += table.packBytes;
  }
  return result;
};

// Sources to compress in a directory: the plain name, read from the plain file or its `.gz`.
const sourcesIn = (names, isTarget) => {
  const sources = new Map();
  for (const name of names) {
    if (isTarget(name)) sources.set(name, name);
    else if (name.endsWith(GZIP_SUFFIX) && isTarget(name.slice(0, -GZIP_SUFFIX.length))) {
      if (!sources.has(name.slice(0, -GZIP_SUFFIX.length))) sources.set(name.slice(0, -GZIP_SUFFIX.length), name);
    }
  }
  return sources;
};

const compressDirectory = (directory, isTarget) => {
  const result = {files: 0, before: 0, after: 0};
  if (!fs.existsSync(directory)) return result;
  const names = fs.readdirSync(directory);
  const sources = sourcesIn(names.filter((name) => fs.statSync(path.join(directory, name)).isFile()), isTarget);

  // A fresh export brought plain or gzipped files back: drop compressed copies of assets that no
  // longer exist. (When there are no sources, this is a repeat run for another architecture and
  // everything is kept.)
  if (sources.size > 0) {
    for (const name of names) {
      if (name.endsWith(ZSTD_SUFFIX) && isTarget(name.slice(0, -ZSTD_SUFFIX.length)) && !sources.has(name.slice(0, -ZSTD_SUFFIX.length))) {
        fs.unlinkSync(path.join(directory, name));
      }
    }
  }

  for (const [plainName, sourceName] of sources) {
    const source = path.join(directory, sourceName);
    const stored = fs.readFileSync(source);
    const contents = sourceName.endsWith(GZIP_SUFFIX) ? zlib.gunzipSync(stored) : stored;
    const compressed = zlib.zstdCompressSync(contents, ZSTD_OPTIONS);
    if (!zlib.zstdDecompressSync(compressed).equals(contents)) throw new Error(`zstd round trip failed for ${source}`);
    const target = path.join(directory, plainName + ZSTD_SUFFIX);
    fs.writeFileSync(target, compressed);
    // Nothing but the zstd copy stays in the stage: not the plain file, not the gzipped one.
    for (const old of [path.join(directory, plainName), path.join(directory, plainName + GZIP_SUFFIX)]) {
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    result.files++;
    result.before += contents.length;
    result.after += compressed.length;
    console.log(`[compressLanguageAssets] ${path.relative(directory, target).padEnd(18)} ${path.basename(directory)}: ${(contents.length / 1048576).toFixed(2)} MB (${(stored.length / 1048576).toFixed(2)} MB as stored) -> ${(compressed.length / 1048576).toFixed(2)} MB`);
  }
  return result;
};

const compressLanguageAssets = (appDirectory) => {
  const totals = {files: 0, before: 0, after: 0};
  const root = path.join(appDirectory, 'language-assets');
  if (!fs.existsSync(root)) {
    // Packaging without the asset download still works; the app just has no dictionaries.
    console.warn(`[compressLanguageAssets] No language assets in ${root}; nothing to compress.`);
    return totals;
  }
  const tally = (result) => {
    totals.files += result.files;
    totals.before += result.before;
    totals.after += result.after;
  };
  tally(packStrokes(root));
  tally(packDictionaries(root));
  for (const [relative, isTarget] of TARGETS) {
    const result = compressDirectory(path.join(root, relative), isTarget);
    tally(result);
  }
  const megabytes = (bytes) => (bytes / 1048576).toFixed(1);
  console.log(`[compressLanguageAssets] ${totals.files} files: ${megabytes(totals.before)} MB -> ${megabytes(totals.after)} MB`);
  return totals;
};

module.exports = {compressLanguageAssets};

if (require.main === module) {
  compressLanguageAssets(path.resolve(process.argv[2] ?? 'app'));
}
