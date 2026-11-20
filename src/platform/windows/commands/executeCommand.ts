/**
 * Command execution for Windows REST API.
 * Routes commands to appropriate handlers.
 */

import { getVkCode } from '../input/keymap';

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export interface CommandHandler {
  execute(params: Record<string, unknown>): Promise<CommandResult>;
}

// Screen control
export const screenHandler: CommandHandler = {
  async execute(params) {
    const on = params.on ?? params.value ?? true;
    // TODO: Wire to native KioskModule.setScreenOn
    return { success: true, message: on ? 'Screen turned on' : 'Screen turned off' };
  },
};

// Brightness control
export const brightnessHandler: CommandHandler = {
  async execute(params) {
    const level = params.level ?? params.value ?? 50;
    const clamped = Math.max(0, Math.min(100, Number(level)));
    // TODO: Wire to native BrightnessModule
    return { success: true, message: `Brightness set to ${clamped}%`, data: { brightness: clamped } };
  },
};

// Volume control
export const volumeHandler: CommandHandler = {
  async execute(params) {
    const level = params.level ?? params.value ?? 50;
    const clamped = Math.max(0, Math.min(100, Number(level)));
    // TODO: Wire to native AudioControlModule
    return { success: true, message: `Volume set to ${clamped}%`, data: { volume: clamped } };
  },
};

// Kiosk mode
export const kioskHandler: CommandHandler = {
  async execute(params) {
    const enabled = params.enabled ?? params.value ?? true;
    // TODO: Wire to native KioskModule.setKioskMode
    return { success: true, message: enabled ? 'Kiosk mode enabled' : 'Kiosk mode disabled' };
  },
};

// Reload
export const reloadHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to WebView reload
    return { success: true, message: 'Reload triggered' };
  },
};

// Back navigation
export const backHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to WebView goBack
    return { success: true, message: 'Back navigation triggered' };
  },
};

// Home navigation
export const homeHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to navigation
    return { success: true, message: 'Home navigation triggered' };
  },
};

// URL navigation
export const urlHandler: CommandHandler = {
  async execute(params) {
    const url = params.url ?? params.value ?? '';
    if (!url) {
      return { success: false, error: 'URL is required' };
    }
    // TODO: Wire to WebView loadUrl
    return { success: true, message: `Navigating to ${url}` };
  },
};

// Media control
export const mediaHandler: CommandHandler = {
  async execute(params) {
    const action = params.action ?? 'play';
    // TODO: Wire to MediaPlayerComponent
    return { success: true, message: `Media ${action} triggered` };
  },
};

// Restart app
export const restartHandler: CommandHandler = {
  async execute(params) {
    const delay = params.delay ?? 0;
    // TODO: Wire to native restart
    return { success: true, message: `App will restart in ${delay}ms` };
  },
};

// Screenshot
export const screenshotHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to native ScreenCaptureModule
    return { success: true, message: 'Screenshot captured' };
  },
};

// Lock screen
export const lockHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to native KioskModule.lockScreen
    return { success: true, message: 'Screen locked' };
  },
};

// Unlock screen
export const unlockHandler: CommandHandler = {
  async execute() {
    // TODO: Wire to native KioskModule.unlockScreen
    return { success: true, message: 'Screen unlocked' };
  },
};

// Settings update
export const settingsHandler: CommandHandler = {
  async execute(params) {
    // TODO: Wire to StorageService
    return { success: true, message: 'Settings updated', data: params };
  },
};

// WiFi control
export const wifiHandler: CommandHandler = {
  async execute(params) {
    const action = params.action ?? 'status';
    // TODO: Wire to native WifiControlModule
    return { success: true, message: `WiFi ${action} executed` };
  },
};

// Bluetooth control
export const bluetoothHandler: CommandHandler = {
  async execute(params) {
    const action = params.action ?? 'status';
    // TODO: Wire to native BluetoothControlModule
    return { success: true, message: `Bluetooth ${action} executed` };
  },
};

// Key injection
export const keyHandler: CommandHandler = {
  async execute(params) {
    const key = params.key ?? params.value ?? '';
    if (!key) {
      return { success: false, error: 'Key is required' };
    }
    const vkCode = getVkCode(String(key));
    if (vkCode === undefined) {
      return { success: false, error: `Unknown key: ${key}` };
    }
    // TODO: Wire to native InputInjectionModule
    return { success: true, message: `Key ${key} injected`, data: { vkCode } };
  },
};

// Text injection
export const textHandler: CommandHandler = {
  async execute(params) {
    const text = params.text ?? params.value ?? '';
    if (!text) {
      return { success: false, error: 'Text is required' };
    }
    // TODO: Wire to native InputInjectionModule
    return { success: true, message: `Text injected: ${text}` };
  },
};

// Command registry
const COMMAND_REGISTRY: Record<string, CommandHandler> = {
  '/api/screen': screenHandler,
  '/api/brightness': brightnessHandler,
  '/api/volume': volumeHandler,
  '/api/kiosk': kioskHandler,
  '/api/reload': reloadHandler,
  '/api/back': backHandler,
  '/api/home': homeHandler,
  '/api/url': urlHandler,
  '/api/media': mediaHandler,
  '/api/restart': restartHandler,
  '/api/screenshot': screenshotHandler,
  '/api/lock': lockHandler,
  '/api/unlock': unlockHandler,
  '/api/settings': settingsHandler,
  '/api/wifi': wifiHandler,
  '/api/bluetooth': bluetoothHandler,
  '/api/key': keyHandler,
  '/api/text': textHandler,
};

export function getCommandHandler(path: string): CommandHandler | undefined {
  return COMMAND_REGISTRY[path];
}

export function getAllCommands(): string[] {
  return Object.keys(COMMAND_REGISTRY);
}

export function isValidCommand(path: string): boolean {
  return path in COMMAND_REGISTRY;
}

// Execute command by path
export async function executeCommand(path: string, params: Record<string, unknown>): Promise<CommandResult> {
  const handler = getCommandHandler(path);
  if (!handler) {
    return { success: false, error: `Unknown command: ${path}` };
  }
  try {
    return await handler.execute(params);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
