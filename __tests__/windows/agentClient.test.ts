/**
 * Tests for the Windows MDM agent client.
 */

jest.useFakeTimers();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));

import { WindowsMdmAgent, AgentDeps, WebSocketLike } from '../../src/platform/windows/mdm/agentClient';
import type { AgentState } from '../../src/platform/windows/mdm/agentStore';

class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  closedWith?: { code?: number; reason?: string };

  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closedWith = { code, reason };
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  sentJson(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const PLATFORM_INFO = {
  computerName: 'KIOSK-01',
  model: 'Tablet',
  manufacturer: 'Contoso',
  osVersion: '10.0.22631',
  machineId: 'machine123',
};

function makeDeps(state: AgentState): {
  deps: AgentDeps;
  socket: () => FakeSocket;
  store: AgentDeps['store'];
  dispatch: jest.Mock;
} {
  let currentState = state;
  let socket: FakeSocket | null = null;
  const created: FakeSocket[] = [];
  const dispatch = jest.fn(async () => ({ executed: true, command: 'x' }));
  const store = {
    loadAgentState: jest.fn(async () => currentState),
    setEnabled: jest.fn(async () => {}),
    saveEnrollmentResult: jest.fn(async (deviceId: string, agentToken: string) => {
      currentState = { ...currentState, enrollmentToken: null, deviceId, agentToken };
    }),
    clearCredentials: jest.fn(async () => {}),
    getOrCreateDeviceKey: jest.fn(async () => 'devicekey123'),
    saveWsUrl: jest.fn(async () => {}),
    saveEnrollmentToken: jest.fn(async () => {}),
  };
  const deps: AgentDeps = {
    createSocket: () => {
      socket = new FakeSocket();
      created.push(socket);
      return socket;
    },
    store,
    collectStatus: jest.fn(async () => ({ device: { platform: 'windows' } })),
    dispatch,
    captureJpegBase64: jest.fn(async () => 'ZnJhbWU='),
    platformInfo: jest.fn(async () => PLATFORM_INFO),
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    },
  };
  return { deps, socket: () => socket!, store, dispatch };
}

const ENROLLING: AgentState = {
  enabled: true,
  wsUrl: 'wss://mdm.example.com/api/agent/ws',
  enrollmentToken: 'debug',
  deviceId: null,
  agentToken: null,
  deviceKey: null,
};

const ENROLLED: AgentState = {
  enabled: true,
  wsUrl: 'wss://mdm.example.com/api/agent/ws',
  enrollmentToken: null,
  deviceId: 'dev-1',
  agentToken: 'tok-1',
  deviceKey: 'devicekey123',
};

async function flush() {
  await jest.advanceTimersByTimeAsync(0);
}

describe('WindowsMdmAgent', () => {
  const agents: WindowsMdmAgent[] = [];
  const make = (deps: AgentDeps) => {
    const a = new WindowsMdmAgent(deps);
    agents.push(a);
    return a;
  };
  afterEach(async () => {
    for (const a of agents.splice(0)) await a.stop();
  });

  it('sends enroll with windows platform and capabilities', async () => {
    const { deps, socket } = makeDeps(ENROLLING);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();

    const msgs = socket().sentJson();
    expect(msgs[0].type).toBe('enroll');
    expect(msgs[0].enrollmentToken).toBe('debug');
    expect(msgs[0].deviceKey).toBe('devicekey123');
    expect(msgs[0].capabilities).toEqual(['status', 'commands', 'stream', 'install']);
    const info = msgs[0].info as Record<string, unknown>;
    expect(info.platform).toBe('windows');
    expect(info.name).toBe('KIOSK-01');
  });

  it('sends hello when enrolled', async () => {
    const { deps, socket } = makeDeps(ENROLLED);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();

    const msgs = socket().sentJson();
    expect(msgs[0]).toMatchObject({
      type: 'hello',
      deviceId: 'dev-1',
      agentToken: 'tok-1',
      protocolVersion: 1,
    });
  });

  it('enrolled saves credentials and sends status', async () => {
    const { deps, socket, store } = makeDeps(ENROLLING);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();

    socket().receive({ type: 'enrolled', deviceId: 'dev-9', agentToken: 'tok-9' });
    await flush();

    expect(store.saveEnrollmentResult).toHaveBeenCalledWith('dev-9', 'tok-9');
    const msgs = socket().sentJson();
    const status = msgs.find((m) => m.type === 'status');
    expect(status).toBeDefined();
    expect(agent.isConnected()).toBe(true);
  });

  it('sends periodic status every 30s', async () => {
    const { deps, socket } = makeDeps(ENROLLED);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();
    socket().receive({ type: 'welcome' });
    await flush();

    const before = socket().sentJson().filter((m) => m.type === 'status').length;
    await jest.advanceTimersByTimeAsync(30_000);
    const after = socket().sentJson().filter((m) => m.type === 'status').length;
    expect(after).toBe(before + 1);
  });

  it('dispatch answers command_result', async () => {
    const { deps, socket, dispatch } = makeDeps(ENROLLED);
    dispatch.mockResolvedValue({ executed: true, command: 'remoteTap', x: 540, y: 304 });
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();
    socket().receive({ type: 'welcome' });
    await flush();

    socket().receive({
      type: 'command',
      requestId: 'r1',
      command: 'remoteTap',
      params: { xPct: 0.5, yPct: 0.5 },
    });
    await flush();

    const result = socket().sentJson().find((m) => m.type === 'command_result');
    expect(result).toMatchObject({ requestId: 'r1', success: true });
    expect(dispatch).toHaveBeenCalledWith('remoteTap', { xPct: 0.5, yPct: 0.5 });
  });

  it('screenshot command returns imageBase64', async () => {
    const { deps, socket } = makeDeps(ENROLLED);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();
    socket().receive({ type: 'welcome' });
    await flush();

    socket().receive({ type: 'command', requestId: 's1', command: 'screenshot', params: {} });
    await flush();

    const result = socket().sentJson().find((m) => m.type === 'command_result');
    expect(result).toMatchObject({
      requestId: 's1',
      success: true,
      data: { imageBase64: 'ZnJhbWU=', mimeType: 'image/jpeg' },
    });
  });

  it('stream_start produces frames, stream_stop ends them', async () => {
    const { deps, socket } = makeDeps(ENROLLED);
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();
    socket().receive({ type: 'welcome' });
    await flush();

    socket().receive({ type: 'stream_start', sessionId: 'sess1', fps: 4 });
    await jest.advanceTimersByTimeAsync(1000);

    const frames = socket().sentJson().filter((m) => m.type === 'stream_frame');
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames[0].contentType).toBe('image/jpeg');
    expect(frames[0].sessionId).toBe('sess1');

    socket().receive({ type: 'stream_stop', sessionId: 'sess1' });
    const count = socket().sentJson().filter((m) => m.type === 'stream_frame').length;
    await jest.advanceTimersByTimeAsync(1000);
    expect(socket().sentJson().filter((m) => m.type === 'stream_frame').length).toBe(count);
  });

  it('reconnects with exponential backoff after close', async () => {
    const { deps, socket } = makeDeps(ENROLLED);
    let sockets = 0;
    const origCreate = deps.createSocket;
    deps.createSocket = () => {
      sockets++;
      return origCreate('');
    };
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();

    socket().drop();
    // First reconnect scheduled at 1000ms.
    await jest.advanceTimersByTimeAsync(1000);
    await flush();
    expect(sockets).toBe(2);

    socket().drop();
    // Second at 2000ms.
    await jest.advanceTimersByTimeAsync(1999);
    await flush();
    expect(sockets).toBe(2);
    await jest.advanceTimersByTimeAsync(2);
    await flush();
    expect(sockets).toBe(3);
  });

  it('closes with 1008 and does not reconnect when not enrolled', async () => {
    const { deps, socket } = makeDeps({
      enabled: true,
      wsUrl: 'wss://x/api/agent/ws',
      enrollmentToken: null,
      deviceId: null,
      agentToken: null,
      deviceKey: null,
    });
    let sockets = 0;
    const origCreate = deps.createSocket;
    deps.createSocket = () => {
      sockets++;
      return origCreate('');
    };
    const agent = make(deps);
    await agent.start();
    socket().open();
    await flush();

    expect(socket().closedWith?.code).toBe(1008);
    expect(agent.getLastError()).toBe('MDM agent is not enrolled');

    await jest.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(sockets).toBe(1);
  });
});
