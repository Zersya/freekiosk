module.exports = {
  dependencies: {
    'react-native-brightness-newarch': {
      platforms: {
        android: null,
        windows: null,
      },
    },
    'react-native-vector-icons': {
      platforms: {
        ios: null, // disable auto-linking for iOS if not needed
      },
    },
    'react-native-webview': {
      platforms: { windows: null },
    },
    '@react-native-community/slider': {
      platforms: { windows: null },
    },
    'react-native-screens': {
      platforms: { windows: null },
    },
    '@react-native-picker/picker': {
      platforms: { windows: null },
    },
    'react-native-safe-area-context': {
      platforms: { windows: null },
    },
    'react-native-vision-camera': {
      platforms: { windows: null },
    },
    'react-native-fs': {
      platforms: { windows: null },
    },
    '@react-native-cookies/cookies': {
      platforms: { windows: null },
    },
    'react-native-gesture-handler': {
      platforms: { windows: null },
    },
    'react-native-keychain': {
      platforms: { windows: null },
    },
    '@react-native-async-storage/async-storage': {
      platforms: { windows: null },
    },
    'react-native-webview-windows': {
      platforms: { android: null, ios: null },
    },
  },
  assets: ['./node_modules/react-native-vector-icons/Fonts'],
};
