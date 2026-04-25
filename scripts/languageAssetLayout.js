const fs = require('fs');
const path = require('path');

const moves = [
  ['kanji', 'language-assets/han-character-core/kanji'],
  ['hanzi', 'language-assets/han-character-core/hanzi'],
  ['wanikani', 'language-assets/han-character-core/wanikani'],
  ['dict', 'language-assets/japanese/dict'],
  ['chinese', 'language-assets/mandarin/chinese'],
  ['cantonese', 'language-assets/cantonese/cantonese'],
  ['vietnamese', 'language-assets/vietnamese/vietnamese']
];

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
};

const moveDirectoryIfNeeded = (source, target) => {
  if (!fs.existsSync(source) || fs.existsSync(target)) return;

  ensureDirectory(path.dirname(target));
  fs.renameSync(source, target);
  console.log(`Moved ${source} -> ${target}`);
};

const migrateLanguageAssets = (publicDirectory) => {
  ensureDirectory(path.join(publicDirectory, 'language-assets'));

  for (const [legacyRelativePath, pluginRelativePath] of moves) {
    moveDirectoryIfNeeded(
      path.join(publicDirectory, legacyRelativePath),
      path.join(publicDirectory, pluginRelativePath)
    );
  }
};

module.exports = {
  migrateLanguageAssets
};
