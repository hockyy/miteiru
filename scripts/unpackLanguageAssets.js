const fs = require('fs');
const path = require('path');
const os = require('os');
const {execFile} = require('child_process');

const archiveRoot = path.join(__dirname, '../archived/language-assets');
const languageAssetsRoot = path.join(__dirname, '../renderer/public/language-assets');

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
};

const runCommand = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, (error, stdout, stderr) => {
    if (error) {
      const details = [stderr, stdout].filter(Boolean).join('\n').trim();
      reject(new Error(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`));
      return;
    }
    resolve();
  });
});

const unpackArchive = async (archivePath, targetDirectory) => {
  if (os.platform() === 'win32') {
    await runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${targetDirectory.replace(/'/g, "''")}' -Force`
    ]);
    return;
  }

  await runCommand('unzip', ['-o', '-q', archivePath, '-d', targetDirectory]);
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const assertManifestFilesExist = (targetDirectory) => {
  const manifestPath = path.join(targetDirectory, 'asset-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`asset-manifest.json is missing in ${targetDirectory}`);
  }

  const manifest = readJson(manifestPath);
  for (const relativePath of manifest.files ?? []) {
    const expectedPath = path.join(targetDirectory, relativePath);
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Missing extracted path ${expectedPath} from ${manifestPath}`);
    }
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
  await unpackArchive(archivePath, targetDirectory);
  assertManifestFilesExist(targetDirectory);
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
