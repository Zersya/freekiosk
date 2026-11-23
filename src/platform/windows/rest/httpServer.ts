/**
 * HTTP server for the Windows REST API.
 * Buffers binary strings over the TCP abstraction and serializes the
 * three response kinds: UTF-8 text, base64 binary, and MJPEG streams.
 */

import { createServer, TcpServer, TcpSocket } from '../net/tcp';
import {
  parseHttpRequest,
  serializeHead,
  bodyByteLength,
  HttpRequest,
  HttpResponse,
  jsonError,
} from './httpParser';
import { utf8Encode, bytesToBinaryString } from '../net/bytes';

const MAX_HEAD_BYTES = 16 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const MJPEG_INTERVAL_MS = 250;
const MJPEG_QUALITY = 60;
const MJPEG_MAX_DIMENSION = 1080;

export interface RequestHandler {
  (request: HttpRequest): Promise<HttpResponse>;
}

export class HttpServer {
  private server?: TcpServer;
  private port: number;
  private handler: RequestHandler;
  private running = false;

  constructor(port: number, handler: RequestHandler) {
    this.port = port;
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Server already running');
    }

    this.server = await createServer(this.port);
    this.server.onConnection((socket: TcpSocket) => {
      this.handleConnection(socket);
    });
    this.server.onError((error: string) => {
      console.error('HTTP server error:', error);
    });

    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    for (const socket of this.server.getConnections()) {
      await this.server.close(socket.id);
    }
    await this.server.closeServer();
    this.server = undefined;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.port;
  }

  private async sendResponse(socketId: number, response: HttpResponse): Promise<boolean> {
    if (response.stream === 'mjpeg') {
      await this.server?.send(socketId, serializeHead(response, null));
      await this.server?.startMjpegStream(
        socketId,
        MJPEG_INTERVAL_MS,
        MJPEG_QUALITY,
        MJPEG_MAX_DIMENSION
      );
      // The native stream loop owns the socket now — do not close it.
      return false;
    }

    if (response.bodyBase64 !== undefined) {
      const head = serializeHead(response, bodyByteLength(response));
      await this.server?.send(socketId, head);
      await this.server?.sendBase64(socketId, response.bodyBase64);
      return true;
    }

    const body = response.body ?? '';
    const head = serializeHead(response, bodyByteLength(response));
    const payload = head + bytesToBinaryString(utf8Encode(body));
    await this.server?.send(socketId, payload);
    return true;
  }

  private async handleConnection(socket: TcpSocket): Promise<void> {
    // Binary string buffer: one char code per byte so binary bodies survive.
    let buffer = '';

    this.server?.onData(socket.id, async (data: string) => {
      buffer += data;

      const headEnd = buffer.indexOf('\r\n\r\n');
      if (headEnd === -1) {
        if (buffer.length > MAX_HEAD_BYTES) {
          await this.sendResponse(socket.id, jsonError(413, 'Request header too large'));
          await this.server?.close(socket.id);
        }
        return; // Wait for more data
      }
      if (headEnd > MAX_HEAD_BYTES) {
        await this.sendResponse(socket.id, jsonError(413, 'Request header too large'));
        await this.server?.close(socket.id);
        return;
      }

      // Content-Length counts bytes == binary string length.
      const headers = buffer.slice(0, headEnd);
      const contentLengthMatch = headers.match(/content-length:\s*(\d+)/i);
      const contentLength = contentLengthMatch ? parseInt(contentLengthMatch[1], 10) : 0;

      if (contentLength > MAX_BODY_BYTES) {
        await this.sendResponse(socket.id, jsonError(413, 'Request body too large'));
        await this.server?.close(socket.id);
        return;
      }

      const expectedLength = headEnd + 4 + contentLength;
      if (buffer.length < expectedLength) {
        return; // Wait for more data
      }

      const rawRequest = buffer.slice(0, expectedLength);
      buffer = buffer.slice(expectedLength); // Keep any extra data

      try {
        const request = parseHttpRequest(rawRequest);
        const response = await this.handler(request);
        const shouldClose = await this.sendResponse(socket.id, response);
        if (shouldClose) {
          await this.server?.close(socket.id);
        }
      } catch (error) {
        console.error('HTTP request handling error:', error);
        await this.sendResponse(socket.id, jsonError(500, 'Internal Server Error'));
        await this.server?.close(socket.id);
      }
    });
  }
}
