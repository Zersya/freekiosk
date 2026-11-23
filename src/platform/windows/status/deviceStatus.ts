/**
 * Device status tree for Windows.
 * Builds the same key tree Android reports via /api/status so the MDM can
 * consume both platforms identically.
 */

import { NativeModules } from 'react-native';
import { getAppStatus } from './appStatusStore';

const { SystemInfoModule, AudioControlModule, ScreenshotModule, PackageInstallModule } =
  NativeModules;

export interface PlatformInfo {
  osVersion: string;
  osBuild: number;
  manufacturer: string;
  model: string;
  computerName: string;
  machineId: string;
}

export interface StatusInputs {
  platformInfo: PlatformInfo;
  appVersion: string;
  ip: string;
  uptimeSec: number;
  battery: { level: number; charging: boolean } | null;
  storage: { freeGB: number; totalGB: number } | null;
  memory: { freeMB: number; totalMB: number } | null;
  volume: number;
  screen: { frameWidth: number; frameHeight: number };
  installedApps: Array<{ packageName: string; versionCode: number; versionName: string }>;
  app: Record<string, unknown>;
}

export interface StatusTree {
  battery: Record<string, unknown>;
  screen: Record<string, unknown>;
  audio: Record<string, unknown>;
  webview: Record<string, unknown>;
  device: Record<string, unknown>;
  wifi: Record<string, unknown>;
  rotation: Record<string, unknown>;
  sensors: Record<string, unknown>;
  autoBrightness: Record<string, unknown>;
  storage: Record<string, unknown>;
  memory: Record<string, unknown>;
  installedApps: Array<{ packageName: string; versionCode: number; versionName: string }>;
}

export function buildStatusTree(i: StatusInputs): StatusTree {
  const app = i.app;
  const battery = i.battery ?? { level: 100, charging: true };

  const storageTotalMB = Math.round((i.storage?.totalGB ?? 0) * 1024);
  const storageAvailMB = Math.round((i.storage?.freeGB ?? 0) * 1024);
  const storageUsedMB = Math.max(0, storageTotalMB - storageAvailMB);
  const storageUsedPercent =
    storageTotalMB > 0 ? Math.round((storageUsedMB / storageTotalMB) * 100) : 0;

  const memTotalMB = i.memory?.totalMB ?? 0;
  const memAvailMB = i.memory?.freeMB ?? 0;
  const memUsedMB = Math.max(0, memTotalMB - memAvailMB);
  const memUsedPercent = memTotalMB > 0 ? Math.round((memUsedMB / memTotalMB) * 100) : 0;

  return {
    battery: {
      level: battery.level,
      charging: battery.charging,
      plugged: battery.charging ? 'ac' : 'none',
      temperature: 0,
      voltage: 0,
      health: 'unknown',
      technology: '',
    },
    screen: {
      on: app.screenOn ?? true,
      brightness: app.brightness ?? 100,
      screensaverActive: app.screensaverActive ?? false,
    },
    audio: {
      volume: i.volume,
    },
    webview: {
      currentUrl: app.currentUrl ?? '',
      canGoBack: app.canGoBack ?? false,
      loading: app.loading ?? false,
    },
    device: {
      ip: i.ip,
      hostname: 'freekiosk',
      version: i.appVersion,
      isDeviceOwner: false,
      kioskMode: app.kioskMode ?? false,
      manufacturer: i.platformInfo.manufacturer,
      model: i.platformInfo.model,
      androidVersion: i.platformInfo.osVersion,
      apiLevel: i.platformInfo.osBuild,
      processor: '',
      deviceName: i.platformInfo.computerName,
      product: 'windows',
      uptime: i.uptimeSec,
      platform: 'windows',
      screenCapture: {
        active: true,
        deviceOwnerCapture: false,
        accessibilityCapture: false,
        width: i.screen.frameWidth,
        height: i.screen.frameHeight,
      },
    },
    wifi: {
      ssid: '',
      signalStrength: 0,
      signalLevel: 0,
      connected: i.ip !== '' && i.ip !== '127.0.0.1',
      linkSpeed: 0,
      frequency: 0,
      ipAddress: i.ip,
    },
    rotation: {
      enabled: app.rotationEnabled ?? false,
      urls: app.rotationUrls ?? [],
      interval: app.rotationInterval ?? 0,
      currentIndex: app.rotationCurrentIndex ?? 0,
    },
    sensors: {
      light: -1,
      proximity: -1,
      accelerometer: { x: 0, y: 0, z: 0 },
    },
    autoBrightness: {
      enabled: false,
      min: 0,
      max: 100,
      currentLightLevel: -1,
    },
    storage: {
      totalMB: storageTotalMB,
      availableMB: storageAvailMB,
      usedMB: storageUsedMB,
      usedPercent: storageUsedPercent,
    },
    memory: {
      totalMB: memTotalMB,
      availableMB: memAvailMB,
      usedMB: memUsedMB,
      usedPercent: memUsedPercent,
      lowMemory: memUsedPercent >= 90,
    },
    installedApps: i.installedApps,
  };
}

const EMPTY_PLATFORM_INFO: PlatformInfo = {
  osVersion: '',
  osBuild: 0,
  manufacturer: '',
  model: '',
  computerName: '',
  machineId: '',
};

async function safe<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === 'object') return raw as T;
  return fallback;
}

export async function collectStatusTree(): Promise<StatusTree> {
  const platformInfo = await safe(
    async () => parseJson(await SystemInfoModule.getPlatformInfo(), EMPTY_PLATFORM_INFO),
    EMPTY_PLATFORM_INFO
  );
  const ip = await safe(() => SystemInfoModule.getIpAddress(), '');
  const uptimeSec = await safe(() => SystemInfoModule.getUptime(), 0);

  const battery = await safe(async () => {
    const b = parseJson<Record<string, unknown>>(await SystemInfoModule.getBatteryInfo(), {});
    if (typeof b.level !== 'number') return null;
    return { level: b.level, charging: b.charging === true };
  }, null);

  const storage = await safe(async () => {
    const s = parseJson<Record<string, unknown>>(await SystemInfoModule.getStorageInfo(), {});
    if (typeof s.free !== 'number' || typeof s.total !== 'number') return null;
    return { freeGB: s.free, totalGB: s.total };
  }, null);

  const memory = await safe(async () => {
    const m = parseJson<Record<string, unknown>>(await SystemInfoModule.getMemoryInfo(), {});
    if (typeof m.free !== 'number' || typeof m.total !== 'number') return null;
    return { freeMB: m.free, totalMB: m.total };
  }, null);

  const volume = await safe(() => AudioControlModule.getVolume(), 100);

  const screen = await safe(async () => {
    const info = parseJson<{ frameWidth?: number; frameHeight?: number }>(
      await ScreenshotModule.getScreenInfo(1080),
      {}
    );
    return { frameWidth: info.frameWidth ?? 0, frameHeight: info.frameHeight ?? 0 };
  }, { frameWidth: 0, frameHeight: 0 });

  const installedApps = await safe(async () => {
    return parseJson<Array<{ packageName: string; versionCode: number; versionName: string }>>(
      await PackageInstallModule.listPackages(),
      []
    );
  }, []);

  // package.json is shipped with the bundle; version is always present.
  const pkg: { version: string } = require('../../../../package.json');
  const appVersion = pkg.version;

  return buildStatusTree({
    platformInfo,
    appVersion,
    ip,
    uptimeSec,
    battery,
    storage,
    memory,
    volume,
    screen,
    installedApps,
    app: getAppStatus(),
  });
}
