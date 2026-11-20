/**
 * Windows REST server — main entry point.
 * Combines HTTP server with REST API routing.
 */

import { HttpServer, withCors } from './httpServer';
import { handleRestRequest } from './restApi';
import { HttpRequest } from './httpParser';

export class WindowsRestServer {
  private server?: HttpServer;
  private port: number;
  private running = false;

  constructor(port: number = 8080) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('REST server already running');
    }

    const handler = withCors(async (request: HttpRequest) => {
      return handleRestRequest(request);
    });

    this.server = new HttpServer(this.port, handler);
    await this.server.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    await this.server.stop();
    this.server = undefined;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.port;
  }
}

// Singleton instance
let instance: WindowsRestServer | null = null;

export function getRestServer(): WindowsRestServer {
  if (!instance) {
    instance = new WindowsRestServer();
  }
  return instance;
}

export async function startRestServer(port?: number): Promise<WindowsRestServer> {
  const server = port ? new WindowsRestServer(port) : getRestServer();
  await server.start();
  return server;
}

export async function stopRestServer(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = null;
  }
}
