const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, '../renderer', 'public');
const destDir = path.join(__dirname, '../app');

fs.copy(sourceDir, destDir)
  .then(() => console.log('Files copied successfully!'))
  .catch(err => console.error(err));