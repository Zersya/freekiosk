/**
 * HttpServerModule.windows.ts
 * Windows implementation of the HTTP server bridge.
 * Uses the TS protocol layer (WindowsRestServer) instead of native modules.
 */

import { NativeEventEmitter } from 'react-native';
import { HttpRequest, HttpResponse } from '../platform/windows/rest/httpParser';
import { handleRestRequest } from '../platform/windows/rest/restApi';
import { HttpServer, withCors } from '../platform/windows/rest/httpServer';

interface ServerInfo {
  running: boolean;
  ip: string;
}

interface StartResult {
  success: boolean;
  port: number;
  ip: string;
}

interface ApiCommand {
  command: string;
  params: string;
}

class HttpServerService {
  private server?: HttpServer;
  private eventEmitter: NativeEventEmitter | null = null;
  private commandListener: ((command: string, params: Record<string, unknown>) => void) | null = null;
  private status: Record<string, unknown> = {};
  private port = 8080;
  private apiKey: string | null = null;
  private allowControl = true;
  private running = false;

  constructor() {
    // Windows uses TS implementation, no native module needed
  }

  /**
   * Start the HTTP server
   */
  async startServer(
    port: number = 8080,
    apiKey: string | null = null,
    allowControl: boolean = true
  ): Promise<StartResult> {
    if (this.running) {
      throw new Error('HTTP server already running');
    }

    this.port = port;
    this.apiKey = apiKey;
    this.allowControl = allowControl;

    const handler = withCors(async (request: HttpRequest): Promise<HttpResponse> => {
      return this.handleRequest(request);
    });

    this.server = new HttpServer(port, handler);
    await this.server.start();
    this.running = true;

    return {
      success: true,
      port,
      ip: this.getLocalIpSync(),
    };
  }

  /**
   * Stop the HTTP server
   */
  async stopServer(): Promise<boolean> {
    if (!this.running || !this.server) {
      return false;
    }

    await this.server.stop();
    this.server = undefined;
    this.running = false;
    return true;
  }

  /**
   * Check if server is running
   */
  async isRunning(): Promise<boolean> {
    return this.running;
  }

  /**
   * Get server info (running status and IP)
   */
  async getServerInfo(): Promise<ServerInfo> {
    return {
      running: this.running,
      ip: this.getLocalIpSync(),
    };
  }

  /**
   * Get local IP address
   */
  async getLocalIp(): Promise<string> {
    return this.getLocalIpSync();
  }

  /**
   * Update status that will be returned by the API
   */
  updateStatus(status: Record<string, unknown>): void {
    this.status = status;
  }

  /**
   * Subscribe to API commands from external clients
   */
  onCommand(callback: (command: string, params: Record<string, unknown>) => void): () => void {
    this.commandListener = callback;
    return () => {
      this.commandListener = null;
    };
  }

  /**
   * Get available cameras (not supported on Windows)
   */
  async getCamera2Devices(): Promise<Array<{ id: string; position: 'front' | 'back' | string; maxWidth: number; maxHeight: number }>> {
    return [];
  }

  /**
   * Capture a photo (not supported on Windows)
   */
  async captureCamera2Photo(_cameraFacing: string = 'front', _quality: number = 50): Promise<string | null> {
    return null;
  }

  // Private methods

  private async handleRequest(request: HttpRequest): Promise<HttpResponse> {
    // Check API key if required
    if (this.apiKey && this.apiKey.length > 0) {
      const authHeader = request.headers['authorization'] || request.headers['x-api-key'];
      if (authHeader !== this.apiKey && authHeader !== `Bearer ${this.apiKey}`) {
        return {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid API key' }),
        };
      }
    }

    // Emit command event for ApiService to handle
    const command = this.mapPathToCommand(request.path);
    if (command && this.commandListener) {
      const params = this.parseBody(request.body);
      this.commandListener(command, params);
    }

    // Also handle via REST API for direct responses
    return handleRestRequest(request);
  }

  private mapPathToCommand(path: string): string | null {
    const mapping: Record<string, string> = {
      '/api/brightness': 'setBrightness',
      '/api/screen': 'screenOn',
      '/api/kiosk': 'kioskMode',
      '/api/reload': 'reload',
      '/api/back': 'back',
      '/api/home': 'home',
      '/api/url': 'setUrl',
      '/api/volume': 'setVolume',
      '/api/restart': 'restart',
      '/api/screenshot': 'screenshot',
      '/api/lock': 'lock',
      '/api/unlock': 'unlock',
      '/api/key': 'key',
      '/api/text': 'text',
    };
    return mapping[path] || null;
  }

  private parseBody(body: string): Record<string, unknown> {
    if (!body) return {};
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  private getLocalIpSync(): string {
    // Windows implementation will use native module in Step 6
    // For now, return a placeholder
    return '0.0.0.0';
  }
}

// Export singleton instance
export const httpServer = new HttpServerService();

// Export types
export type { ServerInfo, StartResult, ApiCommand };
