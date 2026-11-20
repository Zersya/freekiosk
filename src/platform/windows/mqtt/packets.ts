/**
 * MQTT packet encode/decode for Windows.
 * Implements MQTT 3.1.1 protocol — pure TypeScript.
 */

import { ByteBuffer, encodeRemainingLength, decodeRemainingLength } from '../net/bytes';

// MQTT Packet Types
export const PacketType = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

// QoS levels
export const QoS = {
  AT_MOST_ONCE: 0,
  AT_LEAST_ONCE: 1,
  EXACTLY_ONCE: 2,
} as const;

// Connect flags
export const ConnectFlags = {
  CLEAN_SESSION: 0x02,
  WILL_FLAG: 0x04,
  WILL_QOS0: 0x00,
  WILL_QOS1: 0x08,
  WILL_QOS2: 0x10,
  WILL_RETAIN: 0x20,
  PASSWORD_FLAG: 0x40,
  USERNAME_FLAG: 0x80,
} as const;

// Connect return codes
export const ConnectReturnCode = {
  ACCEPTED: 0,
  UNACCEPTABLE_PROTOCOL_VERSION: 1,
  IDENTIFIER_REJECTED: 2,
  SERVER_UNAVAILABLE: 3,
  BAD_USERNAME_OR_PASSWORD: 4,
  NOT_AUTHORIZED: 5,
} as const;

// Subscription options
export const SubscriptionOption = {
  QoS0: 0,
  QoS1: 1,
  QoS2: 2,
  NO_LOCAL: 0x04,
  RETAIN_AS_PUBLISHED: 0x08,
  RETAIN_HANDLING: 0x30,
} as const;

// Packet header
export interface PacketHeader {
  type: number;
  flags: number;
  remainingLength: number;
}

// CONNECT packet
export interface ConnectPacket {
  protocolName: string;
  protocolLevel: number;
  connectFlags: number;
  keepAlive: number;
  clientId: string;
  willTopic?: string;
  willMessage?: string;
  willQoS?: number;
  willRetain?: boolean;
  username?: string;
  password?: string;
}

// CONNACK packet
export interface ConnackPacket {
  sessionPresent: boolean;
  returnCode: number;
}

// PUBLISH packet
export interface PublishPacket {
  topic: string;
  packetId?: number;
  qos: number;
  retain: boolean;
  dup: boolean;
  payload: Uint8Array;
}

// SUBSCRIBE packet
export interface SubscribePacket {
  packetId: number;
  topics: { topic: string; qos: number }[];
}

// SUBACK packet
export interface SubackPacket {
  packetId: number;
  returnCodes: number[];
}

// UNSUBSCRIBE packet
export interface UnsubscribePacket {
  packetId: number;
  topics: string[];
}

// UNSUBACK packet
export interface UnsubackPacket {
  packetId: number;
}

// PUBACK/PUBREC/PUBREL/PUBCOMP packet
export interface AckPacket {
  packetId: number;
}

// Encode helpers
function encodeRemainingLengthBytes(length: number): number[] {
  return encodeRemainingLength(length);
}

// Encode CONNECT
export function encodeConnect(packet: ConnectPacket): Uint8Array {
  const buffer = new ByteBuffer();

  // Variable header
  const varHeader = new ByteBuffer();
  varHeader.writeString(packet.protocolName);
  varHeader.writeByte(packet.protocolLevel);
  varHeader.writeByte(packet.connectFlags);
  varHeader.writeUint16(packet.keepAlive);

  // Payload
  const payload = new ByteBuffer();
  payload.writeString(packet.clientId);

  if (packet.willTopic !== undefined) {
    payload.writeString(packet.willTopic);
    if (packet.willMessage !== undefined) {
      const msgBytes = new TextEncoder().encode(packet.willMessage);
      payload.writeUint16(msgBytes.length);
      payload.writeBytes(msgBytes);
    }
  }

  if (packet.username !== undefined) {
    payload.writeString(packet.username);
  }

  if (packet.password !== undefined) {
    const passBytes = new TextEncoder().encode(packet.password);
    payload.writeUint16(passBytes.length);
    payload.writeBytes(passBytes);
  }

  // Fixed header
  const remainingLength = varHeader.length + payload.length;
  const fixedHeader = new ByteBuffer();
  fixedHeader.writeByte((PacketType.CONNECT << 4) | 0x00);
  fixedHeader.writeBytes(encodeRemainingLengthBytes(remainingLength));

  // Combine
  buffer.writeBytes(fixedHeader.toUint8Array());
  buffer.writeBytes(varHeader.toUint8Array());
  buffer.writeBytes(payload.toUint8Array());

  return buffer.toUint8Array();
}

// Encode PUBLISH
export function encodePublish(packet: PublishPacket): Uint8Array {
  const buffer = new ByteBuffer();

  // Variable header
  const varHeader = new ByteBuffer();
  varHeader.writeString(packet.topic);

  const flags = (packet.qos << 1) | (packet.retain ? 1 : 0) | (packet.dup ? 8 : 0);

  if (packet.qos > 0 && packet.packetId !== undefined) {
    varHeader.writeUint16(packet.packetId);
  }

  // Fixed header
  const remainingLength = varHeader.length + packet.payload.length;
  const fixedHeader = new ByteBuffer();
  fixedHeader.writeByte((PacketType.PUBLISH << 4) | flags);
  fixedHeader.writeBytes(encodeRemainingLengthBytes(remainingLength));

  buffer.writeBytes(fixedHeader.toUint8Array());
  buffer.writeBytes(varHeader.toUint8Array());
  buffer.writeBytes(packet.payload);

  return buffer.toUint8Array();
}

// Encode SUBSCRIBE
export function encodeSubscribe(packet: SubscribePacket): Uint8Array {
  const buffer = new ByteBuffer();

  const varHeader = new ByteBuffer();
  varHeader.writeUint16(packet.packetId);

  const payload = new ByteBuffer();
  for (const sub of packet.topics) {
    payload.writeString(sub.topic);
    payload.writeByte(sub.qos);
  }

  const remainingLength = varHeader.length + payload.length;
  const fixedHeader = new ByteBuffer();
  fixedHeader.writeByte((PacketType.SUBSCRIBE << 4) | 0x02);
  fixedHeader.writeBytes(encodeRemainingLengthBytes(remainingLength));

  buffer.writeBytes(fixedHeader.toUint8Array());
  buffer.writeBytes(varHeader.toUint8Array());
  buffer.writeBytes(payload.toUint8Array());

  return buffer.toUint8Array();
}

// Encode UNSUBSCRIBE
export function encodeUnsubscribe(packet: UnsubscribePacket): Uint8Array {
  const buffer = new ByteBuffer();

  const varHeader = new ByteBuffer();
  varHeader.writeUint16(packet.packetId);

  const payload = new ByteBuffer();
  for (const topic of packet.topics) {
    payload.writeString(topic);
  }

  const remainingLength = varHeader.length + payload.length;
  const fixedHeader = new ByteBuffer();
  fixedHeader.writeByte((PacketType.UNSUBSCRIBE << 4) | 0x02);
  fixedHeader.writeBytes(encodeRemainingLengthBytes(remainingLength));

  buffer.writeBytes(fixedHeader.toUint8Array());
  buffer.writeBytes(varHeader.toUint8Array());
  buffer.writeBytes(payload.toUint8Array());

  return buffer.toUint8Array();
}

// Encode PINGREQ
export function encodePingReq(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

// Encode DISCONNECT
export function encodeDisconnect(): Uint8Array {
  return new Uint8Array([0xe0, 0x00]);
}

// Encode PUBACK/PUBREC/PUBREL/PUBCOMP
export function encodeAck(type: number, packetId: number): Uint8Array {
  const buffer = new ByteBuffer();
  const flags = type === PacketType.PUBREL ? 0x02 : 0x00;
  buffer.writeByte((type << 4) | flags);
  buffer.writeByte(0x02);
  buffer.writeUint16(packetId);
  return buffer.toUint8Array();
}

// Decode helpers
function decodeString(buffer: ByteBuffer): string {
  return buffer.readString();
}

// Decode packet header
export function decodePacketHeader(buffer: ByteBuffer): PacketHeader {
  const byte = buffer.readByte();
  const type = byte >> 4;
  const flags = byte & 0x0f;
  const remainingLength = decodeRemainingLength(buffer);
  return { type, flags, remainingLength };
}

// Decode CONNECT (server-side, for testing)
export function decodeConnect(buffer: ByteBuffer): ConnectPacket {
  const protocolName = decodeString(buffer);
  const protocolLevel = buffer.readByte();
  const connectFlags = buffer.readByte();
  const keepAlive = buffer.readUint16();
  const clientId = decodeString(buffer);

  const packet: ConnectPacket = {
    protocolName,
    protocolLevel,
    connectFlags,
    keepAlive,
    clientId,
  };

  if (connectFlags & ConnectFlags.WILL_FLAG) {
    packet.willTopic = decodeString(buffer);
    const willMsgLength = buffer.readUint16();
    const willMsgBytes = buffer.readBytes(willMsgLength);
    packet.willMessage = new TextDecoder().decode(willMsgBytes);
    packet.willQoS = (connectFlags >> 3) & 0x03;
    packet.willRetain = (connectFlags & ConnectFlags.WILL_RETAIN) !== 0;
  }

  if (connectFlags & ConnectFlags.USERNAME_FLAG) {
    packet.username = decodeString(buffer);
  }

  if (connectFlags & ConnectFlags.PASSWORD_FLAG) {
    const passLength = buffer.readUint16();
    const passBytes = buffer.readBytes(passLength);
    packet.password = new TextDecoder().decode(passBytes);
  }

  return packet;
}

// Decode CONNACK
export function decodeConnack(buffer: ByteBuffer): ConnackPacket {
  const flags = buffer.readByte();
  const returnCode = buffer.readByte();
  return {
    sessionPresent: (flags & 0x01) !== 0,
    returnCode,
  };
}

// Decode PUBLISH
export function decodePublish(buffer: ByteBuffer, header: PacketHeader): PublishPacket {
  const topic = decodeString(buffer);
  let packetId: number | undefined;
  const qos = (header.flags >> 1) & 0x03;
  const retain = (header.flags & 0x01) !== 0;
  const dup = (header.flags & 0x08) !== 0;

  if (qos > 0) {
    packetId = buffer.readUint16();
  }

  const payload = buffer.readBytes(buffer.remaining);

  return {
    topic,
    packetId,
    qos,
    retain,
    dup,
    payload,
  };
}

// Decode SUBSCRIBE
export function decodeSubscribe(buffer: ByteBuffer): SubscribePacket {
  const packetId = buffer.readUint16();
  const topics: { topic: string; qos: number }[] = [];

  while (buffer.remaining > 0) {
    const topic = decodeString(buffer);
    const qos = buffer.readByte() & 0x03;
    topics.push({ topic, qos });
  }

  return { packetId, topics };
}

// Decode SUBACK
export function decodeSuback(buffer: ByteBuffer): SubackPacket {
  const packetId = buffer.readUint16();
  const returnCodes: number[] = [];

  while (buffer.remaining > 0) {
    returnCodes.push(buffer.readByte());
  }

  return { packetId, returnCodes };
}

// Decode UNSUBSCRIBE
export function decodeUnsubscribe(buffer: ByteBuffer): UnsubscribePacket {
  const packetId = buffer.readUint16();
  const topics: string[] = [];

  while (buffer.remaining > 0) {
    topics.push(decodeString(buffer));
  }

  return { packetId, topics };
}

// Decode UNSUBACK
export function decodeUnsuback(buffer: ByteBuffer): UnsubackPacket {
  const packetId = buffer.readUint16();
  return { packetId };
}

// Decode ACK packets (PUBACK, PUBREC, PUBREL, PUBCOMP)
export function decodeAck(buffer: ByteBuffer): AckPacket {
  const packetId = buffer.readUint16();
  return { packetId };
}

// Decode PINGREQ/PINGRESP/DISCONNECT (no payload)
export function decodeEmpty(): void {
  // No-op — these packets have no payload
}

// Encode CONNACK (for broker-side testing)
export function encodeConnack(sessionPresent: boolean, returnCode: number): Uint8Array {
  const buffer = new ByteBuffer();
  buffer.writeByte((PacketType.CONNACK << 4) | 0x00);
  buffer.writeByte(0x02);
  buffer.writeByte(sessionPresent ? 0x01 : 0x00);
  buffer.writeByte(returnCode);
  return buffer.toUint8Array();
}

// Encode SUBACK
export function encodeSuback(packetId: number, returnCodes: number[]): Uint8Array {
  const buffer = new ByteBuffer();
  const payload = new ByteBuffer();
  payload.writeUint16(packetId);
  for (const code of returnCodes) {
    payload.writeByte(code);
  }

  buffer.writeByte((PacketType.SUBACK << 4) | 0x00);
  buffer.writeBytes(encodeRemainingLengthBytes(payload.length));
  buffer.writeBytes(payload.toUint8Array());
  return buffer.toUint8Array();
}

// Encode UNSUBACK
export function encodeUnsuback(packetId: number): Uint8Array {
  const buffer = new ByteBuffer();
  buffer.writeByte((PacketType.UNSUBACK << 4) | 0x00);
  buffer.writeByte(0x02);
  buffer.writeUint16(packetId);
  return buffer.toUint8Array();
}

// Encode PINGRESP
export function encodePingResp(): Uint8Array {
  return new Uint8Array([0xd0, 0x00]);
}
