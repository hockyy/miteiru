const path = require("path");

const dependencies = Object.keys(require("./package.json").dependencies || {});

/**
 * Nextron marks all dependencies as webpack externals (runtime require()).
 * kamiya-codec's package "exports" default to ESM (.mjs), which breaks Electron main.
 * Point the external at the CJS build instead.
 */
module.exports = {
  webpack: (config) => {
    const kamiyaCjs = path.resolve(
      __dirname,
      "node_modules/kamiya-codec/dist/kamiya.cjs",
    );

    config.externals = [
      ({ request }, callback) => {
        if (request === "kamiya-codec") {
          return callback(null, `commonjs ${kamiyaCjs}`);
        }
        if (dependencies.includes(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ];

    return config;
  },
};
