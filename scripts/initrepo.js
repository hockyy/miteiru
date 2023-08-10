const fs = require('fs');
const extract = require('extract-zip');
const path = require("path");

const source = path.join(__dirname, '../archived/public.zip');
const target = path.join(__dirname, '../renderer');

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
  console.log('Extraction failed!', err);
});
