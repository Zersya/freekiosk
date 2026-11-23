/**
 * Tests for the Windows status tree builder.
 */

import { buildStatusTree, StatusInputs } from '../../src/platform/windows/status/deviceStatus';

const fixture: StatusInputs = {
  platformInfo: {
    osVersion: '10.0.22631',
    osBuild: 22631,
    manufacturer: 'Contoso',
    model: 'Tablet',
    computerName: 'KIOSK-01',
    machineId: 'abc123',
  },
  appVersion: '1.2.28',
  ip: '192.168.1.50',
  uptimeSec: 3600,
  battery: { level: 80, charging: false },
  storage: { freeGB: 40, totalGB: 100 },
  memory: { freeMB: 2048, totalMB: 8192 },
  volume: 65,
  screen: { frameWidth: 1080, frameHeight: 608 },
  installedApps: [{ packageName: 'Contoso.Test', versionCode: 2005007, versionName: '2.5.7.0' }],
  app: { currentUrl: 'https://example.com', kioskMode: true },
};

describe('buildStatusTree', () => {
  it('has the Android key tree', () => {
    const tree = buildStatusTree(fixture);
    expect(Object.keys(tree)).toEqual([
      'battery',
      'screen',
      'audio',
      'webview',
      'device',
      'wifi',
      'rotation',
      'sensors',
      'autoBrightness',
      'storage',
      'memory',
      'installedApps',
    ]);
  });

  it('reports platform windows', () => {
    const tree = buildStatusTree(fixture);
    expect(tree.device.platform).toBe('windows');
    expect(tree.device.product).toBe('windows');
    expect(tree.device.deviceName).toBe('KIOSK-01');
    expect(tree.device.androidVersion).toBe('10.0.22631');
  });

  it('reports the capture frame size', () => {
    const tree = buildStatusTree(fixture);
    const sc = tree.device.screenCapture as { width: number; height: number };
    expect(sc.width).toBe(fixture.screen.frameWidth);
    expect(sc.height).toBe(fixture.screen.frameHeight);
  });

  it('computes storage and memory in MB', () => {
    const tree = buildStatusTree(fixture);
    expect(tree.storage.totalMB).toBe(100 * 1024);
    expect(tree.storage.availableMB).toBe(40 * 1024);
    expect(tree.memory.totalMB).toBe(8192);
    expect(tree.memory.usedPercent).toBe(75);
    expect(tree.memory.lowMemory).toBe(false);
  });

  it('maps app status into webview/screen', () => {
    const tree = buildStatusTree(fixture);
    expect(tree.webview.currentUrl).toBe('https://example.com');
    expect(tree.device.kioskMode).toBe(true);
    expect(tree.screen.on).toBe(true);
  });

  it('defaults battery when absent', () => {
    const tree = buildStatusTree({ ...fixture, battery: null });
    expect(tree.battery.level).toBe(100);
    expect(tree.battery.charging).toBe(true);
  });

  it('marks wifi disconnected when ip is empty', () => {
    const tree = buildStatusTree({ ...fixture, ip: '' });
    expect(tree.wifi.connected).toBe(false);
  });
});
