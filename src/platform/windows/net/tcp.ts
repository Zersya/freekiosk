/**
 * TCP socket abstraction for Windows.
 * Bridges to native TcpSocketModule (C++ implementation in Step 6).
 * Provides a Node.js-like API for TCP servers and clients.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

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
  data: string;
}

export interface TcpConnectionEvent {
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
export type TcpCloseCallback = () => void;

export class TcpServerImpl implements TcpServer {
  id: number;
  port: number;
  private eventEmitter: NativeEventEmitter;
  private connections: Map<number, TcpSocket> = new Map();
  private dataCallbacks: Map<number, TcpDataCallback> = new Map();
  private connectionCallback?: TcpConnectionCallback;
  private errorCallback?: TcpErrorCallback;
  private closeCallback?: TcpCloseCallback;

  constructor(id: number, port: number) {
    this.id = id;
    this.port = port;
    this.eventEmitter = new NativeEventEmitter(TcpSocketModule);
    this.setupListeners();
  }

  private setupListeners(): void {
    this.eventEmitter.addListener('onTcpConnection', (event: TcpConnectionEvent) => {
      if (event.socketId === this.id) {
        const socket: TcpSocket = {
          id: event.socketId,
          remoteAddress: event.remoteAddress,
          remotePort: event.remotePort,
        };
        this.connections.set(event.socketId, socket);
        this.connectionCallback?.(socket);
      }
    });

    this.eventEmitter.addListener('onTcpData', (event: TcpDataEvent) => {
      const callback = this.dataCallbacks.get(event.socketId);
      callback?.(event.data);
    });

    this.eventEmitter.addListener('onTcpError', (event: TcpErrorEvent) => {
      this.errorCallback?.(event.error);
    });

    this.eventEmitter.addListener('onTcpClose', (event: TcpCloseEvent) => {
      this.connections.delete(event.socketId);
      this.dataCallbacks.delete(event.socketId);
      this.closeCallback?.();
    });
  }

  onConnection(callback: TcpConnectionCallback): void {
    this.connectionCallback = callback;
  }

  onData(socketId: number, callback: TcpDataCallback): void {
    this.dataCallbacks.set(socketId, callback);
  }

  onError(callback: TcpErrorCallback): void {
    this.errorCallback = callback;
  }

  onClose(callback: TcpCloseCallback): void {
    this.closeCallback = callback;
  }

  async send(socketId: number, data: string): Promise<void> {
    await TcpSocketModule.send(socketId, data);
  }

  async close(socketId: number): Promise<void> {
    await TcpSocketModule.close(socketId);
    this.connections.delete(socketId);
    this.dataCallbacks.delete(socketId);
  }

  async closeServer(): Promise<void> {
    await TcpSocketModule.closeServer(this.id);
  }

  getConnections(): TcpSocket[] {
    return Array.from(this.connections.values());
  }
}

export class TcpClientImpl implements TcpClient {
  id: number;
  remoteAddress: string;
  remotePort: number;
  private eventEmitter: NativeEventEmitter;
  private dataCallback?: TcpDataCallback;
  private errorCallback?: TcpErrorCallback;
  private closeCallback?: TcpCloseCallback;

  constructor(id: number, remoteAddress: string, remotePort: number) {
    this.id = id;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.eventEmitter = new NativeEventEmitter(TcpSocketModule);
    this.setupListeners();
  }

  private setupListeners(): void {
    this.eventEmitter.addListener('onTcpData', (event: TcpDataEvent) => {
      if (event.socketId === this.id) {
        this.dataCallback?.(event.data);
      }
    });

    this.eventEmitter.addListener('onTcpError', (event: TcpErrorEvent) => {
      if (event.socketId === this.id) {
        this.errorCallback?.(event.error);
      }
    });

    this.eventEmitter.addListener('onTcpClose', (event: TcpCloseEvent) => {
      if (event.socketId === this.id) {
        this.closeCallback?.();
      }
    });
  }

  onData(callback: TcpDataCallback): void {
    this.dataCallback = callback;
  }

  onError(callback: TcpErrorCallback): void {
    this.errorCallback = callback;
  }

  onClose(callback: TcpCloseCallback): void {
    this.closeCallback = callback;
  }

  async send(data: string): Promise<void> {
    await TcpSocketModule.send(this.id, data);
  }

  async close(): Promise<void> {
    await TcpSocketModule.close(this.id);
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
  await TcpSocketModule.send(socketId, data);
}

export async function close(socketId: number): Promise<void> {
  await TcpSocketModule.close(socketId);
}
