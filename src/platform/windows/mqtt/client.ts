/**
 * MQTT client for Windows.
 * Implements MQTT 3.1.1 client over TCP.
 */

import { connect, TcpClient } from '../net/tcp';
import {
  encodeConnect,
  encodePublish,
  encodeSubscribe,
  encodeUnsubscribe,
  encodePingReq,
  encodeDisconnect,
  decodePacketHeader,
  decodeConnack,
  decodePublish,
  decodeSuback,
  decodeUnsuback,
  PacketType,
  QoS,
  ConnectFlags,
  ConnectReturnCode,
  ConnectPacket,
  PublishPacket,
  SubscribePacket,
  UnsubscribePacket,
} from './packets';
import { ByteBuffer } from '../net/bytes';

export interface MqttClientOptions {
  host: string;
  port: number;
  clientId: string;
  username?: string;
  password?: string;
  keepAlive?: number;
  cleanSession?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export interface MqttMessage {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  packetId?: number;
}

export type MqttMessageCallback = (message: MqttMessage) => void;
export type MqttConnectCallback = () => void;
export type MqttErrorCallback = (error: Error) => void;
export type MqttCloseCallback = () => void;

export class MqttClient {
  private options: MqttClientOptions;
  private socket?: TcpClient;
  private connected = false;
  private connecting = false;
  private subscriptions: Map<string, number> = new Map();
  private packetIdCounter = 1;
  private pingTimer?: number;
  private reconnectTimer?: number;
  private messageCallbacks: MqttMessageCallback[] = [];
  private connectCallbacks: MqttConnectCallback[] = [];
  private errorCallbacks: MqttErrorCallback[] = [];
  private closeCallbacks: MqttCloseCallback[] = [];
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(options: MqttClientOptions) {
    this.options = {
      keepAlive: 60,
      cleanSession: true,
      reconnect: true,
      reconnectInterval: 5000,
      ...options,
    };
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      this.socket = await connect(this.options.host, this.options.port);
      this.setupSocketListeners();

      const connectPacket = this.buildConnectPacket();
      const encoded = encodeConnect(connectPacket);
      await this.socket.send(this.uint8ToBinaryString(encoded));
    } catch (error) {
      this.connecting = false;
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      if (this.options.reconnect) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      const encoded = encodeDisconnect();
      await this.socket.send(this.uint8ToBinaryString(encoded));
      await this.socket.close();
      this.socket = undefined;
    }

    this.connected = false;
    this.connecting = false;
    this.clearPingTimer();
    this.clearReconnectTimer();
    this.emitClose();
  }

  async subscribe(topic: string, qos: number = QoS.AT_MOST_ONCE): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const packetId = this.getNextPacketId();
    const packet: SubscribePacket = {
      packetId,
      topics: [{ topic, qos }],
    };

    const encoded = encodeSubscribe(packet);
    await this.socket!.send(this.uint8ToBinaryString(encoded));
    this.subscriptions.set(topic, qos);
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const packetId = this.getNextPacketId();
    const packet: UnsubscribePacket = {
      packetId,
      topics: [topic],
    };

    const encoded = encodeUnsubscribe(packet);
    await this.socket!.send(this.uint8ToBinaryString(encoded));
    this.subscriptions.delete(topic);
  }

  async publish(topic: string, payload: string, qos: number = QoS.AT_MOST_ONCE, retain: boolean = false): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const packetId = qos > 0 ? this.getNextPacketId() : undefined;
    const payloadBytes = new TextEncoder().encode(payload);

    const packet: PublishPacket = {
      topic,
      packetId,
      qos,
      retain,
      dup: false,
      payload: payloadBytes,
    };

    const encoded = encodePublish(packet);
    await this.socket!.send(this.uint8ToBinaryString(encoded));
  }

  onMessage(callback: MqttMessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onConnect(callback: MqttConnectCallback): void {
    this.connectCallbacks.push(callback);
  }

  onError(callback: MqttErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  onClose(callback: MqttCloseCallback): void {
    this.closeCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private buildConnectPacket(): ConnectPacket {
    let connectFlags = ConnectFlags.CLEAN_SESSION;
    if (this.options.username) connectFlags |= ConnectFlags.USERNAME_FLAG;
    if (this.options.password) connectFlags |= ConnectFlags.PASSWORD_FLAG;

    return {
      protocolName: 'MQTT',
      protocolLevel: 4,
      connectFlags,
      keepAlive: this.options.keepAlive!,
      clientId: this.options.clientId,
      username: this.options.username,
      password: this.options.password,
    };
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.onData((data: string) => {
      this.handleData(data);
    });

    this.socket.onError((error: string) => {
      this.emitError(new Error(error));
      this.handleDisconnect();
    });

    this.socket.onClose(() => {
      this.handleDisconnect();
    });
  }

  private handleData(data: string): void {
    const newData = this.binaryStringToUint8Array(data);
    const combined = new Uint8Array(this.buffer.length + newData.length);
    combined.set(this.buffer);
    combined.set(newData, this.buffer.length);
    this.buffer = combined;

    this.processBuffer();
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      try {
        const buffer = ByteBuffer.from(this.buffer);
        const header = decodePacketHeader(buffer);

        if (buffer.remaining < header.remainingLength) {
          // Not enough data for full packet
          break;
        }

        const packetData = buffer.readBytes(header.remainingLength);
        const packetBuffer = ByteBuffer.from(packetData);

        this.handlePacket(header.type, header.flags, packetBuffer);

        // Remove processed packet from buffer
        const consumed = this.buffer.length - buffer.remaining;
        this.buffer = this.buffer.slice(consumed);
      } catch (error) {
        console.error('MQTT packet processing error:', error);
        break;
      }
    }
  }

  private handlePacket(type: number, flags: number, buffer: ByteBuffer): void {
    switch (type) {
      case PacketType.CONNACK:
        this.handleConnack(buffer);
        break;
      case PacketType.PUBLISH:
        this.handlePublish(flags, buffer);
        break;
      case PacketType.SUBACK:
        this.handleSuback(buffer);
        break;
      case PacketType.UNSUBACK:
        this.handleUnsuback(buffer);
        break;
      case PacketType.PINGRESP:
        // Ping response received, connection is alive
        break;
      case PacketType.PUBACK:
      case PacketType.PUBREC:
      case PacketType.PUBREL:
      case PacketType.PUBCOMP:
        // Acknowledgment received
        break;
      default:
        console.warn('Unknown MQTT packet type:', type);
    }
  }

  private handleConnack(buffer: ByteBuffer): void {
    const connack = decodeConnack(buffer);

    if (connack.returnCode === ConnectReturnCode.ACCEPTED) {
      this.connected = true;
      this.connecting = false;
      this.startPingTimer();
      this.emitConnect();

      // Resubscribe to all topics
      for (const [topic, qos] of this.subscriptions) {
        this.subscribe(topic, qos).catch(console.error);
      }
    } else {
      this.connecting = false;
      const error = new Error(`MQTT connection refused: ${connack.returnCode}`);
      this.emitError(error);
      this.handleDisconnect();
    }
  }

  private handlePublish(flags: number, buffer: ByteBuffer): void {
    const header = {
      type: PacketType.PUBLISH,
      flags,
      remainingLength: buffer.length,
    };
    const publish = decodePublish(buffer, header);
    const payload = new TextDecoder().decode(publish.payload);

    const message: MqttMessage = {
      topic: publish.topic,
      payload,
      qos: publish.qos,
      retain: publish.retain,
      packetId: publish.packetId,
    };

    this.emitMessage(message);
  }

  private handleSuback(buffer: ByteBuffer): void {
    decodeSuback(buffer);
    // Subscription acknowledged
  }

  private handleUnsuback(buffer: ByteBuffer): void {
    decodeUnsuback(buffer);
    // Unsubscription acknowledged
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.connecting = false;
    this.clearPingTimer();
    this.emitClose();

    if (this.options.reconnect) {
      this.scheduleReconnect();
    }
  }

  private startPingTimer(): void {
    this.clearPingTimer();
    const interval = (this.options.keepAlive || 60) * 1000;
    this.pingTimer = setInterval(() => {
      if (this.connected && this.socket) {
        const encoded = encodePingReq();
        this.socket.send(this.uint8ToBinaryString(encoded)).catch((error: unknown) => {
          console.error('MQTT ping failed:', error);
        });
      }
    }, interval);
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('MQTT reconnect failed:', error);
      });
    }, this.options.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private getNextPacketId(): number {
    const id = this.packetIdCounter;
    this.packetIdCounter = (this.packetIdCounter + 1) % 65535;
    if (this.packetIdCounter === 0) {
      this.packetIdCounter = 1;
    }
    return id;
  }

  private uint8ToBinaryString(data: Uint8Array): string {
    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data[i]);
    }
    return result;
  }

  private binaryStringToUint8Array(str: string): Uint8Array {
    const result = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      result[i] = str.charCodeAt(i) & 0xff;
    }
    return result;
  }

  private emitMessage(message: MqttMessage): void {
    for (const callback of this.messageCallbacks) {
      callback(message);
    }
  }

  private emitConnect(): void {
    for (const callback of this.connectCallbacks) {
      callback();
    }
  }

  private emitError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      callback(error);
    }
  }

  private emitClose(): void {
    for (const callback of this.closeCallbacks) {
      callback();
    }
  }
}

// Singleton instance
let instance: MqttClient | null = null;

export function getMqttClient(options?: MqttClientOptions): MqttClient {
  if (!instance && options) {
    instance = new MqttClient(options);
  }
  if (!instance) {
    throw new Error('MQTT client not initialized');
  }
  return instance;
}

export function createMqttClient(options: MqttClientOptions): MqttClient {
  instance = new MqttClient(options);
  return instance;
}

export async function connectMqtt(options: MqttClientOptions): Promise<MqttClient> {
  const client = createMqttClient(options);
  await client.connect();
  return client;
}

export async function disconnectMqtt(): Promise<void> {
  if (instance) {
    await instance.disconnect();
    instance = null;
  }
}
