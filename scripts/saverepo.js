const fs = require('fs');
const archiver = require('archiver');
const path = require("path");

const source = path.join(__dirname, '../renderer/public');
const target = path.join(__dirname, '../archived/public.zip');

// Ensure the 'archived' directory exists
const targetDir = path.dirname(target);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const output = fs.createWriteStream(target);
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

// Listen for warnings (optional)
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

// Listen for errors
archive.on('error', function(err) {
  throw err;
});

// Pipe the archive data to the file
archive.pipe(output);

// Append the source directory, recursively including subdirectories
archive.directory(source, false);

// Finalize the archive (i.e., finish compressing)
archive.finalize();
