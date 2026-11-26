/**
 * TCP socket abstraction for Windows.
 * Bridges to native TcpSocketModule (C++).
 * All data strings are "binary strings" (one char code 0-255 per byte);
 * the native side exchanges base64.
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';
import {
  base64Decode,
  base64Encode,
  binaryStringToBytes,
  bytesToBinaryString,
} from './bytes';

const { TcpSocketModule } = NativeModules;

export interface TcpSocket {
  id: number;
  remoteAddress: string;
  remotePort: number;
}

export interface TcpServer {
  id: number;
  port: number;
  onConnection(callback: TcpConnectionCallback): void;
  onData(socketId: number, callback: TcpDataCallback): void;
  onError(callback: TcpErrorCallback): void;
  onClose(callback: TcpCloseCallback): void;
  send(socketId: number, data: string): Promise<void>;
  sendBase64(socketId: number, base64: string): Promise<void>;
  startMjpegStream(socketId: number, intervalMs: number, quality: number, maxDimension: number): Promise<void>;
  close(socketId: number): Promise<void>;
  closeServer(): Promise<void>;
  getConnections(): TcpSocket[];
}

export interface TcpClient extends TcpSocket {
  onData(callback: TcpDataCallback): void;
  onError(callback: TcpErrorCallback): void;
  onClose(callback: TcpCloseCallback): void;
  send(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface TcpDataEvent {
  socketId: number;
  data: string; // base64
}

export interface TcpConnectionEvent {
  serverId: number;
  socketId: number;
  remoteAddress: string;
  remotePort: number;
}

export interface TcpErrorEvent {
  socketId: number;
  error: string;
}

export interface TcpCloseEvent {
  socketId: number;
}

export type TcpDataCallback = (data: string) => void;
export type TcpConnectionCallback = (socket: TcpSocket) => void;
export type TcpErrorCallback = (error: string) => void;
export type TcpCloseCallback = (socketId: number) => void;

// ---------------------------------------------------------------------------
// Module-level event dispatch. The native module emits through
// DeviceEventEmitter; we register each event once and fan out.

const serversById = new Map<number, TcpServerImpl>();
const socketHandlers = new Map<
  number,
  { onData?: TcpDataCallback; onError?: TcpErrorCallback; onClose?: TcpCloseCallback }
>();


// TEMP diagnostic: trace JS-side event delivery to LocalState.
function jsTrace(msg: string): void {
  try {
    const km = NativeModules.KioskModule;
    if (km?.writeFile) {
      km.readFile('freekiosk_js.log')
        .then((prev: string) => km.writeFile('freekiosk_js.log', prev + msg + '\n'))
        .catch(() => km.writeFile('freekiosk_js.log', msg + '\n'));
    }
  } catch {}
}
let listenersRegistered = false;

function ensureListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  jsTrace('ensureListeners registered');

  DeviceEventEmitter.addListener('tcpConnection', (event: TcpConnectionEvent) => {
    jsTrace(`tcpConnection s=${event.socketId} srv=${event.serverId} found=${serversById.has(event.serverId)}`);
    serversById.get(event.serverId)?.handleConnectionEvent(event);
  });

  DeviceEventEmitter.addListener('tcpData', (event: TcpDataEvent) => {
    const h = socketHandlers.get(event.socketId);
    jsTrace(`tcpData s=${event.socketId} hasHandler=${!!h?.onData}`);
    try {
      h?.onData?.(bytesToBinaryString(base64Decode(event.data)));
    } catch (e) {
      jsTrace(`onData threw: ${(e as Error).message}`);
    }
  });

  DeviceEventEmitter.addListener('tcpError', (event: TcpErrorEvent) => {
    const h = socketHandlers.get(event.socketId);
    h?.onError?.(event.error);
  });

  DeviceEventEmitter.addListener('tcpClose', (event: TcpCloseEvent) => {
    const h = socketHandlers.get(event.socketId);
    socketHandlers.delete(event.socketId);
    h?.onClose?.(event.socketId);
  });
}

function sendBinary(socketId: number, binary: string): Promise<void> {
  jsTrace(`sendBinary s=${socketId} len=${binary.length} hasModule=${!!TcpSocketModule}`);
  return TcpSocketModule.send(socketId, base64Encode(binaryStringToBytes(binary)));
}

export class TcpServerImpl implements TcpServer {
  id: number;
  port: number;
  private connections: Map<number, TcpSocket> = new Map();
  private connectionCallback?: TcpConnectionCallback;
  private errorCallback?: TcpErrorCallback;
  private closeCallback?: TcpCloseCallback;

  constructor(id: number, port: number) {
    this.id = id;
    this.port = port;
    ensureListeners();
    serversById.set(id, this);
  }

  /** Called by the module-level dispatcher for matching tcpConnection events. */
  handleConnectionEvent(event: TcpConnectionEvent): void {
    const socket: TcpSocket = {
      id: event.socketId,
      remoteAddress: event.remoteAddress,
      remotePort: event.remotePort,
    };
    this.connections.set(event.socketId, socket);
    socketHandlers.set(event.socketId, {});
    this.connectionCallback?.(socket);
  }

  onConnection(callback: TcpConnectionCallback): void {
    this.connectionCallback = callback;
  }

  onData(socketId: number, callback: TcpDataCallback): void {
    const h = socketHandlers.get(socketId) ?? {};
    h.onData = callback;
    socketHandlers.set(socketId, h);
  }

  onError(callback: TcpErrorCallback): void {
    this.errorCallback = callback;
  }

  onClose(callback: TcpCloseCallback): void {
    this.closeCallback = callback;
  }

  async send(socketId: number, data: string): Promise<void> {
    await sendBinary(socketId, data);
  }

  async sendBase64(socketId: number, base64: string): Promise<void> {
    await TcpSocketModule.send(socketId, base64);
  }

  async startMjpegStream(
    socketId: number,
    intervalMs: number,
    quality: number,
    maxDimension: number
  ): Promise<void> {
    await TcpSocketModule.startMjpegStream(socketId, intervalMs, quality, maxDimension);
  }

  async close(socketId: number): Promise<void> {
    await TcpSocketModule.close(socketId);
    this.connections.delete(socketId);
    socketHandlers.delete(socketId);
  }

  async closeServer(): Promise<void> {
    await TcpSocketModule.closeServer(this.id);
    serversById.delete(this.id);
    for (const socketId of this.connections.keys()) {
      socketHandlers.delete(socketId);
    }
    this.connections.clear();
  }

  getConnections(): TcpSocket[] {
    return Array.from(this.connections.values());
  }
}

export class TcpClientImpl implements TcpClient {
  id: number;
  remoteAddress: string;
  remotePort: number;

  constructor(id: number, remoteAddress: string, remotePort: number) {
    this.id = id;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    ensureListeners();
    socketHandlers.set(id, {});
  }

  private handlers() {
    const h = socketHandlers.get(this.id) ?? {};
    socketHandlers.set(this.id, h);
    return h;
  }

  onData(callback: TcpDataCallback): void {
    this.handlers().onData = callback;
  }

  onError(callback: TcpErrorCallback): void {
    this.handlers().onError = callback;
  }

  onClose(callback: TcpCloseCallback): void {
    this.handlers().onClose = callback;
  }

  async send(data: string): Promise<void> {
    await sendBinary(this.id, data);
  }

  async close(): Promise<void> {
    await TcpSocketModule.close(this.id);
    socketHandlers.delete(this.id);
  }
}

// Public API
export async function createServer(port: number): Promise<TcpServer> {
  const id = await TcpSocketModule.createServer(port);
  return new TcpServerImpl(id, port);
}

export async function connect(host: string, port: number): Promise<TcpClient> {
  const id = await TcpSocketModule.connect(host, port);
  return new TcpClientImpl(id, host, port);
}

export async function send(socketId: number, data: string): Promise<void> {
  await sendBinary(socketId, data);
}

export async function close(socketId: number): Promise<void> {
  await TcpSocketModule.close(socketId);
  socketHandlers.delete(socketId);
}
