const dependencies = Object.keys(require("./package.json").dependencies || {});

/**
 * Nextron marks all dependencies as webpack externals (runtime require()).
 * Keep them as CommonJS requires for Electron main.
 */
module.exports = {
  webpack: (config) => {
    config.externals = [
      ({ request }, callback) => {
        if (dependencies.includes(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ];

    return config;
  },
};
