/**
 * Byte buffer utilities for MQTT packet encoding/decoding.
 * Pure TypeScript — no native dependencies.
 */

export class ByteBuffer {
  private bytes: number[] = [];
  private offset = 0;

  constructor(initial?: number[] | Uint8Array) {
    if (initial) {
      this.bytes = Array.from(initial);
    }
  }

  static from(data: number[] | Uint8Array): ByteBuffer {
    return new ByteBuffer(data);
  }

  // Write methods
  writeByte(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  writeBytes(data: number[] | Uint8Array): this {
    for (const b of data) {
      this.bytes.push(b & 0xff);
    }
    return this;
  }

  writeUint16(value: number): this {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
    return this;
  }

  writeUint32(value: number): this {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff
    );
    return this;
  }

  writeInt16(value: number): this {
    return this.writeUint16(value & 0xffff);
  }

  writeInt32(value: number): this {
    return this.writeUint32(value | 0);
  }

  writeString(str: string): this {
    const encoded = new TextEncoder().encode(str);
    this.writeUint16(encoded.length);
    this.writeBytes(encoded);
    return this;
  }

  writeUtf8String(str: string): this {
    const encoded = new TextEncoder().encode(str);
    this.writeUint16(encoded.length);
    this.writeBytes(encoded);
    return this;
  }

  writeRemainingLength(length: number): this {
    let remaining = length;
    do {
      let digit = remaining % 128;
      remaining = Math.floor(remaining / 128);
      if (remaining > 0) {
        digit |= 0x80;
      }
      this.bytes.push(digit);
    } while (remaining > 0);
    return this;
  }

  // Read methods
  readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error('Buffer underflow');
    }
    return this.bytes[this.offset++];
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new Error('Buffer underflow');
    }
    const result = new Uint8Array(this.bytes.slice(this.offset, this.offset + length));
    this.offset += length;
    return result;
  }

  readUint16(): number {
    const b0 = this.readByte();
    const b1 = this.readByte();
    return (b0 << 8) | b1;
  }

  readUint32(): number {
    const b0 = this.readByte();
    const b1 = this.readByte();
    const b2 = this.readByte();
    const b3 = this.readByte();
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
  }

  readInt16(): number {
    const val = this.readUint16();
    return val > 0x7fff ? val - 0x10000 : val;
  }

  readInt32(): number {
    const val = this.readUint32();
    return val | 0;
  }

  readString(): string {
    const length = this.readUint16();
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  readUtf8String(): string {
    return this.readString();
  }

  readRemainingLength(): number {
    let multiplier = 1;
    let value = 0;
    let digit: number;
    do {
      digit = this.readByte();
      value += (digit & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((digit & 0x80) !== 0);
    return value;
  }

  // Utility
  get length(): number {
    return this.bytes.length - this.offset;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  seek(position: number): this {
    this.offset = position;
    return this;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  toArray(): number[] {
    return [...this.bytes];
  }

  clear(): this {
    this.bytes = [];
    this.offset = 0;
    return this;
  }
}

// MQTT Remaining Length encoding/decoding helpers
export function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = [];
  let remaining = length;
  do {
    let digit = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      digit |= 0x80;
    }
    bytes.push(digit);
  } while (remaining > 0);
  return bytes;
}

export function decodeRemainingLength(buffer: ByteBuffer): number {
  let multiplier = 1;
  let value = 0;
  let digit: number;
  do {
    digit = buffer.readByte();
    value += (digit & 0x7f) * multiplier;
    multiplier *= 128;
  } while ((digit & 0x80) !== 0);
  return value;
}

// ---------------------------------------------------------------------------
// Pure-TS string/byte codecs (no atob/btoa/TextEncoder/TextDecoder).

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8Encode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(b: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < b.length) {
    const b0 = b[i];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
      i += 1;
    } else if (b0 < 0xe0) {
      cp = ((b0 & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if (b0 < 0xf0) {
      cp = ((b0 & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      i += 3;
    } else {
      cp =
        ((b0 & 0x07) << 18) |
        ((b[i + 1] & 0x3f) << 12) |
        ((b[i + 2] & 0x3f) << 6) |
        (b[i + 3] & 0x3f);
      i += 4;
    }
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

export function base64Encode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const b0 = b[i];
    const b1 = i + 1 < b.length ? b[i + 1] : -1;
    const b2 = i + 2 < b.length ? b[i + 2] : -1;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 === -1 ? 0 : b1 >> 4)];
    out += b1 === -1 ? '=' : B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 === -1 ? 0 : b2 >> 6)];
    out += b2 === -1 ? '=' : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function base64Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  let acc = 0;
  let accBits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const v = B64_ALPHABET.indexOf(ch);
    if (v === -1) continue;
    acc = (acc << 6) | v;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      bytes.push((acc >> accBits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function base64ByteLength(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

// A "binary string" has one char code (0-255) per byte.
export function bytesToBinaryString(b: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < b.length; i += CHUNK) {
    out += String.fromCharCode.apply(
      null,
      Array.from(b.subarray(i, i + CHUNK))
    );
  }
  return out;
}

export function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) {
      throw new RangeError('binary string contains char > 0xFF');
    }
    out[i] = c;
  }
  return out;
}
