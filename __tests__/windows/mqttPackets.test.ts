/**
 * Tests for Windows MQTT packets.
 */

import {
  encodeConnect,
  decodeConnect,
  encodePublish,
  decodePublish,
  encodeSubscribe,
  decodeSubscribe,
  encodeUnsubscribe,
  decodeUnsubscribe,
  encodePingReq,
  encodeDisconnect,
  encodeAck,
  decodeSuback,
  encodeConnack,
  decodeConnack,
  encodeSuback,
  PacketType,
  QoS,
  ConnectFlags,
  ConnectReturnCode,
} from '../../src/platform/windows/mqtt/packets';
import { ByteBuffer } from '../../src/platform/windows/net/bytes';

describe('MQTT CONNECT packet', () => {
  it('encodes and decodes a basic CONNECT packet', () => {
    const packet = {
      protocolName: 'MQTT',
      protocolLevel: 4,
      connectFlags: ConnectFlags.CLEAN_SESSION,
      keepAlive: 60,
      clientId: 'test-client',
    };

    const encoded = encodeConnect(packet);
    const buffer = ByteBuffer.from(encoded);

    // Skip fixed header (type + remaining length)
    buffer.readByte(); // type
    buffer.readRemainingLength();

    const decoded = decodeConnect(buffer);
    expect(decoded.protocolName).toBe('MQTT');
    expect(decoded.protocolLevel).toBe(4);
    expect(decoded.clientId).toBe('test-client');
    expect(decoded.keepAlive).toBe(60);
  });

  it('encodes CONNECT with username and password', () => {
    const packet = {
      protocolName: 'MQTT',
      protocolLevel: 4,
      connectFlags: ConnectFlags.CLEAN_SESSION | ConnectFlags.USERNAME_FLAG | ConnectFlags.PASSWORD_FLAG,
      keepAlive: 60,
      clientId: 'test-client',
      username: 'user',
      password: 'pass',
    };

    const encoded = encodeConnect(packet);
    const buffer = ByteBuffer.from(encoded);

    buffer.readByte();
    buffer.readRemainingLength();

    const decoded = decodeConnect(buffer);
    expect(decoded.username).toBe('user');
    expect(decoded.password).toBe('pass');
  });
});

describe('MQTT PUBLISH packet', () => {
  it('encodes and decodes a basic PUBLISH packet', () => {
    const packet = {
      topic: 'test/topic',
      qos: QoS.AT_MOST_ONCE,
      retain: false,
      dup: false,
      payload: new TextEncoder().encode('Hello MQTT'),
    };

    const encoded = encodePublish(packet);
    const buffer = ByteBuffer.from(encoded);

    // Skip fixed header
    const headerByte = buffer.readByte();
    const type = headerByte >> 4;
    const flags = headerByte & 0x0f;
    const remainingLength = buffer.readRemainingLength();

    expect(type).toBe(PacketType.PUBLISH);
    expect(flags & 0x06).toBe(0); // QoS 0

    const header = { type, flags, remainingLength };
    const decoded = decodePublish(buffer, header);

    expect(decoded.topic).toBe('test/topic');
    expect(decoded.qos).toBe(QoS.AT_MOST_ONCE);
    expect(decoded.payload).toEqual(packet.payload);
  });

  it('encodes PUBLISH with QoS 1 and packet ID', () => {
    const packet = {
      topic: 'test/topic',
      packetId: 1234,
      qos: QoS.AT_LEAST_ONCE,
      retain: true,
      dup: false,
      payload: new TextEncoder().encode('QoS1 message'),
    };

    const encoded = encodePublish(packet);
    const buffer = ByteBuffer.from(encoded);

    const headerByte = buffer.readByte();
    const flags = headerByte & 0x0f;
    const remainingLength = buffer.readRemainingLength();

    const header = { type: PacketType.PUBLISH, flags, remainingLength };
    const decoded = decodePublish(buffer, header);

    expect(decoded.qos).toBe(QoS.AT_LEAST_ONCE);
    expect(decoded.packetId).toBe(1234);
    expect(decoded.retain).toBe(true);
  });
});

describe('MQTT SUBSCRIBE packet', () => {
  it('encodes and decodes a SUBSCRIBE packet', () => {
    const packet = {
      packetId: 1,
      topics: [
        { topic: 'test/topic1', qos: QoS.AT_MOST_ONCE },
        { topic: 'test/topic2', qos: QoS.AT_LEAST_ONCE },
      ],
    };

    const encoded = encodeSubscribe(packet);
    const buffer = ByteBuffer.from(encoded);

    // Skip fixed header
    buffer.readByte();
    buffer.readRemainingLength();

    const decoded = decodeSubscribe(buffer);
    expect(decoded.packetId).toBe(1);
    expect(decoded.topics).toHaveLength(2);
    expect(decoded.topics[0].topic).toBe('test/topic1');
    expect(decoded.topics[0].qos).toBe(QoS.AT_MOST_ONCE);
    expect(decoded.topics[1].topic).toBe('test/topic2');
    expect(decoded.topics[1].qos).toBe(QoS.AT_LEAST_ONCE);
  });
});

describe('MQTT UNSUBSCRIBE packet', () => {
  it('encodes and decodes an UNSUBSCRIBE packet', () => {
    const packet = {
      packetId: 2,
      topics: ['test/topic1', 'test/topic2'],
    };

    const encoded = encodeUnsubscribe(packet);
    const buffer = ByteBuffer.from(encoded);

    buffer.readByte();
    buffer.readRemainingLength();

    const decoded = decodeUnsubscribe(buffer);
    expect(decoded.packetId).toBe(2);
    expect(decoded.topics).toEqual(['test/topic1', 'test/topic2']);
  });
});

describe('MQTT control packets', () => {
  it('encodes PINGREQ correctly', () => {
    const encoded = encodePingReq();
    expect(encoded).toEqual(new Uint8Array([0xc0, 0x00]));
  });

  it('encodes DISCONNECT correctly', () => {
    const encoded = encodeDisconnect();
    expect(encoded).toEqual(new Uint8Array([0xe0, 0x00]));
  });

  it('encodes ACK packets', () => {
    const encoded = encodeAck(PacketType.PUBACK, 1234);
    expect(encoded[0]).toBe((PacketType.PUBACK << 4) | 0x00);
    expect(encoded[1]).toBe(0x02);
    expect(encoded[2]).toBe(0x04);
    expect(encoded[3]).toBe(0xd2);
  });
});

describe('MQTT CONNACK packet', () => {
  it('encodes and decodes CONNACK', () => {
    const encoded = encodeConnack(true, ConnectReturnCode.ACCEPTED);
    const buffer = ByteBuffer.from(encoded);

    buffer.readByte(); // type
    buffer.readByte(); // remaining length

    const decoded = decodeConnack(buffer);
    expect(decoded.sessionPresent).toBe(true);
    expect(decoded.returnCode).toBe(ConnectReturnCode.ACCEPTED);
  });
});

describe('MQTT SUBACK packet', () => {
  it('encodes and decodes SUBACK', () => {
    const encoded = encodeSuback(1, [QoS.AT_MOST_ONCE, QoS.AT_LEAST_ONCE]);
    const buffer = ByteBuffer.from(encoded);

    buffer.readByte(); // type
    buffer.readRemainingLength();

    const decoded = decodeSuback(buffer);
    expect(decoded.packetId).toBe(1);
    expect(decoded.returnCodes).toEqual([QoS.AT_MOST_ONCE, QoS.AT_LEAST_ONCE]);
  });
});
