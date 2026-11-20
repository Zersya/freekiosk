/**
 * REST API handlers for Windows.
 * Routes API endpoints to command handlers.
 */

import { HttpRequest, HttpResponse, jsonResponse, errorResponse } from './httpParser';
import { executeCommand, getAllCommands } from '../commands/executeCommand';
import { getDeviceStatusProvider } from '../status/deviceStatus';

// Parse request body as JSON
function parseBody(body: string): Record<string, unknown> {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// GET /api/status - Full device status
async function handleStatus(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const status = await provider.getStatus();
  return jsonResponse(status);
}

// GET /api/battery - Battery info
async function handleBattery(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const battery = await provider.getBattery();
  return jsonResponse(battery);
}

// GET /api/brightness - Current brightness
async function handleGetBrightness(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const screen = await provider.getScreen();
  return jsonResponse({ brightness: screen.screenBrightness ?? 50 });
}

// POST /api/brightness - Set brightness
async function handleSetBrightness(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/brightness', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to set brightness');
  }
  return jsonResponse(result.data || result);
}

// GET /api/screen - Screen state
async function handleGetScreen(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const screen = await provider.getScreen();
  return jsonResponse({ on: screen.screenOn ?? true });
}

// POST /api/screen - Screen on/off
async function handleSetScreen(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/screen', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to set screen');
  }
  return jsonResponse(result.data || result);
}

// GET /api/info - Device info
async function handleInfo(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const status = await provider.getStatus();
  return jsonResponse({
    deviceName: status.deviceName,
    platform: status.platform,
    version: status.version,
    buildNumber: status.buildNumber,
    serialNumber: status.serialNumber,
    hostname: status.hostname,
  });
}

// GET /api/health - Health check
async function handleHealth(_request: HttpRequest): Promise<HttpResponse> {
  return jsonResponse({ status: 'ok', timestamp: Date.now() });
}

// GET /api/storage - Storage info
async function handleStorage(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const storage = await provider.getStorage();
  return jsonResponse(storage);
}

// GET /api/memory - RAM info
async function handleMemory(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const system = await provider.getSystem();
  return jsonResponse({
    free: system.freeMemory,
    total: system.totalMemory,
  });
}

// GET /api/wifi - WiFi status
async function handleWifi(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const network = await provider.getNetwork();
  return jsonResponse({
    connected: network.wifiConnected ?? false,
    ssid: network.wifiSsid,
    signal: network.wifiSignal,
  });
}

// POST /api/reload - Reload page
async function handleReload(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/reload', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to reload');
  }
  return jsonResponse(result.data || result);
}

// POST /api/back - Go back
async function handleBack(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/back', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to go back');
  }
  return jsonResponse(result.data || result);
}

// POST /api/home - Go home
async function handleHome(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/home', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to go home');
  }
  return jsonResponse(result.data || result);
}

// POST /api/url - Navigate to URL
async function handleUrl(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/url', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to navigate');
  }
  return jsonResponse(result.data || result);
}

// POST /api/kiosk - Enable/disable kiosk mode
async function handleKiosk(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/kiosk', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to set kiosk mode');
  }
  return jsonResponse(result.data || result);
}

// POST /api/volume - Set volume
async function handleVolume(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/volume', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to set volume');
  }
  return jsonResponse(result.data || result);
}

// GET /api/volume - Current volume
async function handleGetVolume(_request: HttpRequest): Promise<HttpResponse> {
  const provider = getDeviceStatusProvider();
  const status = await provider.getStatus();
  return jsonResponse({ volume: status.volume });
}

// POST /api/restart - Restart app
async function handleRestart(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand('/api/restart', params);
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to restart');
  }
  return jsonResponse(result.data || result);
}

// POST /api/screenshot - Take screenshot
async function handleScreenshot(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/screenshot', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to capture screenshot');
  }
  return jsonResponse(result.data || result);
}

// POST /api/lock - Lock screen
async function handleLock(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/lock', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to lock screen');
  }
  return jsonResponse(result.data || result);
}

// POST /api/unlock - Unlock screen
async function handleUnlock(_request: HttpRequest): Promise<HttpResponse> {
  const result = await executeCommand('/api/unlock', {});
  if (!result.success) {
    return errorResponse(500, result.error || 'Failed to unlock screen');
  }
  return jsonResponse(result.data || result);
}

// POST /api/key - Inject key
async function handleKey(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const key = params.key ?? params.value;
  if (!key) {
    return errorResponse(400, 'Key is required');
  }
  const result = await executeCommand('/api/key', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to inject key');
  }
  return jsonResponse(result.data || result);
}

// POST /api/text - Inject text
async function handleText(request: HttpRequest): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const text = params.text ?? params.value;
  if (!text) {
    return errorResponse(400, 'Text is required');
  }
  const result = await executeCommand('/api/text', params);
  if (!result.success) {
    return errorResponse(400, result.error || 'Failed to inject text');
  }
  return jsonResponse(result.data || result);
}

// GET /api/commands - List available commands
async function handleCommands(_request: HttpRequest): Promise<HttpResponse> {
  return jsonResponse({ commands: getAllCommands() });
}

// Route table
const ROUTES: Record<string, { GET?: (req: HttpRequest) => Promise<HttpResponse>; POST?: (req: HttpRequest) => Promise<HttpResponse> }> = {
  '/api/status': { GET: handleStatus },
  '/api/battery': { GET: handleBattery },
  '/api/brightness': { GET: handleGetBrightness, POST: handleSetBrightness },
  '/api/screen': { GET: handleGetScreen, POST: handleSetScreen },
  '/api/info': { GET: handleInfo },
  '/api/health': { GET: handleHealth },
  '/api/storage': { GET: handleStorage },
  '/api/memory': { GET: handleMemory },
  '/api/wifi': { GET: handleWifi },
  '/api/reload': { POST: handleReload },
  '/api/back': { POST: handleBack },
  '/api/home': { POST: handleHome },
  '/api/url': { POST: handleUrl },
  '/api/kiosk': { POST: handleKiosk },
  '/api/volume': { GET: handleGetVolume, POST: handleVolume },
  '/api/restart': { POST: handleRestart },
  '/api/screenshot': { POST: handleScreenshot },
  '/api/lock': { POST: handleLock },
  '/api/unlock': { POST: handleUnlock },
  '/api/key': { POST: handleKey },
  '/api/text': { POST: handleText },
  '/api/commands': { GET: handleCommands },
};

// Main request handler
export async function handleRestRequest(request: HttpRequest): Promise<HttpResponse> {
  const route = ROUTES[request.path];

  if (!route) {
    return errorResponse(404, `Unknown endpoint: ${request.path}`);
  }

  const handler = route[request.method as keyof typeof route];
  if (!handler) {
    return errorResponse(405, `Method ${request.method} not allowed for ${request.path}`);
  }

  try {
    return await handler(request);
  } catch (error) {
    console.error(`API error for ${request.method} ${request.path}:`, error);
    return errorResponse(500, 'Internal Server Error');
  }
}
