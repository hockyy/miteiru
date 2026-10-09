/*
 * electron-builder beforePack hook (buildConfig/base.config.json): gzips the large language assets in
 * app/language-assets before they are packed, replacing each file with `<name>.gz`. Only the main
 * process reads these, through main/helpers/assetFiles.ts, which accepts either form. Files the
 * renderer fetches by URL (pitch accents, grammar) are left alone.
 *
 * Also runnable by hand: node scripts/compressLanguageAssets.js [appDirectory]
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Directory (under language-assets) → which of its files to compress.
const TARGETS = [
  ['han-character-core/hanzi', /\.svg$/i],
  ['han-character-core/kanji', /\.svg$/i],
  ['japanese/dict', /^(jmdict|kanjidic)\.json$/i],
  ['mandarin/chinese', /\.(json|txt)$/i],
  ['cantonese/cantonese', /\.(json|txt)$/i],
];

const compressDirectory = (directory, pattern) => {
  let files = 0;
  let before = 0;
  let after = 0;
  if (!fs.existsSync(directory)) return {files, before, after};
  for (const name of fs.readdirSync(directory)) {
    if (!pattern.test(name)) continue;
    const source = path.join(directory, name);
    if (!fs.statSync(source).isFile()) continue;
    const contents = fs.readFileSync(source);
    const compressed = zlib.gzipSync(contents, {level: zlib.constants.Z_BEST_COMPRESSION});
    fs.writeFileSync(source + '.gz', compressed);
    fs.unlinkSync(source);
    files++;
    before += contents.length;
    after += compressed.length;
  }
  return {files, before, after};
};

const compressLanguageAssets = (appDirectory) => {
  const root = path.join(appDirectory, 'language-assets');
  if (!fs.existsSync(root)) {
    throw new Error(`No language assets in ${root}; run the build (and download the assets) first.`);
  }
  const totals = {files: 0, before: 0, after: 0};
  for (const [relative, pattern] of TARGETS) {
    const result = compressDirectory(path.join(root, relative), pattern);
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
