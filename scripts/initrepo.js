const fs = require('fs');
const extract = require('extract-zip');
const path = require("path");
const https = require('https');
const axios = require("axios");

const sourceDir = path.join(__dirname, '../archived');
const source = path.join(sourceDir, 'public.zip');
const target = path.join(__dirname, '../renderer/public');
const downloadURL = 'https://github.com/hockyy/miteiru/releases/download/assets/public.zip';

// Ensure the target directory exists
if (!fs.existsSync(target)) {
  fs.mkdirSync(target, {recursive: true});
}

// Ensure the source directory exists
if (!fs.existsSync(sourceDir)) {
  fs.mkdirSync(sourceDir, {recursive: true});
}
const downloadFile = async () => {
  console.log('Downloading file...');

  // Delete the file if it exists (in case it's a broken download)
  if (fs.existsSync(source)) {
    fs.unlinkSync(source);
  }

  // Start downloading the file
  const response = await axios({
    method: 'GET',
    url: downloadURL,
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(source);
  const totalLength = response.headers['content-length'];

  let downloadedLength = 0;

  response.data.on('data', (chunk) => {
    downloadedLength += chunk.length;
    const progress = (downloadedLength / totalLength * 100).toFixed(2);
    process.stdout.write(`Downloading: ${progress}%\r`);
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

const extractFile = () => {
  extract(source, {dir: target})
  .then(() => {
    console.log('Extraction completed!');
  })
  .catch((err) => {
    if (err.code === 'ENOENT') {
      console.log('File not found, downloading...');
      downloadFile();
    } else {
      console.log('Extraction failed!', err);
      fs.rmSync(source);
      console.log('Emptying archived/');
    }
    console.log('Try to run the script again');
  });
};

// Check if the zip file exists, and start the download if not
fs.access(source, fs.constants.F_OK, (err) => {
  if (err) {
    downloadFile();
  } else {
    extractFile();
  }
});
