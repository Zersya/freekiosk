/**
 * MDM agent credential store for Windows.
 * Persists enrollment state via AsyncStorage (the Windows shim maps it to
 * a JSON file in the app's LocalState folder).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_ENABLED = '@mdm_agent_enabled';
const KEY_WS_URL = '@mdm_agent_ws_url';
const KEY_ENROLLMENT_TOKEN = '@mdm_agent_enrollment_token';
const KEY_DEVICE_ID = '@mdm_agent_device_id';
const KEY_AGENT_TOKEN = '@mdm_agent_token';
const KEY_DEVICE_KEY = '@mdm_agent_device_key';

export interface AgentState {
  enabled: boolean;
  wsUrl: string;
  enrollmentToken: string | null;
  deviceId: string | null;
  agentToken: string | null;
  deviceKey: string | null;
}

export async function loadAgentState(): Promise<AgentState> {
  const [enabled, wsUrl, enrollmentToken, deviceId, agentToken, deviceKey] = await Promise.all([
    AsyncStorage.getItem(KEY_ENABLED),
    AsyncStorage.getItem(KEY_WS_URL),
    AsyncStorage.getItem(KEY_ENROLLMENT_TOKEN),
    AsyncStorage.getItem(KEY_DEVICE_ID),
    AsyncStorage.getItem(KEY_AGENT_TOKEN),
    AsyncStorage.getItem(KEY_DEVICE_KEY),
  ]);
  return {
    enabled: enabled === 'true',
    wsUrl: wsUrl ?? '',
    enrollmentToken,
    deviceId,
    agentToken,
    deviceKey,
  };
}

export async function saveWsUrl(wsUrl: string): Promise<void> {
  await AsyncStorage.setItem(KEY_WS_URL, wsUrl);
}

export async function saveEnrollmentToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY_ENROLLMENT_TOKEN, token);
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_ENABLED, enabled ? 'true' : 'false');
}

export async function saveEnrollmentResult(deviceId: string, agentToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY_DEVICE_ID, deviceId],
    [KEY_AGENT_TOKEN, agentToken],
  ]);
  // Enrollment token is one-shot.
  await AsyncStorage.removeItem(KEY_ENROLLMENT_TOKEN);
}

export async function clearCredentials(): Promise<void> {
  // Keeps the WebSocket URL and device key, drops identity + tokens.
  await AsyncStorage.multiRemove([KEY_DEVICE_ID, KEY_AGENT_TOKEN, KEY_ENROLLMENT_TOKEN]);
}

export async function getOrCreateDeviceKey(machineId: string): Promise<string> {
  const stored = await AsyncStorage.getItem(KEY_DEVICE_KEY);
  if (stored) return stored;

  let key = machineId;
  if (!key) {
    const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
    key = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  await AsyncStorage.setItem(KEY_DEVICE_KEY, key);
  return key;
}
