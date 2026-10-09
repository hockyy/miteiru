/*
 * electron-builder beforePack hook (buildConfig/base.config.json): gzips the large language assets in
 * app/language-assets before they are packed, replacing each file with `<name>.gz`. Only files read
 * by the main process through main/helpers/assetFiles.ts are listed; files the renderer fetches by URL
 * (pitch accents, grammar) and anything read another way stay plain.
 *
 * Also runnable by hand: node scripts/compressLanguageAssets.js [appDirectory]
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Directory (under language-assets) → the files in it to compress. Add a file here only if the
// main process reads it through readAsset/readTextAsset/readAssetSync.
const TARGETS = [
  ['han-character-core/hanzi', (name) => /^[0-9a-f]+\.svg$/i.test(name)],
  ['han-character-core/kanji', (name) => /^[0-9a-f]+\.svg$/i.test(name)],
  ['japanese/dict', (name) => ['jmdict.json', 'kanjidic.json'].includes(name)],
  ['mandarin/chinese', (name) => ['chinese.json', 'zh.jieba.txt'].includes(name)],
  ['cantonese/cantonese', (name) => ['cantodict.json', 'yue.jieba.txt'].includes(name)],
];

const GZIP_SUFFIX = '.gz';

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
    const compressed = zlib.gzipSync(contents, {level: zlib.constants.Z_BEST_COMPRESSION});
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
  for (const [relative, isTarget] of TARGETS) {
    const result = compressDirectory(path.join(root, relative), isTarget);
    totals.files += result.files;
    totals.before += result.before;
    totals.after += result.after;
  }
  const megabytes = (bytes) => (bytes / 1048576).toFixed(1);
  console.log(`[compressLanguageAssets] ${totals.files} files: ${megabytes(totals.before)} MB -> ${megabytes(totals.after)} MB`);
  return totals;
};

// electron-builder calls the default export with the pack context; projectDir holds app/.
module.exports = async (context) => {
  compressLanguageAssets(path.join(context.packager.projectDir, 'app'));
};
module.exports.compressLanguageAssets = compressLanguageAssets;

if (require.main === module) {
  compressLanguageAssets(path.resolve(process.argv[2] ?? 'app'));
}
