const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');

const archiveRoot = path.join(__dirname, '../archived/language-assets');
const languageAssetsRoot = path.join(__dirname, '../renderer/public/language-assets');

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
};

const getAssetArchives = (requestedPluginIds = []) => {
  if (!fs.existsSync(archiveRoot)) return [];

  return fs.readdirSync(archiveRoot)
  .map((entry) => {
    const match = entry.match(/^(.+)-assets\.zip$/);
    if (!match) return null;

    return {
      pluginId: match[1],
      archivePath: path.join(archiveRoot, entry)
    };
  })
  .filter(Boolean)
  .filter(({pluginId}) => requestedPluginIds.length === 0 || requestedPluginIds.includes(pluginId))
  .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
};

const unpackPluginAssets = async ({pluginId, archivePath}) => {
  const targetDirectory = path.join(languageAssetsRoot, pluginId);

  fs.rmSync(targetDirectory, {recursive: true, force: true});
  ensureDirectory(targetDirectory);
  await extract(archivePath, {dir: targetDirectory});
  console.log(`Extracted ${archivePath} -> ${targetDirectory}`);
};

const run = async (requestedPluginIds = process.argv.slice(2)) => {
  ensureDirectory(languageAssetsRoot);
  const archives = getAssetArchives(requestedPluginIds);

  if (archives.length === 0) {
    const suffix = requestedPluginIds.length > 0 ? ` for: ${requestedPluginIds.join(', ')}` : '';
    console.log(`No language asset archives found${suffix}.`);
    return;
  }

  for (const archive of archives) {
    await unpackPluginAssets(archive);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  run
};
