const {run: downloadLanguageAssets} = require('./downloadLanguageAssets');

downloadLanguageAssets().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
