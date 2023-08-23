const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, '../renderer', 'public');
const destDir = path.join(__dirname, '../app');

// List of important directories or files to check
const importantPaths = [
  'dict',
  'kanji',
  'wanikani',
  'images',
];

const compareShallow = async (source, dest) => {
  const sourceFiles = await fs.readdir(source);
  const destFiles = await fs.readdir(dest);
  return sourceFiles.length === destFiles.length;

}

// Function to compare directories
const compareDirectories = async (source, dest) => {
  const sourceFiles = await fs.readdir(source);
  let isSame = true;
  for (const file of sourceFiles) {
    if (importantPaths.includes(file)) {
      const sourceStat = await fs.stat(path.join(source, file));
      const destStat = await fs.stat(path.join(dest, file));

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
  for (const p of importantPaths) {
    const fullPath = path.join(source, p);
    if (!(await fs.pathExists(fullPath))) {
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
