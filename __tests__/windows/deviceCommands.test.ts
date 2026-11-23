/**
 * Tests for the Windows device command dispatcher.
 */

const mockSendKey = jest.fn();
const mockSendText = jest.fn();
const mockTap = jest.fn();
const mockSwipe = jest.fn();
const mockGetScreenInfo = jest.fn();
const mockListPackages = jest.fn();
const mockEmit = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    InputInjectionModule: {
      sendKey: (...args: unknown[]) => mockSendKey(...args),
      sendText: (...args: unknown[]) => mockSendText(...args),
      tap: (...args: unknown[]) => mockTap(...args),
      swipe: (...args: unknown[]) => mockSwipe(...args),
    },
    ScreenshotModule: { getScreenInfo: (...args: unknown[]) => mockGetScreenInfo(...args) },
    PackageInstallModule: { listPackages: (...args: unknown[]) => mockListPackages(...args) },
  },
  DeviceEventEmitter: { emit: (...args: unknown[]) => mockEmit(...args), addListener: jest.fn() },
}));

jest.mock('../../src/platform/windows/apps/msixInstaller', () => ({
  installMsix: jest.fn(async () => ({ command: 'installApk', executed: true, status: 'installed' })),
  uninstallMsix: jest.fn(async () => ({ command: 'uninstallApk', executed: true, status: 'uninstalled' })),
}));

import { dispatchDeviceCommand } from '../../src/platform/windows/commands/deviceCommands';

const FRAME_INFO = JSON.stringify({
  screenWidth: 1920,
  screenHeight: 1080,
  frameWidth: 1080,
  frameHeight: 608,
});

describe('dispatchDeviceCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetScreenInfo.mockResolvedValue(FRAME_INFO);
    mockSendKey.mockResolvedValue(undefined);
    mockSendText.mockResolvedValue(undefined);
    mockTap.mockResolvedValue(undefined);
    mockSwipe.mockResolvedValue(undefined);
  });

  it('remoteKey back sends VK_BROWSER_BACK down/up', async () => {
    const result = await dispatchDeviceCommand('remoteKey', { key: 'back' });
    expect(mockSendKey).toHaveBeenNthCalledWith(1, 0xa6, true);
    expect(mockSendKey).toHaveBeenNthCalledWith(2, 0xa6, false);
    expect(result.executed).toBe(true);
    expect(result.command).toBe('remoteKey');
  });

  it('remoteKey up maps to VK_UP', async () => {
    await dispatchDeviceCommand('remoteKey', { key: 'up' });
    expect(mockSendKey).toHaveBeenNthCalledWith(1, 0x26, true);
  });

  it('unknown remote key returns the Android error', async () => {
    const result = await dispatchDeviceCommand('remoteKey', { key: 'zzz' });
    expect(result.executed).toBe(false);
    expect(result.error).toContain('Unknown remote key: zzz');
    expect(result.error).toContain('volumeup');
  });

  it('keyboardCombo ctrl+c sends ctrl down, c down, c up, ctrl up', async () => {
    const result = await dispatchDeviceCommand('keyboardCombo', { map: 'ctrl+c' });
    expect(result.executed).toBe(true);
    expect(mockSendKey).toHaveBeenNthCalledWith(1, 0x11, true);
    expect(mockSendKey).toHaveBeenNthCalledWith(2, 0x43, true);
    expect(mockSendKey).toHaveBeenNthCalledWith(3, 0x43, false);
    expect(mockSendKey).toHaveBeenNthCalledWith(4, 0x11, false);
  });

  it('keyboardCombo rejects an unknown modifier', async () => {
    const result = await dispatchDeviceCommand('keyboardCombo', { map: 'banana+c' });
    expect(result.executed).toBe(false);
    expect(result.error).toContain('Unknown modifier: banana');
  });

  it('keyboardKey unknown returns error', async () => {
    const result = await dispatchDeviceCommand('keyboardKey', { key: 'bananakey' });
    expect(result.executed).toBe(false);
    expect(result.error).toContain('Unknown key: bananakey');
  });

  it('keyboardText sends text', async () => {
    const result = await dispatchDeviceCommand('keyboardText', { text: 'hello' });
    expect(result.executed).toBe(true);
    expect(result.command).toBe('keyboardText');
    expect(result.textLength).toBe(5);
    expect(mockSendText).toHaveBeenCalledWith('hello');
  });

  it('remoteTap converts frame px to normalized coords', async () => {
    const result = await dispatchDeviceCommand('remoteTap', { x: 540, y: 304 });
    expect(result.executed).toBe(true);
    expect(mockTap).toHaveBeenCalledWith(0.5, 0.5);
  });

  it('remoteTap without coords fails', async () => {
    const result = await dispatchDeviceCommand('remoteTap', {});
    expect(result.executed).toBe(false);
    expect(result.error).toBe('x and y coordinates are required');
  });

  it('remoteSwipe calls mockSwipe with duration', async () => {
    const result = await dispatchDeviceCommand('remoteSwipe', {
      x1: 540, y1: 608, x2: 540, y2: 0, duration: 400,
    });
    expect(result.executed).toBe(true);
    expect(mockSwipe).toHaveBeenCalledWith(0.5, 1, 0.5, 0, 400);
  });

  it('listInstalledApps parses the native JSON', async () => {
    mockListPackages.mockResolvedValue('[{"packageName":"a","versionCode":1,"versionName":"1.0.0.0"}]');
    const result = await dispatchDeviceCommand('listInstalledApps', {});
    expect(result.executed).toBe(true);
    expect(result.installedApps).toHaveLength(1);
  });

  it('backupConfig is not supported on Windows', async () => {
    const result = await dispatchDeviceCommand('backupConfig', {});
    expect(result.executed).toBe(false);
    expect(result.error).toBe('backupConfig is not supported on Windows');
  });

  it('unknown commands fall through to onApiCommand', async () => {
    const result = await dispatchDeviceCommand('foo', { a: 1 });
    expect(mockEmit).toHaveBeenCalledWith('onApiCommand', { command: 'foo', params: '{"a":1}' });
    expect(result).toEqual({ executed: true, command: 'foo' });
  });
});
