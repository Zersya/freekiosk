/**
 * HTTP server for Windows REST API.
 * Uses TCP abstraction to handle HTTP connections.
 */

import { createServer, TcpServer, TcpSocket } from '../net/tcp';
import {
  parseHttpRequest,
  buildHttpResponse,
  HttpRequest,
  HttpResponse,
  errorResponse,
} from './httpParser';

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

  private async handleConnection(socket: TcpSocket): Promise<void> {
    let buffer = '';

    this.server?.onData(socket.id, async (data: string) => {
      buffer += data;

      // Check if we have a complete HTTP request
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return; // Wait for more data
      }

      // Extract Content-Length to determine body size
      const headers = buffer.slice(0, headerEnd);
      const contentLengthMatch = headers.match(/content-length:\s*(\d+)/i);
      const contentLength = contentLengthMatch ? parseInt(contentLengthMatch[1], 10) : 0;
      const bodyStart = headerEnd + 4;
      const expectedLength = bodyStart + contentLength;

      if (buffer.length < expectedLength) {
        return; // Wait for more data
      }

      const rawRequest = buffer.slice(0, expectedLength);
      buffer = buffer.slice(expectedLength); // Keep any extra data

      try {
        const request = parseHttpRequest(rawRequest);
        const response = await this.handler(request);
        const httpResponse = buildHttpResponse(response);
        await this.server?.send(socket.id, httpResponse);
      } catch (error) {
        console.error('HTTP request handling error:', error);
        const errorResp = errorResponse(500, 'Internal Server Error');
        const httpResponse = buildHttpResponse(errorResp);
        await this.server?.send(socket.id, httpResponse);
      }

      // Close connection after response (HTTP/1.0 style for simplicity)
      await this.server?.close(socket.id);
    });
  }
}

// Default request handler that routes to REST API
export async function defaultRequestHandler(_request: HttpRequest): Promise<HttpResponse> {
  // This will be overridden by WindowsRestServer
  return errorResponse(404, 'Not Found');
}

// Helper to create a simple HTTP server
export async function createHttpServer(port: number, handler?: RequestHandler): Promise<HttpServer> {
  const server = new HttpServer(port, handler || defaultRequestHandler);
  await server.start();
  return server;
}

// Helper for CORS headers
export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  };
}

// Handle OPTIONS preflight
export function handleOptions(): HttpResponse {
  return {
    status: 204,
    statusText: 'No Content',
    headers: corsHeaders(),
    body: '',
  };
}

// Wrap handler with CORS
export function withCors(handler: RequestHandler): RequestHandler {
  return async (request) => {
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }
    const response = await handler(request);
    response.headers = { ...corsHeaders(), ...response.headers };
    return response;
  };
}
