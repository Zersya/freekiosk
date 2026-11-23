/**
 * Tests for the Windows REST API router and command execution.
 * Native modules and heavy dependencies are faked.
 */

const mockCapture = jest.fn();
const mockDispatch = jest.fn();
const mockCollectStatusTree = jest.fn();
const mockInstallMsix = jest.fn();
const mockUninstallMsix = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    ScreenshotModule: { capture: (...args: unknown[]) => mockCapture(...args) },
  },
  DeviceEventEmitter: { emit: jest.fn(), addListener: jest.fn() },
}));

jest.mock('../../src/platform/windows/commands/deviceCommands', () => ({
  dispatchDeviceCommand: (...args: unknown[]) => mockDispatch(...args),
}));
jest.mock('../../src/platform/windows/status/deviceStatus', () => ({
  collectStatusTree: (...args: unknown[]) => mockCollectStatusTree(...args),
}));
jest.mock('../../src/platform/windows/apps/msixInstaller', () => ({
  installMsix: (...args: unknown[]) => mockInstallMsix(...args),
  uninstallMsix: (...args: unknown[]) => mockUninstallMsix(...args),
}));

import { executeCommand, getCommandHandler, getAllCommands, isValidCommand } from '../../src/platform/windows/commands/executeCommand';
import { handleRestRequest } from '../../src/platform/windows/rest/restApi';
import { HttpRequest } from '../../src/platform/windows/rest/httpParser';

function createRequest(
  method: string,
  path: string,
  body = '',
  headers: Record<string, string> = {},
  query: Record<string, string> = {}
): HttpRequest {
  return {
    method,
    path,
    query,
    headers,
    body,
    raw: `${method} ${path} HTTP/1.1\r\n\r\n${body}`,
  };
}

const OPEN = { apiKey: null, allowControl: true };

describe('executeCommand', () => {
  it('executes brightness command', async () => {
    const result = await executeCommand('/api/brightness', { level: 75 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ brightness: 75 });
  });

  it('executes volume command', async () => {
    const result = await executeCommand('/api/volume', { level: 50 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ volume: 50 });
  });

  it('executes screen command', async () => {
    const result = await executeCommand('/api/screen', { on: false });
    expect(result.success).toBe(true);
  });

  it('executes kiosk command', async () => {
    const result = await executeCommand('/api/kiosk', { enabled: true });
    expect(result.success).toBe(true);
  });

  it('returns error for unknown command', async () => {
    const result = await executeCommand('/api/unknown', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown command');
  });

  it('clamps brightness to valid range', async () => {
    const result = await executeCommand('/api/brightness', { level: 150 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ brightness: 100 });
  });

  it('clamps volume to valid range', async () => {
    const result = await executeCommand('/api/volume', { level: -10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ volume: 0 });
  });
});

describe('command registry', () => {
  it('returns handler for valid command', () => {
    expect(getCommandHandler('/api/brightness')).toBeDefined();
  });

  it('returns undefined for invalid command', () => {
    expect(getCommandHandler('/api/unknown')).toBeUndefined();
  });

  it('lists all commands', () => {
    const commands = getAllCommands();
    expect(commands).toContain('/api/brightness');
    expect(commands).toContain('/api/volume');
    expect(commands).toContain('/api/screen');
  });

  it('removed legacy routes are gone from the registry', () => {
    expect(isValidCommand('/api/screenshot')).toBe(false);
    expect(isValidCommand('/api/key')).toBe(false);
    expect(isValidCommand('/api/text')).toBe(false);
  });
});

describe('handleRestRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollectStatusTree.mockResolvedValue({
      device: { platform: 'windows', screenCapture: { width: 1080, height: 608 } },
      installedApps: [],
    });
    mockDispatch.mockResolvedValue({ executed: true, command: 'x' });
    mockInstallMsix.mockResolvedValue({ executed: true, success: true, status: 'installed' });
    mockUninstallMsix.mockResolvedValue({ executed: true, success: true, status: 'uninstalled' });
  });

  it('answers OPTIONS without an API key', async () => {
    const resp = await handleRestRequest(
      createRequest('OPTIONS', '/api/status'),
      { apiKey: 'secret', allowControl: true }
    );
    expect(resp.status).toBe(200);
  });

  it('rejects a wrong X-Api-Key with 401', async () => {
    const resp = await handleRestRequest(
      createRequest('GET', '/api/status', '', { 'x-api-key': 'wrong' }),
      { apiKey: 'secret', allowControl: true }
    );
    expect(resp.status).toBe(401);
    expect(JSON.parse(resp.body!).error).toBe('Invalid or missing API key');
  });

  it('accepts the right X-Api-Key', async () => {
    const resp = await handleRestRequest(
      createRequest('GET', '/api/status', '', { 'x-api-key': 'secret' }),
      { apiKey: 'secret', allowControl: true }
    );
    expect(resp.status).toBe(200);
  });

  it('blocks control routes when allowControl is false', async () => {
    const resp = await handleRestRequest(
      createRequest('POST', '/api/remote/tap', '{"x":1,"y":1}'),
      { apiKey: null, allowControl: false }
    );
    expect(resp.status).toBe(403);
    expect(JSON.parse(resp.body!).error).toBe('Remote control is disabled');
  });

  it('returns 405 for GET on a POST-only route', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/api/remote/tap'), OPEN);
    expect(resp.status).toBe(405);
    expect(JSON.parse(resp.body!).error).toBe('This endpoint requires POST with a JSON body');
  });

  it('returns 404 for unknown endpoints', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/nope'), OPEN);
    expect(resp.status).toBe(404);
    expect(JSON.parse(resp.body!).error).toBe('Endpoint not found');
  });

  it('GET /api/health reports windows', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/api/health'), OPEN);
    const body = JSON.parse(resp.body!);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.platform).toBe('windows');
  });

  it('GET /api/status returns the status tree', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/api/status'), OPEN);
    const body = JSON.parse(resp.body!);
    expect(body.data.device.platform).toBe('windows');
    expect(mockCollectStatusTree).toHaveBeenCalled();
  });

  it('GET /api/screenshot returns base64 JPEG', async () => {
    mockCapture.mockResolvedValue('ZmFrZS1qcGVn');
    const resp = await handleRestRequest(createRequest('GET', '/api/screenshot'), OPEN);
    expect(resp.status).toBe(200);
    expect(resp.bodyBase64).toBe('ZmFrZS1qcGVn');
    expect(resp.headers['content-type']).toBe('image/jpeg');
  });

  it('GET /api/screenshot returns 503 when capture fails', async () => {
    mockCapture.mockRejectedValue(new Error('nope'));
    const resp = await handleRestRequest(createRequest('GET', '/api/screenshot'), OPEN);
    expect(resp.status).toBe(503);
    expect(JSON.parse(resp.body!).error).toBe('Screenshot not available');
  });

  it('GET /api/screenshot/stream returns the mjpeg stream marker', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/api/screenshot/stream'), OPEN);
    expect(resp.stream).toBe('mjpeg');
    expect(resp.headers['content-type']).toContain('multipart/x-mixed-replace');
  });

  it('POST /api/remote/tap requires coordinates', async () => {
    const resp = await handleRestRequest(createRequest('POST', '/api/remote/tap', '{}'), OPEN);
    expect(resp.status).toBe(400);
    expect(JSON.parse(resp.body!).error).toContain('x and y is required');
  });

  it('POST /api/remote/tap dispatches remoteTap', async () => {
    mockDispatch.mockResolvedValue({ executed: true, success: true, command: 'remoteTap', x: 5, y: 5 });
    const resp = await handleRestRequest(
      createRequest('POST', '/api/remote/tap', '{"x":5,"y":5}'),
      OPEN
    );
    expect(mockDispatch).toHaveBeenCalledWith('remoteTap', { x: 5, y: 5 });
    expect(resp.status).toBe(200);
  });

  it('GET /api/remote/up dispatches remoteKey', async () => {
    const resp = await handleRestRequest(createRequest('GET', '/api/remote/up'), OPEN);
    expect(mockDispatch).toHaveBeenCalledWith('remoteKey', { key: 'up' });
    expect(resp.status).toBe(200);
  });

  it('POST /api/app/install requires downloadUrl', async () => {
    const resp = await handleRestRequest(createRequest('POST', '/api/app/install', '{}'), OPEN);
    expect(resp.status).toBe(400);
    expect(JSON.parse(resp.body!).error).toBe('downloadUrl is required');
  });

  it('POST /api/app/install calls installMsix', async () => {
    const resp = await handleRestRequest(
      createRequest(
        'POST',
        '/api/app/install',
        '{"downloadUrl":"http://x/app.msix","packageName":"Contoso.Test"}'
      ),
      OPEN
    );
    expect(resp.status).toBe(200);
    expect(mockInstallMsix).toHaveBeenCalledWith(
      expect.objectContaining({ downloadUrl: 'http://x/app.msix', packageName: 'Contoso.Test' })
    );
  });

  it('POST /api/app/uninstall requires packageName', async () => {
    const resp = await handleRestRequest(createRequest('POST', '/api/app/uninstall', '{}'), OPEN);
    expect(resp.status).toBe(400);
    expect(JSON.parse(resp.body!).error).toBe('packageName is required');
  });
});
