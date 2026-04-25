const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const {migrateLanguageAssets} = require('./languageAssetLayout');

const languageAssetsRoot = path.join(__dirname, '../renderer/public/language-assets');
const archiveRoot = path.join(__dirname, '../archived/language-assets');

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
};

const getPluginDirectories = () => {
  if (!fs.existsSync(languageAssetsRoot)) return [];

  return fs.readdirSync(languageAssetsRoot)
  .map((entry) => path.join(languageAssetsRoot, entry))
  .filter((entryPath) => fs.statSync(entryPath).isDirectory());
};

const packPluginAssets = (pluginDirectory) => {
  const pluginId = path.basename(pluginDirectory);
  const targetZip = path.join(archiveRoot, `${pluginId}-assets.zip`);

  ensureDirectory(archiveRoot);

  const output = fs.createWriteStream(targetZip);
  const archive = archiver('zip', {
    zlib: {level: 9}
  });

  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') {
      console.warn('Warning:', error);
      return;
    }
    throw error;
  });

  archive.on('error', (error) => {
    throw error;
  });

  archive.pipe(output);
  archive.directory(pluginDirectory, false);
  archive.finalize();

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Packed ${pluginId} -> ${targetZip}`);
      resolve();
    });
    output.on('error', reject);
  });
};

const run = async () => {
  migrateLanguageAssets(path.join(__dirname, '../renderer/public'));
  ensureDirectory(archiveRoot);
  const pluginDirectories = getPluginDirectories();

  if (pluginDirectories.length === 0) {
    console.log('No language asset plugins found.');
    return;
  }

  for (const pluginDirectory of pluginDirectories) {
    await packPluginAssets(pluginDirectory);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
