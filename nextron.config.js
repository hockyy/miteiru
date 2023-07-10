const {SourceMapDevToolPlugin} = require('webpack');

module.exports = {
  webpack: (config) =>
      Object.assign(config, {
        entry: {
          background: './main/background.ts',
          preload: './main/preload.ts',
        },
      }),
};