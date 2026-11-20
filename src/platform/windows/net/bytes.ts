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
