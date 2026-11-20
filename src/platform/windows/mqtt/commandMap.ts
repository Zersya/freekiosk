/**
 * MQTT command mapping for FreeKiosk on Windows.
 * Maps MQTT topics to REST API commands.
 */

export interface MqttCommand {
  topic: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

export const MQTT_COMMANDS: MqttCommand[] = [
  // Screen control
  { topic: 'freekiosk/command/screen', method: 'POST', path: '/api/screen', description: 'Screen on/off' },
  { topic: 'freekiosk/command/brightness', method: 'POST', path: '/api/brightness', description: 'Set brightness' },
  { topic: 'freekiosk/command/volume', method: 'POST', path: '/api/volume', description: 'Set volume' },
  { topic: 'freekiosk/command/kiosk', method: 'POST', path: '/api/kiosk', description: 'Enable/disable kiosk mode' },

  // Navigation
  { topic: 'freekiosk/command/reload', method: 'POST', path: '/api/reload', description: 'Reload page' },
  { topic: 'freekiosk/command/back', method: 'POST', path: '/api/back', description: 'Go back' },
  { topic: 'freekiosk/command/home', method: 'POST', path: '/api/home', description: 'Go home' },
  { topic: 'freekiosk/command/url', method: 'POST', path: '/api/url', description: 'Navigate to URL' },

  // Media
  { topic: 'freekiosk/command/play', method: 'POST', path: '/api/media/play', description: 'Play media' },
  { topic: 'freekiosk/command/pause', method: 'POST', path: '/api/media/pause', description: 'Pause media' },
  { topic: 'freekiosk/command/stop', method: 'POST', path: '/api/media/stop', description: 'Stop media' },

  // System
  { topic: 'freekiosk/command/restart', method: 'POST', path: '/api/restart', description: 'Restart app' },
  { topic: 'freekiosk/command/screenshot', method: 'POST', path: '/api/screenshot', description: 'Take screenshot' },
  { topic: 'freekiosk/command/lock', method: 'POST', path: '/api/lock', description: 'Lock screen' },
  { topic: 'freekiosk/command/unlock', method: 'POST', path: '/api/unlock', description: 'Unlock screen' },

  // Settings
  { topic: 'freekiosk/command/settings', method: 'POST', path: '/api/settings', description: 'Update settings' },
  { topic: 'freekiosk/command/wifi', method: 'POST', path: '/api/wifi', description: 'WiFi control' },
  { topic: 'freekiosk/command/bluetooth', method: 'POST', path: '/api/bluetooth', description: 'Bluetooth control' },
];

export function findCommandByTopic(topic: string): MqttCommand | undefined {
  return MQTT_COMMANDS.find(cmd => cmd.topic === topic);
}

export function findCommandByPath(path: string): MqttCommand | undefined {
  return MQTT_COMMANDS.find(cmd => cmd.path === path);
}

export function getAllCommandTopics(): string[] {
  return MQTT_COMMANDS.map(cmd => cmd.topic);
}

// Parse MQTT payload into REST API parameters
export function parseMqttPayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
  } catch {
    // If not JSON, treat as simple value
    return { value: payload };
  }
}

// Convert MQTT command to REST API request body
export function buildRestBody(command: MqttCommand, payload: string): string {
  const params = parseMqttPayload(payload);

  // Map common MQTT payloads to REST API format
  if (command.path === '/api/screen') {
    return JSON.stringify({ on: params.on ?? params.value ?? true });
  }
  if (command.path === '/api/brightness') {
    return JSON.stringify({ level: params.level ?? params.value ?? 50 });
  }
  if (command.path === '/api/volume') {
    return JSON.stringify({ level: params.level ?? params.value ?? 50 });
  }
  if (command.path === '/api/kiosk') {
    return JSON.stringify({ enabled: params.enabled ?? params.value ?? true });
  }
  if (command.path === '/api/url') {
    return JSON.stringify({ url: params.url ?? params.value ?? '' });
  }
  if (command.path === '/api/restart') {
    return JSON.stringify({ delay: params.delay ?? 0 });
  }

  return JSON.stringify(params);
}

// Extract state updates from REST API responses for MQTT state topic
export function extractStateUpdates(responseBody: string): Record<string, unknown> {
  try {
    const data = JSON.parse(responseBody);
    // Flatten nested objects for MQTT state
    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(state, value as Record<string, unknown>);
      } else {
        state[key] = value;
      }
    }
    return state;
  } catch {
    return {};
  }
}
