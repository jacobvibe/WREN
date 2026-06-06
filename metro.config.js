const { withNativeWind } = require('nativewind/metro')
const path = require('path')
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname)

// ─────────────────────────────────────────────────────────────────────────────
// LOAD-BEARING — DO NOT REMOVE until react-native-css ships a Windows fix.
// On Windows, react-native-css emits mangled absolute module specifiers that
// begin with a drive letter (e.g. "C:something") which Metro cannot resolve and
// which crash the bundler. We intercept those and redirect them to an empty CSS
// stub. Removing this resolver breaks `expo start` on Windows entirely.
// ─────────────────────────────────────────────────────────────────────────────
const originalResolver = config.resolver?.resolveRequest
config.resolver = config.resolver ?? {}
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^[A-Za-z]:[^/\\]/.test(moduleName)) {
    const emptyCssStub = path.join(__dirname, 'src', 'empty-css-stub.js')
    return { type: 'sourceFile', filePath: emptyCssStub }
  }
  if (originalResolver) return originalResolver(context, moduleName, platform)
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, {
  input: './src/global.css',
})