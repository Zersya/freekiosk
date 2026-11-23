/**
 * HttpServerModule.windows.ts
 * Windows implementation of the HTTP server bridge.
 * Uses the TS protocol layer (rest/HttpServer) instead of native modules.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { HttpRequest, HttpResponse } from '../platform/windows/rest/httpParser';
import { handleRestRequest } from '../platform/windows/rest/restApi';
import { HttpServer } from '../platform/windows/rest/httpServer';
import { setAppStatus } from '../platform/windows/status/appStatusStore';

const { SystemInfoModule } = NativeModules;

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

    this.server = new HttpServer(port, (request) => this.handleRequest(request));
    await this.server.start();
    this.running = true;

    return {
      success: true,
      port,
      ip: await this.getLocalIp(),
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
      ip: await this.getLocalIp(),
    };
  }

  /**
   * Get local IP address
   */
  async getLocalIp(): Promise<string> {
    try {
      return await SystemInfoModule.getIpAddress();
    } catch {
      return '0.0.0.0';
    }
  }

  /**
   * Update status that will be returned by the API
   */
  updateStatus(status: Record<string, unknown>): void {
    this.status = status;
    setAppStatus(status);
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
    // Emit command event for ApiService to handle
    const command = this.mapPathToCommand(request.path);
    if (command && this.commandListener) {
      const params = this.parseBody(request.body);
      this.commandListener(command, params);
    }

    // Routing, auth (X-Api-Key) and control gating live in restApi.
    return handleRestRequest(request, { apiKey: this.apiKey, allowControl: this.allowControl });
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
      '/api/lock': 'lock',
      '/api/unlock': 'unlock',
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

}

// Export singleton instance
export const httpServer = new HttpServerService();

// Export types
export type { ServerInfo, StartResult, ApiCommand };
