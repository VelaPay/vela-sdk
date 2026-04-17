import { sha256 } from "@noble/hashes/sha2.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type BufferLike = Uint8Array | ArrayLike<number>;

export function asBytes(value: BufferLike): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

export function seedBytes(value: string | BufferLike): Uint8Array {
  return typeof value === "string" ? textEncoder.encode(value) : asBytes(value);
}

function checkedDataView(
  value: BufferLike,
  offset: number,
  width: number,
): DataView {
  const bytes = asBytes(value);
  if (offset < 0 || offset + width > bytes.length) {
    throw new RangeError(
      `Byte read out of range: offset=${offset}, width=${width}, length=${bytes.length}`,
    );
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, width);
}

export function sliceEquals(
  value: BufferLike,
  expected: BufferLike,
  offset = 0,
): boolean {
  const bytes = asBytes(value);
  const target = asBytes(expected);
  if (offset < 0 || offset + target.length > bytes.length) {
    return false;
  }
  for (let index = 0; index < target.length; index += 1) {
    if (bytes[offset + index] !== target[index]) {
      return false;
    }
  }
  return true;
}

export function readU8(value: BufferLike, offset: number): number {
  return checkedDataView(value, offset, 1).getUint8(0);
}

export function readU32LE(value: BufferLike, offset: number): number {
  return checkedDataView(value, offset, 4).getUint32(0, true);
}

export function readU64LE(value: BufferLike, offset: number): bigint {
  return checkedDataView(value, offset, 8).getBigUint64(0, true);
}

export function readI64LE(value: BufferLike, offset: number): bigint {
  return checkedDataView(value, offset, 8).getBigInt64(0, true);
}

export function utf8FromFixedBytes(value: BufferLike): string {
  const bytes = asBytes(value);
  const end = bytes.indexOf(0);
  return textDecoder.decode(end >= 0 ? bytes.subarray(0, end) : bytes);
}

export function hexFromBytes(value: BufferLike): string {
  return Array.from(asBytes(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function concatBytes(...parts: Array<BufferLike | null | undefined>): Uint8Array {
  const chunks = parts
    .filter((part): part is BufferLike => part != null)
    .map(asBytes);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function asInstructionData(value: BufferLike): Buffer {
  return asBytes(value) as unknown as Buffer;
}

function toBigIntValue(value: bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

export function u64LE(value: bigint | number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, toBigIntValue(value), true);
  return bytes;
}

export function i64LE(value: bigint | number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, toBigIntValue(value), true);
  return bytes;
}

export function optionU64LE(
  value: bigint | number | null | undefined,
): Uint8Array {
  return value == null ? Uint8Array.of(0) : concatBytes(Uint8Array.of(1), u64LE(value));
}

export function optionI64LE(
  value: bigint | number | null | undefined,
): Uint8Array {
  return value == null ? Uint8Array.of(0) : concatBytes(Uint8Array.of(1), i64LE(value));
}

export function instructionDiscriminator(name: string): Uint8Array {
  return sha256(textEncoder.encode(`global:${name}`)).slice(0, 8);
}

export function accountDiscriminator(name: string): Uint8Array {
  return sha256(textEncoder.encode(`account:${name}`)).slice(0, 8);
}
