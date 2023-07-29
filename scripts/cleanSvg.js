const fs = require('fs');
const path = require('path');
const minify = require('html-minifier').minify;

const directoryPath = path.join(__dirname, '../renderer/public/kanji');

fs.readdir(directoryPath, function (err, files) {
  if (err) {
    return console.error('Unable to scan directory: ' + err);
  }

  files.forEach(function (file) {
    if (path.extname(file) === ".svg") {
      const filePath = path.join(directoryPath, file);
      const data = fs.readFileSync(filePath, 'utf8');

      const svgContent = data.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)[0];

      const minifiedContent = minify(svgContent, {
        removeAttributeQuotes: true,
        collapseWhitespace: true,
        minifyCSS: true
      });

      fs.writeFileSync(filePath, minifiedContent);
      console.log(`Minified and cleaned: ${file}`);
    }
  });
});
