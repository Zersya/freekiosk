/**
 * Device command dispatcher for Windows.
 * Handles the MDM command names (remoteTap, remoteSwipe, remoteKey,
 * keyboardKey, keyboardCombo, keyboardText, installApk, uninstallApk,
 * listInstalledApps). Unknown commands fall through to 'onApiCommand'
 * like Android's HttpServerModule.dispatchCommand does.
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';
import { getVkCode, REMOTE_KEY_VK, MODIFIER_VK } from '../input/keymap';
import { resolvePoint, CAPTURE_MAX_DIMENSION } from '../input/coords';
import { installMsix, uninstallMsix } from '../apps/msixInstaller';

const { InputInjectionModule, ScreenshotModule, PackageInstallModule } = NativeModules;

const REMOTE_KEY_USAGE =
  'Use up, down, left, right, select, back, home, menu, playpause, play, pause, stop, next, previous, volumeup, volumedown, mute';
const KEYBOARD_KEY_USAGE =
  'Use a-z, 0-9, f1-f12, space, tab, enter, escape, backspace, delete, etc.';
const MODIFIER_USAGE = 'Valid modifiers: ctrl, alt, shift, meta';

const WINDOWS_UNSUPPORTED = ['backupConfig', 'restoreConfig', 'cameraList', 'getLocation'];

type Params = Record<string, unknown>;
type Result = Record<string, unknown>;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

async function pressVk(vk: number): Promise<void> {
  await InputInjectionModule.sendKey(vk, true);
  await InputInjectionModule.sendKey(vk, false);
}

async function frameSize(): Promise<{ width: number; height: number }> {
  const info = JSON.parse(await ScreenshotModule.getScreenInfo(CAPTURE_MAX_DIMENSION)) as {
    frameWidth?: number;
    frameHeight?: number;
  };
  return { width: info.frameWidth ?? 0, height: info.frameHeight ?? 0 };
}

async function handleRemoteTap(command: string, params: Params): Promise<Result> {
  const frame = await frameSize();
  const point = resolvePoint(params, { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' }, frame);
  if (!point) {
    return { executed: false, command, error: 'x and y coordinates are required' };
  }
  try {
    await InputInjectionModule.tap(point.xn, point.yn);
    return { executed: true, success: true, command, x: point.x, y: point.y };
  } catch (e) {
    return { executed: false, command, error: errorMessage(e) };
  }
}

async function handleRemoteSwipe(command: string, params: Params): Promise<Result> {
  const frame = await frameSize();
  const from = resolvePoint(params, { x: 'x1', y: 'y1', xPct: 'x1Pct', yPct: 'y1Pct' }, frame);
  const to = resolvePoint(params, { x: 'x2', y: 'y2', xPct: 'x2Pct', yPct: 'y2Pct' }, frame);
  if (!from || !to) {
    return { executed: false, command, error: 'x1, y1, x2, and y2 coordinates are required' };
  }
  const duration = clamp(Number(params.duration ?? 300) || 300, 50, 5000);
  try {
    await InputInjectionModule.swipe(from.xn, from.yn, to.xn, to.yn, duration);
    return {
      executed: true,
      success: true,
      command,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      duration,
    };
  } catch (e) {
    return { executed: false, command, error: errorMessage(e) };
  }
}

async function handleRemoteKey(params: Params): Promise<Result> {
  const key = String(params.key ?? '').toLowerCase();
  const vk = REMOTE_KEY_VK[key];
  if (vk === undefined) {
    return {
      executed: false,
      command: 'remoteKey',
      error: `Unknown remote key: ${key}. ${REMOTE_KEY_USAGE}`,
    };
  }
  try {
    await pressVk(vk);
    return { executed: true, command: 'remoteKey', key, keyCode: vk };
  } catch (e) {
    return { executed: false, command: 'remoteKey', error: errorMessage(e) };
  }
}

async function handleKeyboardKey(command: string, params: Params): Promise<Result> {
  const key = String(params.key ?? '');
  const keyCode = getVkCode(key);
  if (keyCode === undefined) {
    return { executed: false, command, error: `Unknown key: ${key}. ${KEYBOARD_KEY_USAGE}` };
  }
  try {
    await pressVk(keyCode);
    return { executed: true, command, key, keyCode };
  } catch (e) {
    return { executed: false, command, error: errorMessage(e) };
  }
}

async function handleKeyboardCombo(command: string, params: Params): Promise<Result> {
  const map = String(params.map ?? '');
  const parts = map.split(/[+\s]+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return { executed: false, command, error: 'Empty key combination' };
  }

  const key = parts[parts.length - 1];
  const keyCode = getVkCode(key);
  if (keyCode === undefined) {
    return { executed: false, command, error: `Unknown key in combination: ${key}` };
  }

  const modifiers: string[] = [];
  const modifierCodes: number[] = [];
  for (const part of parts.slice(0, -1)) {
    const vk = MODIFIER_VK[part.toLowerCase()];
    if (vk === undefined) {
      return { executed: false, command, error: `Unknown modifier: ${part}. ${MODIFIER_USAGE}` };
    }
    modifiers.push(part);
    modifierCodes.push(vk);
  }

  try {
    for (const vk of modifierCodes) {
      await InputInjectionModule.sendKey(vk, true);
    }
    await InputInjectionModule.sendKey(keyCode, true);
    await InputInjectionModule.sendKey(keyCode, false);
    for (let i = modifierCodes.length - 1; i >= 0; i--) {
      await InputInjectionModule.sendKey(modifierCodes[i], false);
    }
    return { executed: true, command, map, key, keyCode, modifiers };
  } catch (e) {
    return { executed: false, command, error: errorMessage(e) };
  }
}

async function handleKeyboardText(params: Params): Promise<Result> {
  const text = String(params.text ?? '');
  if (!text) {
    return { executed: false, command: 'keyboardText', error: 'text is required' };
  }
  try {
    await InputInjectionModule.sendText(text);
    return { executed: true, command: 'keyboardText', textLength: text.length };
  } catch (e) {
    return { executed: false, command: 'keyboardText', error: errorMessage(e) };
  }
}

export async function dispatchDeviceCommand(command: string, params: Params): Promise<Result> {
  switch (command) {
    case 'remoteTap':
      return handleRemoteTap(command, params);
    case 'remoteSwipe':
      return handleRemoteSwipe(command, params);
    case 'remoteKey':
    case 'remoteDpad':
      return handleRemoteKey(params);
    case 'keyboardKey':
      return handleKeyboardKey(command, params);
    case 'keyboardCombo':
      return handleKeyboardCombo(command, params);
    case 'keyboardText':
    case 'remoteText':
      return handleKeyboardText(params);
    case 'installApk':
      return installMsix(params);
    case 'uninstallApk':
      return uninstallMsix(params);
    case 'listInstalledApps': {
      try {
        const installedApps = JSON.parse(await PackageInstallModule.listPackages());
        return { executed: true, success: true, command, installedApps };
      } catch (e) {
        return { executed: false, command, error: errorMessage(e) };
      }
    }
  }

  if (WINDOWS_UNSUPPORTED.includes(command)) {
    return {
      executed: false,
      success: false,
      command,
      error: `${command} is not supported on Windows`,
    };
  }

  // Android fallthrough: let ApiService handle app-level commands
  // (setUrl, reload, kioskMode, setVolume, ...).
  DeviceEventEmitter.emit('onApiCommand', { command, params: JSON.stringify(params) });
  return { executed: true, command };
}
