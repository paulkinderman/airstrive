const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite as WebAssembly in a worker.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');

// The worker needs SharedArrayBuffer, which browsers only allow on cross-origin isolated
// pages. vercel.json sends the same headers in production.
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = enhance ? enhance(middleware, server) : middleware;
  return (req, res, done) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return next(req, res, done);
  };
};

module.exports = config;
