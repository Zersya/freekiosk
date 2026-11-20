/**
 * MqttModule.windows.ts
 * Windows implementation of the MQTT client bridge.
 * Uses the TS protocol layer (MqttClient) instead of native modules.
 */

import { MqttClient, MqttClientOptions, MqttMessage } from '../platform/windows/mqtt/client';
import { generateDiscoveryEntities, buildDiscoveryTopic, DiscoveryConfig } from '../platform/windows/mqtt/discovery';
import { findCommandByTopic } from '../platform/windows/mqtt/commandMap';
import { QoS } from '../platform/windows/mqtt/packets';

export interface MqttConfig {
  brokerUrl: string;
  port: number;
  username?: string;
  password?: string;
  clientId?: string;
  baseTopic: string;
  discoveryPrefix: string;
  statusInterval: number;
  allowControl: boolean;
  deviceName?: string;
  useTls?: boolean;
}

class MqttClientService {
  private client?: MqttClient;
  private config?: MqttConfig;
  private status: Record<string, unknown> = {};
  private statusTimer?: ReturnType<typeof setInterval>;
  private connectionListeners: ((connected: boolean) => void)[] = [];
  private errorListeners: ((message: string) => void)[] = [];
  private commandListener?: (command: string, params: Record<string, unknown>) => void;

  constructor() {
    // Windows uses TS implementation, no native module needed
  }

  /**
   * Get the device model name for pre-filling the MQTT Device Name field.
   */
  async getDeviceModel(): Promise<string> {
    return 'Windows PC';
  }

  /**
   * Start the MQTT client
   */
  async start(config: MqttConfig): Promise<boolean> {
    if (this.client) {
      await this.stop();
    }

    this.config = config;

    const clientId = config.clientId || `freekiosk_${Date.now()}`;
    const options: MqttClientOptions = {
      host: config.brokerUrl,
      port: config.port,
      clientId,
      username: config.username,
      password: config.password,
      keepAlive: 60,
      cleanSession: true,
      reconnect: true,
      reconnectInterval: 5000,
    };

    this.client = new MqttClient(options);

    // Set up event handlers
    this.client.onConnect(() => {
      this.emitConnectionChanged(true);
      this.onConnected();
    });

    this.client.onClose(() => {
      this.emitConnectionChanged(false);
    });

    this.client.onError((error) => {
      this.emitConnectionError(error.message);
    });

    this.client.onMessage((message) => {
      this.handleMessage(message);
    });

    await this.client.connect();
    return true;
  }

  /**
   * Stop the MQTT client
   */
  async stop(): Promise<boolean> {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = undefined;
    }

    if (this.client) {
      await this.client.disconnect();
      this.client = undefined;
    }

    this.config = undefined;
    return true;
  }

  /**
   * Check if MQTT client is connected
   */
  async isConnected(): Promise<boolean> {
    return this.client?.isConnected() ?? false;
  }

  /**
   * Update status that will be published via MQTT
   */
  updateStatus(status: Record<string, unknown>): void {
    this.status = status;
  }

  /**
   * Subscribe to MQTT connection state changes
   */
  onConnectionChanged(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.push(callback);
    return () => {
      const index = this.connectionListeners.indexOf(callback);
      if (index >= 0) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to MQTT connection error events
   */
  onConnectionError(callback: (message: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
      const index = this.errorListeners.indexOf(callback);
      if (index >= 0) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * Set command listener for MQTT commands
   */
  onCommand(callback: (command: string, params: Record<string, unknown>) => void): void {
    this.commandListener = callback;
  }

  // Private methods

  private async onConnected(): Promise<void> {
    if (!this.client || !this.config) return;

    const baseTopic = this.config.baseTopic || 'freekiosk';

    // Subscribe to command topics
    const commandTopics = [
      `${baseTopic}/command/screen`,
      `${baseTopic}/command/brightness`,
      `${baseTopic}/command/volume`,
      `${baseTopic}/command/kiosk`,
      `${baseTopic}/command/reload`,
      `${baseTopic}/command/back`,
      `${baseTopic}/command/home`,
      `${baseTopic}/command/url`,
      `${baseTopic}/command/restart`,
      `${baseTopic}/command/screenshot`,
      `${baseTopic}/command/lock`,
      `${baseTopic}/command/unlock`,
      `${baseTopic}/command/key`,
      `${baseTopic}/command/text`,
    ];

    for (const topic of commandTopics) {
      await this.client.subscribe(topic, QoS.AT_MOST_ONCE);
    }

    // Publish Home Assistant discovery
    await this.publishDiscovery();

    // Start status publishing
    this.startStatusPublishing();

    // Publish initial status
    await this.publishStatus();
  }

  private async publishDiscovery(): Promise<void> {
    if (!this.client || !this.config) return;

    const discoveryConfig: DiscoveryConfig = {
      deviceName: this.config.deviceName || 'FreeKiosk Windows',
      manufacturer: 'FreeKiosk',
      model: 'Windows Kiosk',
      firmwareVersion: '1.2.0',
      hostname: 'localhost',
    };

    const entities = generateDiscoveryEntities(discoveryConfig);
    // discoveryPrefix is currently unused — buildDiscoveryTopic uses HA_DISCOVERY_PREFIX constant

    for (const entity of entities) {
      const topic = buildDiscoveryTopic(entity.component, entity.nodeId, entity.objectId);
      const payload = JSON.stringify(entity.config);
      await this.client.publish(topic, payload, QoS.AT_LEAST_ONCE, true);
    }
  }

  private startStatusPublishing(): void {
    if (!this.config) return;

    const interval = this.config.statusInterval || 30000;
    this.statusTimer = setInterval(() => {
      this.publishStatus().catch(console.error);
    }, interval);
  }

  private async publishStatus(): Promise<void> {
    if (!this.client || !this.config) return;

    const baseTopic = this.config.baseTopic || 'freekiosk';
    const stateTopic = `${baseTopic}/state`;
    const availabilityTopic = `${baseTopic}/availability`;

    // Publish availability
    await this.client.publish(availabilityTopic, 'online', QoS.AT_MOST_ONCE, true);

    // Publish state
    const statePayload = JSON.stringify(this.status);
    await this.client.publish(stateTopic, statePayload, QoS.AT_MOST_ONCE, false);
  }

  private handleMessage(message: MqttMessage): void {
    const command = findCommandByTopic(message.topic);
    if (!command) {
      console.warn('Unknown MQTT command topic:', message.topic);
      return;
    }

    if (!this.config?.allowControl) {
      console.warn('MQTT control disabled, ignoring command:', message.topic);
      return;
    }

    const params = this.parsePayload(message.payload);
    const commandName = this.mapTopicToCommandName(message.topic);

    if (this.commandListener) {
      this.commandListener(commandName, params);
    }
  }

  private parsePayload(payload: string): Record<string, unknown> {
    try {
      return JSON.parse(payload);
    } catch {
      return { value: payload };
    }
  }

  private mapTopicToCommandName(topic: string): string {
    const mapping: Record<string, string> = {
      'screen': 'screenOn',
      'brightness': 'setBrightness',
      'volume': 'setVolume',
      'kiosk': 'kioskMode',
      'reload': 'reload',
      'back': 'back',
      'home': 'home',
      'url': 'setUrl',
      'restart': 'restart',
      'screenshot': 'screenshot',
      'lock': 'lock',
      'unlock': 'unlock',
      'key': 'key',
      'text': 'text',
    };

    const parts = topic.split('/');
    const commandPart = parts[parts.length - 1];
    return mapping[commandPart] || commandPart;
  }

  private emitConnectionChanged(connected: boolean): void {
    for (const callback of this.connectionListeners) {
      callback(connected);
    }
  }

  private emitConnectionError(message: string): void {
    for (const callback of this.errorListeners) {
      callback(message);
    }
  }
}

// Export singleton instance
export const mqttClient = new MqttClientService();

// MqttConfig is already exported as interface above
