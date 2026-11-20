/**
 * Device status collection for Windows.
 * Gathers device info, battery, screen, storage, etc.
 */

export interface DeviceStatus {
  // Device info
  deviceName: string;
  platform: 'windows';
  version: string;
  buildNumber: string;
  serialNumber?: string;
  hostname?: string;
  macAddress?: string;
  ipAddress?: string;

  // Battery (if applicable)
  batteryLevel?: number;
  batteryCharging?: boolean;
  batteryTemperature?: number;

  // Screen
  screenOn: boolean;
  screenBrightness: number;
  screenWidth: number;
  screenHeight: number;

  // Audio
  volume: number;
  muted: boolean;

  // Storage
  freeStorage: number;
  totalStorage: number;
  freeMemory: number;
  totalMemory: number;

  // Network
  wifiConnected: boolean;
  wifiSsid?: string;
  wifiSignal?: number;
  ethernetConnected: boolean;

  // Kiosk state
  kioskEnabled: boolean;
  displayMode: 'webview' | 'external_app' | 'media_player';
  currentUrl?: string;

  // System
  uptime: number;
  cpuUsage?: number;
  gpuUsage?: number;
}

export interface DeviceStatusProvider {
  getStatus(): Promise<DeviceStatus>;
  getBattery(): Promise<Partial<DeviceStatus>>;
  getScreen(): Promise<Partial<DeviceStatus>>;
  getStorage(): Promise<Partial<DeviceStatus>>;
  getNetwork(): Promise<Partial<DeviceStatus>>;
  getSystem(): Promise<Partial<DeviceStatus>>;
}

// Default implementation — will be overridden by native module
export class DefaultDeviceStatusProvider implements DeviceStatusProvider {
  async getStatus(): Promise<DeviceStatus> {
    const [battery, screen, storage, network, system] = await Promise.all([
      this.getBattery(),
      this.getScreen(),
      this.getStorage(),
      this.getNetwork(),
      this.getSystem(),
    ]);

    return {
      deviceName: 'FreeKiosk Windows',
      platform: 'windows',
      version: '1.2.0',
      buildNumber: '1',
      screenOn: true,
      screenBrightness: 50,
      screenWidth: 1920,
      screenHeight: 1080,
      volume: 50,
      muted: false,
      freeStorage: 0,
      totalStorage: 0,
      freeMemory: 0,
      totalMemory: 0,
      wifiConnected: false,
      ethernetConnected: true,
      kioskEnabled: true,
      displayMode: 'webview',
      uptime: 0,
      ...battery,
      ...screen,
      ...storage,
      ...network,
      ...system,
    };
  }

  async getBattery(): Promise<Partial<DeviceStatus>> {
    return {};
  }

  async getScreen(): Promise<Partial<DeviceStatus>> {
    return {};
  }

  async getStorage(): Promise<Partial<DeviceStatus>> {
    return {};
  }

  async getNetwork(): Promise<Partial<DeviceStatus>> {
    return {};
  }

  async getSystem(): Promise<Partial<DeviceStatus>> {
    return {};
  }
}

// Singleton instance
let provider: DeviceStatusProvider = new DefaultDeviceStatusProvider();

export function setDeviceStatusProvider(p: DeviceStatusProvider): void {
  provider = p;
}

export function getDeviceStatusProvider(): DeviceStatusProvider {
  return provider;
}
