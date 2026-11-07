/*
 * Shrinks the language assets in a staged app directory (scripts/stageTauriResources.mjs) before
 * they are packed:
 *  - the stroke-order SVGs (21,000 small files, which made installing slow) go into one pack per
 *    set, `han-character-core/kanji.pack` and `hanzi.pack`, data tables (docs/DATA_FORMAT.md) built
 *    by scripts/data/buildStrokePacks.ts; the folder is removed, and with it the KanjiVG variants
 *    (`04e14-Kaisho.svg`) nothing can read;
 *  - the large dictionary files are gzipped in place, `<name>` becoming `<name>.gz`.
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
// main process reads it through readAsset/readTextAsset/readAssetSync.
const TARGETS = [
  ['japanese/dict', (name) => ['jmdict.json', 'kanjidic.json'].includes(name)],
  ['mandarin/chinese', (name) => ['chinese.json', 'zh.jieba.txt'].includes(name)],
  ['cantonese/cantonese', (name) => ['cantodict.json', 'yue.jieba.txt'].includes(name)],
];

const GZIP_SUFFIX = '.gz';
const GZIP_OPTIONS = {level: zlib.constants.Z_BEST_COMPRESSION};

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

const compressDirectory = (directory, isTarget) => {
  const result = {files: 0, before: 0, after: 0};
  if (!fs.existsSync(directory)) return result;
  const names = fs.readdirSync(directory);
  const plain = names.filter((name) => isTarget(name) && fs.statSync(path.join(directory, name)).isFile());

  // A fresh export brought plain files back: drop compressed copies of assets that no longer exist.
  // (When nothing is plain, this is a repeat run for another architecture and everything is kept.)
  if (plain.length > 0) {
    for (const name of names) {
      if (name.endsWith(GZIP_SUFFIX) && isTarget(name.slice(0, -GZIP_SUFFIX.length)) && !plain.includes(name.slice(0, -GZIP_SUFFIX.length))) {
        fs.unlinkSync(path.join(directory, name));
      }
    }
  }

  for (const name of plain) {
    const source = path.join(directory, name);
    const contents = fs.readFileSync(source);
    const compressed = zlib.gzipSync(contents, GZIP_OPTIONS);
    fs.writeFileSync(source + GZIP_SUFFIX, compressed);
    fs.unlinkSync(source);
    result.files++;
    result.before += contents.length;
    result.after += compressed.length;
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
