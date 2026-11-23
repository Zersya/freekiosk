/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// TEMP diagnostic: prove JS ran (write to LocalState)
try {
  const { NativeModules } = require('react-native');
  NativeModules.KioskModule?.writeFile?.('freekiosk_boot.log', `boot ${Date.now()}\n`);
} catch (e) {}

AppRegistry.registerComponent(appName, () => App);
