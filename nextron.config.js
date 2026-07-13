const path = require("path");

const dependencies = Object.keys(require("./package.json").dependencies || {});

/**
 * Nextron marks all dependencies as webpack externals (runtime require()).
 * kamiya-codec's package "exports" default to ESM (.mjs), which breaks Electron main.
 * Alias imports to the CJS build and bundle it (avoid absolute-path externals).
 */
module.exports = {
  webpack: (config) => {
    const kamiyaCjs = path.resolve(
      __dirname,
      "node_modules/kamiya-codec/dist/kamiya.cjs",
    );

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "kamiya-codec": kamiyaCjs,
    };

    config.externals = [
      ({ request }, callback) => {
        if (request === "kamiya-codec") {
          return callback();
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
