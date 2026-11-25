const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {resolve: metroResolve} = require('metro-resolver');

const WINDOWS_WEBVIEW_ALIAS = 'react-native-webview-windows';

const WINDOWS_SHIMS = {
  'react-native-gesture-handler': 'src/platform/windows/shims/empty.ts',
  '@react-native-cookies/cookies': 'src/platform/windows/shims/cookies.ts',
  'react-native-vision-camera': 'src/platform/windows/shims/visionCamera.tsx',
  'react-native-fs': 'src/platform/windows/shims/fs.ts',
  'react-native-safe-area-context':
    'src/platform/windows/shims/safeAreaContext.tsx',
  '@react-native-community/slider': 'src/platform/windows/shims/slider.tsx',
  'react-native-vector-icons/MaterialCommunityIcons':
    'src/platform/windows/shims/MaterialCommunityIcons.tsx',
  '@react-native-async-storage/async-storage':
    'src/platform/windows/shims/asyncStorage.tsx',
};

// IMPORTANT: `loadMetroConfig` (community CLI) installs a framework-default
// `resolveRequest` — `reactNativePlatformResolver` — that maps
// `react-native`/`react-native/*` to the out-of-tree platform package
// (react-native-windows for platform=windows). A project-level
// `resolveRequest` *replaces* that default instead of chaining it, which left
// `react-native` resolving to the core package: core `Platform.js` re-exports
// itself for out-of-tree platforms, making `Platform.default` undefined and
// crashing bundle eval with "Cannot read property 'OS' of undefined".
// Capture it via getDefaultConfig() (which already merged framework defaults)
// and delegate to it so `react-native` → `react-native-windows` still works.
const upstreamResolveRequest = getDefaultConfig(__dirname).resolver
  .resolveRequest;

function resolveRequest(context, moduleName, platform) {
  if (platform === 'windows') {
    if (
      moduleName === 'react-native-webview' ||
      moduleName.startsWith('react-native-webview/')
    ) {
      return metroResolve(context, WINDOWS_WEBVIEW_ALIAS + moduleName.slice('react-native-webview'.length), platform);
    }
    const shim = WINDOWS_SHIMS[moduleName];
    if (shim) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, shim),
      };
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}


const fs = require('fs');
const path = require('node:path');

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

//

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  //
  resolver: {
    blockList: [
      // This stops "npx @react-native-community/cli run-windows" from causing the metro server to crash if its already running
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      // This prevents "npx @react-native-community/cli run-windows" from hitting: EBUSY: resource busy or locked, open msbuild.ProjectImports.zip or other files produced by msbuild
      new RegExp(`${rnwPath}/build/.*`),
      new RegExp(`${rnwPath}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    //
    resolveRequest,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
