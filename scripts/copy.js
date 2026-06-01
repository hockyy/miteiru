const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, '../renderer', 'public');
const destDir = path.join(__dirname, '../app');

// Core paths that must exist in modern setups.
const requiredPaths = [
  'images',
  'language-assets'
];

// Legacy paths are still copied when present in renderer/public,
// but we do not warn when they are absent.
const legacyPaths = [
  'dict',
  'kanji',
  'wanikani',
  'cantonese',
  'chinese',
  'hanzi',
  'vietnamese'
];

const importantPaths = [...requiredPaths, ...legacyPaths];

const readJsonIfExists = async (targetPath) => {
  if (!(await fs.pathExists(targetPath))) return null;
  try {
    return await fs.readJson(targetPath);
  } catch {
    return null;
  }
};

const hasMissingManifestAssets = async (sourceLanguageAssetsDir, destLanguageAssetsDir) => {
  if (!(await fs.pathExists(sourceLanguageAssetsDir)) || !(await fs.pathExists(destLanguageAssetsDir))) {
    return true;
  }

  const pluginIds = await fs.readdir(sourceLanguageAssetsDir);
  for (const pluginId of pluginIds) {
    const sourcePluginDir = path.join(sourceLanguageAssetsDir, pluginId);
    const sourceStat = await fs.stat(sourcePluginDir);
    if (!sourceStat.isDirectory()) continue;

    const manifest = await readJsonIfExists(path.join(sourcePluginDir, 'asset-manifest.json'));
    if (!manifest) continue;

    for (const relativeAssetPath of manifest.files ?? []) {
      const sourceAssetPath = path.join(sourcePluginDir, relativeAssetPath);
      const destAssetPath = path.join(destLanguageAssetsDir, pluginId, relativeAssetPath);
      if (!(await fs.pathExists(sourceAssetPath)) || !(await fs.pathExists(destAssetPath))) {
        return true;
      }
    }
  }

  return false;
};

const compareShallow = async (source, dest) => {
  const sourceFiles = await fs.readdir(source);
  const destFiles = await fs.readdir(dest);
  if (sourceFiles.length !== destFiles.length) return false;
  return !(await hasMissingManifestAssets(source, dest));

}

// Function to compare directories
const compareDirectories = async (source, dest) => {
  const sourceFiles = await fs.readdir(source);
  // console.log(sourceFiles)
  let isSame = true;
  for (const file of sourceFiles) {
    if (importantPaths.includes(file)) {
      // console.log(file)
      const sourceStat = await fs.stat(path.join(source, file));

      const destFilePath = path.join(dest, file);

      // Check if the destination file or directory exists
      const destExists = await fs.pathExists(destFilePath);
      if (!destExists) {
        // If it's a directory, create it
        if (sourceStat.isDirectory()) {
          await fs.mkdir(destFilePath, {recursive: true});
          console.log(`Created missing directory: ${destFilePath}`);
        } else {
          // Handle the case for files differently if needed
          console.log(`Missing file at destination: ${destFilePath}`);
          isSame = false;
          continue;
        }
      }
      const destStat = await fs.stat(destFilePath);

      if (sourceStat.isDirectory() && destStat.isDirectory()) {
        if (!(await compareShallow(path.join(source, file),
            path.join(dest, file)))) {
          console.log(`${file} is different`)
          isSame = false;
          fs.rmSync(path.join(dest, file), {recursive: true, force: true});
        }
      } else if (sourceStat.size !== destStat.size) {
        console.log(`${file} is different`)
        isSame = false;
        fs.rmSync(path.join(dest, file), {recursive: true, force: true});
      }
    }
  }

  return isSame;
};

// Function to check if important paths exist
const checkImportantPaths = async (source) => {
  for (const p of requiredPaths) {
    const fullPath = path.join(source, p);
    const sourcePath = path.join(sourceDir, p);
    if ((await fs.pathExists(sourcePath)) && !(await fs.pathExists(fullPath))) {
      console.warn(`Warning: ${fullPath} is missing!`);
    }
  }
};

// Function to copy directory if needed
const copyIfRequired = async () => {
  // Check if destination directory exists
  if (await fs.pathExists(destDir)) {
    // Compare the directories
    if (await compareDirectories(sourceDir, destDir)) {
      console.log('Directories match. No need to copy.');
      await checkImportantPaths(destDir);
      return;
    }
  }

  // Copy the directories
  fs.copy(sourceDir, destDir)
  .then(() => {
    console.log('Files copied successfully!');
    checkImportantPaths(destDir);
  })
  .catch(err => console.error(err));
};

copyIfRequired();
