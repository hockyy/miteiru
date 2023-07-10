const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self';
  style-src 'self';
  font-src 'self';  
`;

module.exports = {
  webpack: (config, {isServer}) => {
    if (!isServer) {
      config.target = 'electron-renderer';
      config.node = {
        __dirname: true,
      };
    }
    config.output.globalObject = 'this';
    return config;
  },
};