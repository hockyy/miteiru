const fs = require('fs');
const extract = require('extract-zip');
const path = require("path");

const source = path.join(__dirname, '../archived/public.zip');
const target = path.join(__dirname, '../renderer/public');

fs.access(target, fs.constants.F_OK, (err) => {
  if (err) {
    fs.mkdir(target, {recursive: true}, (err) => {
      if (err) {
        throw err;
      }
    });
  }
});

extract(source, {dir: target})
.then(() => {
  console.log('Extraction completed!');
})
.catch((err) => {
  if (err.code === 'ENOENT') {
    console.log('Extraction failed!');
    console.log(
        'Download public.zip from\n'
        + 'https://github.com/hockyy/miteiru/releases/download/v2.0.0/public.zip')
    console.log('and put it to archived/public.zip\n\n'
        + 'It contains some large dicts files')
    console.log('Lol i can\'t afford lfs')
  } else {
    console.log('Extraction failed!', err);
  }
});
