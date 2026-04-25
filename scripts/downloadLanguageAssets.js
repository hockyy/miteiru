const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {run: unpackLanguageAssets} = require('./unpackLanguageAssets');

const releaseApiUrl = 'https://api.github.com/repos/hockyy/miteiru/releases/tags/assets';
const archiveRoot = path.join(__dirname, '../archived/language-assets');
const requestedPluginIds = process.argv.slice(2);
const forceDownload = process.env.MITEIRU_FORCE_ASSET_DOWNLOAD === '1';

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
};

const getPluginIdFromAssetName = (assetName) => {
  const match = assetName.match(/^(.+)-assets\.zip$/);
  return match ? match[1] : null;
};

const getReleaseAssets = async () => {
  const response = await axios.get(releaseApiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'miteiru-language-assets'
    }
  });

  return response.data.assets ?? [];
};

const getLanguageAssetDownloads = async () => {
  const assets = await getReleaseAssets();

  return assets
  .map((asset) => ({
    pluginId: getPluginIdFromAssetName(asset.name),
    name: asset.name,
    size: asset.size,
    url: asset.browser_download_url
  }))
  .filter((asset) => asset.pluginId)
  .filter(({pluginId}) => requestedPluginIds.length === 0 || requestedPluginIds.includes(pluginId))
  .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
};

const downloadAsset = async ({name, size, url}) => {
  const targetPath = path.join(archiveRoot, name);
  if (!forceDownload && fs.existsSync(targetPath)) {
    console.log(`Using existing ${targetPath}`);
    return;
  }

  const temporaryPath = `${targetPath}.download`;
  fs.rmSync(temporaryPath, {force: true});
  console.log(`Downloading ${name}${size ? ` (${(size / 1024 / 1024).toFixed(1)} MB)` : ''}...`);

  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(temporaryPath);
  const totalLength = Number(response.headers['content-length'] ?? size ?? 0);
  let downloadedLength = 0;

  response.data.on('data', (chunk) => {
    downloadedLength += chunk.length;
    if (!totalLength) return;

    const progress = (downloadedLength / totalLength * 100).toFixed(1);
    process.stdout.write(`Downloading ${name}: ${progress}%\r`);
  });

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  fs.renameSync(temporaryPath, targetPath);
  process.stdout.write('\n');
  console.log(`Saved ${targetPath}`);
};

const run = async () => {
  ensureDirectory(archiveRoot);
  const downloads = await getLanguageAssetDownloads();

  if (downloads.length === 0) {
    const suffix = requestedPluginIds.length > 0 ? ` for: ${requestedPluginIds.join(', ')}` : '';
    throw new Error(`No language assets found in release${suffix}.`);
  }

  for (const asset of downloads) {
    await downloadAsset(asset);
  }

  await unpackLanguageAssets(requestedPluginIds);
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
