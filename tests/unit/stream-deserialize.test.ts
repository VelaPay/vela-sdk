import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  STREAM_MANDATE_DISCRIMINATOR,
  deserializeStreamMandate,
  fetchStreamMandate,
  WrongAccountTypeError,
} from "../../src/index";

const address = new PublicKey("11111111111111111111111111111112");
const subscriber = new PublicKey("11111111111111111111111111111113");
const merchant = new PublicKey("11111111111111111111111111111114");
const mint = new PublicKey("11111111111111111111111111111115");

function discriminator(name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(name)).slice(0, 8));
}

function optionU64(value: bigint | null): Buffer {
  if (value == null) {
    return Buffer.from([0]);
  }
  const bytes = Buffer.alloc(9);
  bytes.writeUInt8(1, 0);
  bytes.writeBigUInt64LE(value, 1);
  return bytes;
}

function optionI64(value: bigint | null): Buffer {
  if (value == null) {
    return Buffer.from([0]);
  }
  const bytes = Buffer.alloc(9);
  bytes.writeUInt8(1, 0);
  bytes.writeBigInt64LE(value, 1);
  return bytes;
}

function serializeStreamMandate(): Buffer {
  const data = Buffer.alloc(225);
  let offset = 0;
  STREAM_MANDATE_DISCRIMINATOR.copy(data, offset);
  offset += 8;
  data.writeUInt8(1, offset);
  offset += 1;
  subscriber.toBuffer().copy(data, offset);
  offset += 32;
  merchant.toBuffer().copy(data, offset);
  offset += 32;
  mint.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(5n, offset);
  offset += 8;
  data.writeBigUInt64LE(10n, offset);
  offset += 8;
  data.writeBigInt64LE(1_700_000_000n, offset);
  offset += 8;
  data.writeBigUInt64LE(25n, offset);
  offset += 8;
  optionU64(100n).copy(data, offset);
  offset += 9;
  optionI64(null).copy(data, offset);
  offset += 9;
  data.writeUInt32LE(60, offset);
  offset += 4;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeBigUInt64LE(7n, offset);
  offset += 8;
  data.writeUInt8(254, offset);
  return data;
}

describe("deserializeStreamMandate", () => {
  test("decodes a V1 stream mandate buffer", () => {
    const result = deserializeStreamMandate(address, serializeStreamMandate());

    expect(result.address.toBase58()).toBe(address.toBase58());
    expect(result.version).toBe(1);
    expect(result.subscriber.toBase58()).toBe(subscriber.toBase58());
    expect(result.merchant.toBase58()).toBe(merchant.toBase58());
    expect(result.mint.toBase58()).toBe(mint.toBase58());
    expect(result.ratePerSecond).toBe(5n);
    expect(result.authorizedMaxRate).toBe(10n);
    expect(result.lastSettledTs).toBe(1_700_000_000n);
    expect(result.totalStreamed).toBe(25n);
    expect(result.maxStreamed).toBe(100n);
    expect(result.pausedAt).toBeNull();
    expect(result.minSettleInterval).toBe(60);
    expect(result.status).toBe("active");
    expect(result.mandateIndex).toBe(7n);
    expect(result.bump).toBe(254);
  });
});

describe("fetchStreamMandate", () => {
  test("loads and decodes a StreamMandate account", async () => {
    const connection = {
      getAccountInfo: async (key: PublicKey) =>
        key.equals(address)
          ? {
              data: serializeStreamMandate(),
              executable: false,
              lamports: 1,
              owner: PublicKey.default,
              rentEpoch: 0,
            }
          : null,
    } as any;

    const result = await fetchStreamMandate(connection, address);
    expect(result.mandateIndex).toBe(7n);
    expect(result.status).toBe("active");
  });

  test("throws WrongAccountTypeError for a VelaMandate discriminator", async () => {
    const velaMandateBytes = Buffer.concat([
      discriminator("account:VelaMandate"),
      Buffer.alloc(32),
    ]);
    const connection = {
      getAccountInfo: async () => ({
        data: velaMandateBytes,
        executable: false,
        lamports: 1,
        owner: PublicKey.default,
        rentEpoch: 0,
      }),
    } as any;

    await expect(fetchStreamMandate(connection, address)).rejects.toBeInstanceOf(
      WrongAccountTypeError,
    );
  });

  test("throws WrongAccountTypeError for random bytes", async () => {
    const connection = {
      getAccountInfo: async () => ({
        data: Buffer.from("00112233445566778899aabbccddeeff", "hex"),
        executable: false,
        lamports: 1,
        owner: PublicKey.default,
        rentEpoch: 0,
      }),
    } as any;

    await expect(fetchStreamMandate(connection, address)).rejects.toBeInstanceOf(
      WrongAccountTypeError,
    );
  });
});
