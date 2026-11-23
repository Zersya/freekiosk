/**
 * Tests for Windows byte buffer utilities.
 */

import { ByteBuffer, encodeRemainingLength, decodeRemainingLength } from '../../src/platform/windows/net/bytes';

describe('ByteBuffer', () => {
  describe('write methods', () => {
    it('writes a single byte', () => {
      const buf = new ByteBuffer();
      buf.writeByte(0x42);
      expect(buf.toUint8Array()).toEqual(new Uint8Array([0x42]));
    });

    it('writes multiple bytes', () => {
      const buf = new ByteBuffer();
      buf.writeBytes([0x01, 0x02, 0x03]);
      expect(buf.toUint8Array()).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });

    it('writes uint16 big-endian', () => {
      const buf = new ByteBuffer();
      buf.writeUint16(0x1234);
      expect(buf.toUint8Array()).toEqual(new Uint8Array([0x12, 0x34]));
    });

    it('writes uint32 big-endian', () => {
      const buf = new ByteBuffer();
      buf.writeUint32(0x12345678);
      expect(buf.toUint8Array()).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    });

    it('writes string with length prefix', () => {
      const buf = new ByteBuffer();
      buf.writeString('hello');
      const result = buf.toUint8Array();
      // Length prefix (2 bytes) + string bytes
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(5);
      expect(Array.from(result.slice(2))).toEqual([104, 101, 108, 108, 111]);
    });

    it('writes remaining length correctly', () => {
      const buf = new ByteBuffer();
      buf.writeRemainingLength(200);
      // 200 = 0b11001000 -> encoded as [0xC8, 0x01]
      expect(buf.toUint8Array()).toEqual(new Uint8Array([0xC8, 0x01]));
    });
  });

  describe('read methods', () => {
    it('reads a single byte', () => {
      const buf = ByteBuffer.from([0x42]);
      expect(buf.readByte()).toBe(0x42);
    });

    it('reads multiple bytes', () => {
      const buf = ByteBuffer.from([0x01, 0x02, 0x03]);
      expect(Array.from(buf.readBytes(3))).toEqual([0x01, 0x02, 0x03]);
    });

    it('reads uint16 big-endian', () => {
      const buf = ByteBuffer.from([0x12, 0x34]);
      expect(buf.readUint16()).toBe(0x1234);
    });

    it('reads uint32 big-endian', () => {
      const buf = ByteBuffer.from([0x12, 0x34, 0x56, 0x78]);
      expect(buf.readUint32()).toBe(0x12345678);
    });

    it('reads string with length prefix', () => {
      const buf = ByteBuffer.from([0, 5, 104, 101, 108, 108, 111]);
      expect(buf.readString()).toBe('hello');
    });

    it('reads remaining length correctly', () => {
      const buf = ByteBuffer.from([0xC8, 0x01]);
      expect(buf.readRemainingLength()).toBe(200);
    });
  });

  describe('remaining length encoding', () => {
    it('encodes small values correctly', () => {
      expect(encodeRemainingLength(0)).toEqual([0]);
      expect(encodeRemainingLength(127)).toEqual([127]);
      expect(encodeRemainingLength(128)).toEqual([0x80, 0x01]);
      expect(encodeRemainingLength(200)).toEqual([0xC8, 0x01]);
    });

    it('decodes remaining length correctly', () => {
      expect(decodeRemainingLength(ByteBuffer.from([0]))).toBe(0);
      expect(decodeRemainingLength(ByteBuffer.from([127]))).toBe(127);
      expect(decodeRemainingLength(ByteBuffer.from([0x80, 0x01]))).toBe(128);
      expect(decodeRemainingLength(ByteBuffer.from([0xC8, 0x01]))).toBe(200);
    });
  });

  describe('buffer management', () => {
    it('tracks position correctly', () => {
      const buf = new ByteBuffer();
      buf.writeByte(0x01);
      buf.writeByte(0x02);
      // position tracks read offset, not write position
      expect(buf.position).toBe(0);
      expect(buf.remaining).toBe(2);
      buf.readByte();
      expect(buf.position).toBe(1);
      expect(buf.remaining).toBe(1);
    });

    it('supports seeking', () => {
      const buf = ByteBuffer.from([0x01, 0x02, 0x03]);
      buf.seek(1);
      expect(buf.readByte()).toBe(0x02);
    });

    it('clears buffer', () => {
      const buf = new ByteBuffer();
      buf.writeByte(0x01);
      buf.clear();
      expect(buf.length).toBe(0);
      expect(buf.position).toBe(0);
    });
  });
});

import {
  utf8Encode,
  utf8Decode,
  base64Encode,
  base64Decode,
  base64ByteLength,
  bytesToBinaryString,
  binaryStringToBytes,
} from '../../src/platform/windows/net/bytes';

describe('utf8Encode/utf8Decode', () => {
  it('round-trips multibyte characters', () => {
    const s = 'é漢🙂';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });

  it('encodes ASCII as single bytes', () => {
    expect(Array.from(utf8Encode('abc'))).toEqual([0x61, 0x62, 0x63]);
  });
});

describe('base64', () => {
  it('round-trips all byte values 0..255', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
  });

  it('computes byte length', () => {
    expect(base64ByteLength('AAA=')).toBe(2);
    expect(base64ByteLength('AA==')).toBe(1);
    expect(base64ByteLength('AAAA')).toBe(3);
  });
});

describe('binary strings', () => {
  it('converts bytes to a binary string', () => {
    const s = bytesToBinaryString(new Uint8Array([0x48, 0x69]));
    expect(s).toBe('Hi');
  });

  it('round-trips bytes through binary strings', () => {
    const bytes = new Uint8Array([0, 1, 127, 255]);
    expect(binaryStringToBytes(bytesToBinaryString(bytes))).toEqual(bytes);
  });

  it('throws on char > 0xFF', () => {
    expect(() => binaryStringToBytes('Ā')).toThrow(RangeError);
    expect(() => binaryStringToBytes('Ā')).toThrow('binary string contains char > 0xFF');
  });
});
