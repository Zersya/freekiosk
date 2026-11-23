/**
 * Windows MDM agent — outbound WebSocket client for the TransKIOSK MDM.
 * Mirrors Android's MdmAgentClient: enroll/hello handshake, periodic
 * status, command dispatch, JPEG frame streaming, exponential reconnect.
 */

import { NativeModules } from 'react-native';
import type { AgentState } from './agentStore';
import * as store from './agentStore';
import { collectStatusTree } from '../status/deviceStatus';
import { dispatchDeviceCommand } from '../commands/deviceCommands';
import { CAPTURE_MAX_DIMENSION } from '../input/coords';

const { ScreenshotModule, SystemInfoModule } = NativeModules;

export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

export interface AgentStore {
  loadAgentState(): Promise<AgentState>;
  setEnabled(enabled: boolean): Promise<void>;
  saveEnrollmentResult(deviceId: string, agentToken: string): Promise<void>;
  clearCredentials(): Promise<void>;
  getOrCreateDeviceKey(machineId: string): Promise<string>;
  saveWsUrl(wsUrl: string): Promise<void>;
  saveEnrollmentToken(token: string): Promise<void>;
}

export interface AgentTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface AgentDeps {
  createSocket(url: string): WebSocketLike;
  store: AgentStore;
  collectStatus(): Promise<object>;
  dispatch(command: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  captureJpegBase64(quality: number): Promise<string>;
  platformInfo(): Promise<{ computerName: string; model: string; manufacturer: string; osVersion: string; machineId: string }>;
  timers: AgentTimers;
}

const CAPABILITIES = ['status', 'commands', 'stream', 'install'];
const STATUS_INTERVAL_MS = 30_000;
const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const READY_STATE_OPEN = 1;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class WindowsMdmAgent {
  private deps: AgentDeps;
  private socket: WebSocketLike | null = null;
  private ready = false;
  private connecting = false;
  private enabled = false;
  private stopRequested = false;
  private suppressReconnect = false;
  private reconnectDelayMs = BACKOFF_INITIAL_MS;
  private reconnectTimer: unknown = null;
  private statusTimer: unknown = null;
  private streamTimer: unknown = null;
  private streamSessionId = '';
  private streamQuality = 60;
  private capturePending = false;
  private lastError: string | null = null;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    this.enabled = true;
    this.stopRequested = false;
    this.suppressReconnect = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.enabled = false;
    this.stopRequested = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    if (socket) {
      try {
        socket.close(1000, 'Agent stopped');
      } catch {
        // already closed
      }
    }
  }

  isConnected(): boolean {
    return this.ready && this.socket !== null && this.socket.readyState === READY_STATE_OPEN;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private clearTimers(): void {
    const { timers } = this.deps;
    if (this.reconnectTimer !== null) {
      timers.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.statusTimer !== null) {
      timers.clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    this.stopStream();
  }

  private stopStream(): void {
    if (this.streamTimer !== null) {
      this.deps.timers.clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
    this.streamSessionId = '';
    this.capturePending = false;
  }

  private async connect(): Promise<void> {
    if (this.socket !== null || this.connecting) return;
    const state = await this.deps.store.loadAgentState();
    if (!state.wsUrl) {
      this.lastError = 'MDM agent WebSocket URL is not configured';
      return;
    }

    this.connecting = true;
    let socket: WebSocketLike;
    try {
      socket = this.deps.createSocket(state.wsUrl);
    } catch (e) {
      this.connecting = false;
      this.lastError = e instanceof Error ? e.message : String(e);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.connecting = false;
      void this.sendHandshake(socket, state);
    };
    socket.onmessage = (ev) => {
      this.handleMessage(String(ev.data));
    };
    socket.onclose = () => {
      this.handleClose(socket);
    };
    socket.onerror = () => {
      // The close handler schedules the reconnect.
    };
  }

  private async sendHandshake(socket: WebSocketLike, state: AgentState): Promise<void> {
    const info = await this.deps
      .platformInfo()
      .catch(() => ({ computerName: '', model: '', manufacturer: '', osVersion: '', machineId: '' }));
    const deviceKey = await this.deps.store.getOrCreateDeviceKey(info.machineId ?? '');

    if (state.enrollmentToken) {
      socket.send(
        JSON.stringify({
          type: 'enroll',
          enrollmentToken: state.enrollmentToken,
          deviceKey,
          capabilities: CAPABILITIES,
          info: {
            name: info.computerName,
            model: info.model,
            manufacturer: info.manufacturer,
            androidVersion: info.osVersion,
            platform: 'windows',
          },
        })
      );
    } else if (state.deviceId && state.agentToken) {
      socket.send(
        JSON.stringify({
          type: 'hello',
          deviceId: state.deviceId,
          agentToken: state.agentToken,
          protocolVersion: 1,
          capabilities: CAPABILITIES,
        })
      );
    } else {
      this.lastError = 'MDM agent is not enrolled';
      this.suppressReconnect = true;
      this.stopRequested = true;
      socket.close(1008, 'Not enrolled');
    }
  }

  private async onReady(): Promise<void> {
    this.ready = true;
    this.reconnectDelayMs = BACKOFF_INITIAL_MS;
    await this.sendStatus();
    if (this.statusTimer === null) {
      this.statusTimer = this.deps.timers.setInterval(() => {
        void this.sendStatus();
      }, STATUS_INTERVAL_MS);
    }
  }

  private async sendStatus(): Promise<void> {
    if (!this.isSocketOpen()) return;
    try {
      const data = await this.deps.collectStatus();
      this.socket!.send(JSON.stringify({ type: 'status', data }));
    } catch (e) {
      console.warn('[MDM] status send failed:', e);
    }
  }

  private isSocketOpen(): boolean {
    return this.socket !== null && this.socket.readyState === READY_STATE_OPEN;
  }

  private handleMessage(text: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }

    switch (message.type) {
      case 'enrolled': {
        const deviceId = String(message.deviceId ?? '').trim();
        const agentToken = String(message.agentToken ?? '');
        if (!deviceId || !agentToken) {
          this.lastError = 'Invalid enroll response';
          return;
        }
        void this.deps.store.saveEnrollmentResult(deviceId, agentToken).then(() => this.onReady());
        break;
      }
      case 'welcome':
        void this.onReady();
        break;
      case 'command':
        void this.handleCommand(message);
        break;
      case 'stream_start':
        this.handleStreamStart(message);
        break;
      case 'stream_stop':
        this.handleStreamStop(message);
        break;
      case 'error':
        this.lastError = String(message.message ?? 'Agent error');
        break;
      default:
        // pong, status_ack, log_start, log_stop, unknown: ignore.
        break;
    }
  }

  private async handleCommand(message: Record<string, unknown>): Promise<void> {
    const requestId = String(message.requestId ?? '');
    const command = String(message.command ?? '');
    const params = (message.params ?? {}) as Record<string, unknown>;

    if (command === 'screenshot') {
      const quality = clamp(Number(params.quality ?? 80) || 80, 1, 100);
      try {
        const imageBase64 = await this.deps.captureJpegBase64(quality);
        this.send({
          type: 'command_result',
          requestId,
          success: true,
          data: { imageBase64, mimeType: 'image/jpeg' },
        });
      } catch {
        this.send({
          type: 'command_result',
          requestId,
          success: false,
          error: 'Screen capture not available',
        });
      }
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = await this.deps.dispatch(command, params);
    } catch (e) {
      data = { executed: false, error: e instanceof Error ? e.message : 'Command failed' };
    }
    const success = data.executed === true && !('error' in data && data.error);
    this.send({
      type: 'command_result',
      requestId,
      success,
      data,
      error: success ? undefined : (data.error as string | undefined),
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.isSocketOpen()) return;
    try {
      this.socket!.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('[MDM] send failed:', e);
    }
  }

  private handleStreamStart(message: Record<string, unknown>): void {
    const sessionId = String(message.sessionId ?? '');
    if (!sessionId) return;
    const fps = clamp(Number(message.fps ?? 8) || 8, 1, 15);
    const intervalMs = Math.max(Math.floor(1000 / fps), 33);
    this.streamQuality = clamp(Number(message.quality ?? 60) || 60, 1, 100);

    this.stopStream();
    this.streamSessionId = sessionId;
    this.streamTimer = this.deps.timers.setInterval(() => {
      void this.streamTick(sessionId);
    }, intervalMs);
  }

  private async streamTick(sessionId: string): Promise<void> {
    if (this.streamSessionId !== sessionId || this.capturePending) return;
    if (!this.isSocketOpen()) return;
    this.capturePending = true;
    try {
      const data = await this.deps.captureJpegBase64(this.streamQuality);
      this.send({
        type: 'stream_frame',
        sessionId,
        timestamp: Math.floor(Date.now() / 1000),
        contentType: 'image/jpeg',
        data,
      });
    } catch (e) {
      console.warn('[MDM] stream frame capture failed:', e);
    } finally {
      this.capturePending = false;
    }
  }

  private handleStreamStop(message: Record<string, unknown>): void {
    const sessionId = String(message.sessionId ?? '');
    if (!sessionId || sessionId === this.streamSessionId) {
      this.stopStream();
    }
  }

  private handleClose(closed: WebSocketLike): void {
    if (closed !== this.socket) return;
    this.socket = null;
    this.ready = false;
    this.connecting = false;
    if (this.statusTimer !== null) {
      this.deps.timers.clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    this.stopStream();
    if (this.enabled && !this.stopRequested && !this.suppressReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = this.deps.timers.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** Report app install progress over REST (used by msixInstaller). */
  async reportInstallStatus(
    appId: string,
    body: { status: string; installedVersionCode?: number; errorMessage?: string }
  ): Promise<void> {
    const state = await this.deps.store.loadAgentState();
    if (!state.deviceId || !state.agentToken || !state.wsUrl) return;

    const base = state.wsUrl
      .replace(/^ws(s?):\/\//, 'http$1://')
      .replace(/\/api\/agent\/ws\/?$/, '')
      .replace(/\/+$/, '');
    await fetch(`${base}/api/agent/apps/${appId}/install-status?deviceId=${state.deviceId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${state.agentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}

function parsePlatformInfo(json: string): {
  computerName: string;
  model: string;
  manufacturer: string;
  osVersion: string;
  machineId: string;
} {
  const parsed = JSON.parse(json);
  return {
    computerName: parsed.computerName ?? '',
    model: parsed.model ?? '',
    manufacturer: parsed.manufacturer ?? '',
    osVersion: parsed.osVersion ?? '',
    machineId: parsed.machineId ?? '',
  };
}

export const windowsMdmAgent = new WindowsMdmAgent({
  createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
  store,
  collectStatus: () => collectStatusTree(),
  dispatch: (command, params) => dispatchDeviceCommand(command, params),
  captureJpegBase64: (quality) => ScreenshotModule.capture('jpeg', quality, CAPTURE_MAX_DIMENSION),
  platformInfo: async () => parsePlatformInfo(await SystemInfoModule.getPlatformInfo()),
  timers: {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  },
});
