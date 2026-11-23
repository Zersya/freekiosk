/**
 * REST API handlers for Windows.
 * Mirrors Android's KioskHttpServer routing: same envelope, same auth
 * (X-Api-Key header), same control gating, same error strings.
 */

import { NativeModules } from 'react-native';
import {
  HttpRequest,
  HttpResponse,
  jsonSuccess,
  jsonError,
  imageResponse,
  mjpegResponse,
} from './httpParser';
import { executeCommand, getAllCommands } from '../commands/executeCommand';
import { dispatchDeviceCommand } from '../commands/deviceCommands';
import { collectStatusTree, StatusTree } from '../status/deviceStatus';
import { installMsix, uninstallMsix } from '../apps/msixInstaller';

const { ScreenshotModule } = NativeModules;

export interface RestApiConfig {
  apiKey: string | null;
  allowControl: boolean;
}

// Parse request body as JSON
function parseBody(body: string): Record<string, unknown> {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

interface Route {
  methods: Array<'GET' | 'POST'>;
  control: boolean;
  handler(request: HttpRequest): Promise<HttpResponse>;
}

// GET /api/status - full device status tree
async function handleStatus(_request: HttpRequest): Promise<HttpResponse> {
  return jsonSuccess(await collectStatusTree());
}

// GET /api/health - health check
async function handleHealth(_request: HttpRequest): Promise<HttpResponse> {
  return jsonSuccess({
    status: 'ok',
    timestamp: Math.floor(Date.now() / 1000),
    platform: 'windows',
  });
}

// Status subtree helpers
async function subtree(pick: (tree: StatusTree) => unknown): Promise<HttpResponse> {
  const tree = await collectStatusTree();
  return jsonSuccess(pick(tree));
}

async function handleBattery(): Promise<HttpResponse> {
  return subtree((t) => t.battery);
}

async function handleGetScreen(): Promise<HttpResponse> {
  return subtree((t) => t.screen);
}

async function handleGetBrightness(): Promise<HttpResponse> {
  return subtree((t) => ({ brightness: t.screen.brightness }));
}

async function handleInfo(): Promise<HttpResponse> {
  return subtree((t) => t.device);
}

async function handleWifi(): Promise<HttpResponse> {
  return subtree((t) => t.wifi);
}

async function handleStorage(): Promise<HttpResponse> {
  return subtree((t) => t.storage);
}

async function handleMemory(): Promise<HttpResponse> {
  return subtree((t) => t.memory);
}

async function handleGetVolume(): Promise<HttpResponse> {
  return subtree((t) => ({
    level: t.audio.volume,
    maxLevel: 100,
  }));
}

// Legacy mutating routes route through executeCommand.
async function legacy(request: HttpRequest, failMessage: string): Promise<HttpResponse> {
  const params = parseBody(request.body);
  const result = await executeCommand(request.path, params);
  if (!result.success) {
    return jsonError(400, result.error || failMessage);
  }
  return jsonSuccess(result.data || result);
}

// GET|POST /api/screenshot - JPEG screenshot
async function handleScreenshot(_request: HttpRequest): Promise<HttpResponse> {
  try {
    const base64 = await ScreenshotModule.capture('jpeg', 80, 1080);
    return imageResponse(base64, 'image/jpeg');
  } catch {
    return jsonError(503, 'Screenshot not available');
  }
}

// GET|POST /api/screenshot/stream - MJPEG live stream
async function handleScreenshotStream(_request: HttpRequest): Promise<HttpResponse> {
  return mjpegResponse();
}

// POST /api/remote/tap
async function handleRemoteTap(request: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(request.body);
  const hasPx = body.x !== undefined && body.y !== undefined;
  const hasPct = body.xPct !== undefined && body.yPct !== undefined;
  if (!hasPx && !hasPct) {
    return jsonError(400, 'JSON body with x and y is required, e.g. {"x": 540, "y": 960}');
  }
  const result = await dispatchDeviceCommand('remoteTap', body);
  if (result.executed !== true) {
    return jsonError(400, (result.error as string) ?? 'Tap failed');
  }
  return jsonSuccess(result);
}

// POST /api/remote/swipe
async function handleRemoteSwipe(request: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(request.body);
  const hasPx =
    body.x1 !== undefined && body.y1 !== undefined && body.x2 !== undefined && body.y2 !== undefined;
  const hasPct =
    body.x1Pct !== undefined &&
    body.y1Pct !== undefined &&
    body.x2Pct !== undefined &&
    body.y2Pct !== undefined;
  if (!hasPx && !hasPct) {
    return jsonError(
      400,
      'JSON body with x1, y1, x2, y2 is required, e.g. {"x1": 540, "y1": 960, "x2": 540, "y2": 400}'
    );
  }
  const result = await dispatchDeviceCommand('remoteSwipe', body);
  if (result.executed !== true) {
    return jsonError(400, (result.error as string) ?? 'Swipe failed');
  }
  return jsonSuccess(result);
}

// POST /api/remote/text
async function handleRemoteText(request: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(request.body);
  if (body.text === undefined || body.text === '') {
    return jsonError(400, `JSON body with 'text' field is required, e.g. {"text": "hello world"}`);
  }
  return jsonSuccess(await dispatchDeviceCommand('keyboardText', body));
}

// GET|POST /api/remote/keyboard?map=ctrl+c
async function handleKeyboardComboRoute(request: HttpRequest): Promise<HttpResponse> {
  const map = request.query['map'];
  if (!map) {
    return jsonError(400, `Query parameter 'map' is required, e.g. /api/remote/keyboard?map=ctrl+c`);
  }
  const result = await dispatchDeviceCommand('keyboardCombo', { map });
  if (result.executed !== true) {
    return jsonError(400, (result.error as string) ?? 'Key combination failed');
  }
  return jsonSuccess(result);
}

// GET|POST /api/remote/keyboard/{key}
async function handleKeyboardKeyRoute(request: HttpRequest, key: string): Promise<HttpResponse> {
  if (!key) {
    return jsonError(400, 'Key name is required in URL path, e.g. /api/remote/keyboard/a');
  }
  const result = await dispatchDeviceCommand('keyboardKey', { key });
  if (result.executed !== true) {
    return jsonError(400, (result.error as string) ?? 'Key injection failed');
  }
  return jsonSuccess(result);
}

// GET|POST /api/remote/{key} - D-pad / remote keys
async function handleRemoteKeyRoute(_request: HttpRequest, key: string): Promise<HttpResponse> {
  return jsonSuccess(await dispatchDeviceCommand('remoteKey', { key }));
}

// POST /api/app/install
async function handleAppInstall(request: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(request.body);
  if (!String(body.downloadUrl ?? '').trim()) {
    return jsonError(400, 'downloadUrl is required');
  }
  return jsonSuccess(
    await installMsix({ fileName: 'app.msix', packageName: '', sha256: '', ...body })
  );
}

// POST /api/app/uninstall
async function handleAppUninstall(request: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(request.body);
  if (!String(body.packageName ?? '').trim()) {
    return jsonError(400, 'packageName is required');
  }
  return jsonSuccess(await uninstallMsix(body));
}

// GET /api/commands - list available commands
async function handleCommands(_request: HttpRequest): Promise<HttpResponse> {
  return jsonSuccess({ commands: getAllCommands() });
}

// GET / - endpoint listing
async function handleRoot(_request: HttpRequest): Promise<HttpResponse> {
  return jsonSuccess({ endpoints: Object.keys(ROUTES).sort() });
}

const REMOTE_KEYS = ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'menu', 'playpause'];

const ROUTES: Record<string, Route> = {
  '/': { methods: ['GET'], control: false, handler: handleRoot },
  '/api/commands': { methods: ['GET'], control: false, handler: handleCommands },
  '/api/status': { methods: ['GET', 'POST'], control: false, handler: handleStatus },
  '/api/health': { methods: ['GET', 'POST'], control: false, handler: handleHealth },
  '/api/battery': { methods: ['GET'], control: false, handler: handleBattery },
  '/api/screen': {
    methods: ['GET', 'POST'],
    control: false,
    handler: (r) => (r.method === 'GET' ? handleGetScreen() : legacy(r, 'Failed to set screen')),
  },
  '/api/brightness': {
    methods: ['GET', 'POST'],
    control: false,
    handler: (r) =>
      r.method === 'GET' ? handleGetBrightness() : legacy(r, 'Failed to set brightness'),
  },
  '/api/info': { methods: ['GET'], control: false, handler: handleInfo },
  '/api/wifi': { methods: ['GET'], control: false, handler: handleWifi },
  '/api/storage': { methods: ['GET'], control: false, handler: handleStorage },
  '/api/memory': { methods: ['GET'], control: false, handler: handleMemory },
  '/api/volume': {
    methods: ['GET', 'POST'],
    control: false,
    handler: (r) => (r.method === 'GET' ? handleGetVolume() : legacy(r, 'Failed to set volume')),
  },
  '/api/screenshot': {
    methods: ['GET', 'POST'],
    control: false,
    handler: handleScreenshot,
  },
  '/api/screenshot/stream': {
    methods: ['GET', 'POST'],
    control: false,
    handler: handleScreenshotStream,
  },
  '/api/reload': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to reload') },
  '/api/back': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to go back') },
  '/api/home': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to go home') },
  '/api/url': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to navigate') },
  '/api/kiosk': {
    methods: ['POST'],
    control: true,
    handler: (r) => legacy(r, 'Failed to set kiosk mode'),
  },
  '/api/restart': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to restart') },
  '/api/lock': { methods: ['POST'], control: true, handler: (r) => legacy(r, 'Failed to lock screen') },
  '/api/unlock': {
    methods: ['POST'],
    control: true,
    handler: (r) => legacy(r, 'Failed to unlock screen'),
  },
  '/api/remote/tap': { methods: ['POST'], control: true, handler: handleRemoteTap },
  '/api/remote/swipe': { methods: ['POST'], control: true, handler: handleRemoteSwipe },
  '/api/remote/text': { methods: ['POST'], control: true, handler: handleRemoteText },
  '/api/remote/keyboard': {
    methods: ['GET', 'POST'],
    control: true,
    handler: handleKeyboardComboRoute,
  },
  '/api/app/install': { methods: ['POST'], control: true, handler: handleAppInstall },
  '/api/app/uninstall': { methods: ['POST'], control: true, handler: handleAppUninstall },
};

// Route paths that only accept POST; a GET hits them with 405.
function isPostOnly(path: string): boolean {
  const route = ROUTES[path];
  return route !== undefined && route.methods.length === 1 && route.methods[0] === 'POST';
}

// Main request handler
export async function handleRestRequest(
  request: HttpRequest,
  config: RestApiConfig
): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') {
    return { status: 200, headers: {}, body: '' };
  }

  if (config.apiKey && config.apiKey.length > 0) {
    if (request.headers['x-api-key'] !== config.apiKey) {
      return jsonError(401, 'Invalid or missing API key');
    }
  }

  let route = ROUTES[request.path];
  let handler = route?.handler;
  let control = route?.control ?? false;
  let methods = route?.methods;

  if (!route && request.path.startsWith('/api/remote/keyboard/')) {
    const key = decodeURIComponent(request.path.slice('/api/remote/keyboard/'.length));
    handler = (r) => handleKeyboardKeyRoute(r, key);
    control = true;
    methods = ['GET', 'POST'];
    route = { methods, control, handler };
  } else if (!route && request.path.startsWith('/api/remote/')) {
    const key = request.path.slice('/api/remote/'.length).toLowerCase();
    if (REMOTE_KEYS.includes(key)) {
      handler = (r) => handleRemoteKeyRoute(r, key);
      control = true;
      methods = ['GET', 'POST'];
      route = { methods, control, handler };
    }
  }

  if (!route || !handler) {
    // A GET on a known POST-only route is a 405, not a 404.
    if (isPostOnly(request.path)) {
      return jsonError(405, 'This endpoint requires POST with a JSON body');
    }
    return jsonError(404, 'Endpoint not found');
  }

  if (!methods!.includes(request.method as 'GET' | 'POST')) {
    if (request.method === 'GET' && methods!.includes('POST')) {
      return jsonError(405, 'This endpoint requires POST with a JSON body');
    }
    return jsonError(404, 'Endpoint not found');
  }

  if (control && !config.allowControl) {
    return jsonError(403, 'Remote control is disabled');
  }

  try {
    return await handler(request);
  } catch (error) {
    console.error(`API error for ${request.method} ${request.path}:`, error);
    return jsonError(500, error instanceof Error ? error.message : 'Internal server error');
  }
}
