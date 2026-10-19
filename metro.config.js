const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// markdown-it uses the legacy bare Node import. Native Hermes needs the JS package.
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(context, moduleName === 'punycode' ? 'punycode/' : moduleName, platform);

module.exports = config;
