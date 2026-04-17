import { beforeEach, describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  accountDiscriminator,
  concatBytes,
  hexFromBytes,
  i64LE,
  optionI64LE,
  optionU64LE,
  u64LE,
} from "../bytes";

const address = new PublicKey("11111111111111111111111111111112");
const subscriber = new PublicKey("11111111111111111111111111111113");
const merchant = new PublicKey("11111111111111111111111111111114");
const mint = new PublicKey("11111111111111111111111111111115");
const tokenProgram = new PublicKey("11111111111111111111111111111116");
const oracleReference = new PublicKey("11111111111111111111111111111117");
const admin = new PublicKey("11111111111111111111111111111118");

function mandateBytes(): Uint8Array {
  return concatBytes(
    accountDiscriminator("VelaMandate"),
    Uint8Array.from(subscriber.toBytes()),
    Uint8Array.from(mint.toBytes()),
    Uint8Array.from(merchant.toBytes()),
    u64LE(10_000_000n),
    u64LE(30n * 86_400n),
    i64LE(1_700_000_000n),
    i64LE(0n),
    u64LE(12n),
    u64LE(3n),
    i64LE(1_700_086_400n),
    i64LE(1_700_000_300n),
    u64LE(3n),
    u64LE(4n),
    u64LE(5n),
    Uint8Array.of(0, 254, 0),
    u64LE(7n),
    Uint8Array.of(3),
    u64LE(1_500_000n),
    Uint8Array.from(PublicKey.default.toBytes()),
    i64LE(0n),
    Uint8Array.of(0),
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    new Uint8Array(7),
  );
}

function streamMandateBytes(): Uint8Array {
  return concatBytes(
    accountDiscriminator("StreamMandate"),
    Uint8Array.of(2),
    Uint8Array.from(subscriber.toBytes()),
    Uint8Array.from(merchant.toBytes()),
    Uint8Array.from(mint.toBytes()),
    u64LE(5n),
    u64LE(10n),
    i64LE(1_700_000_000n),
    u64LE(25n),
    optionU64LE(100n),
    concatBytes(Uint8Array.of(0), new Uint8Array(8)),
    Uint8Array.from([60, 0, 0, 0]),
    Uint8Array.of(0),
    u64LE(9n),
    Uint8Array.of(253),
    u64LE(8n),
    u64LE(11n),
    i64LE(1_700_010_000n),
    Uint8Array.of(2),
    Uint8Array.from([8, 7, 6, 5, 4, 3, 2, 1]),
    new Uint8Array(38),
  );
}

function tokenConfigBytes(): Uint8Array {
  return concatBytes(
    accountDiscriminator("TokenConfig"),
    Uint8Array.from(mint.toBytes()),
    Uint8Array.from(tokenProgram.toBytes()),
    Uint8Array.of(0, 6, 1),
    Uint8Array.from(oracleReference.toBytes()),
    Uint8Array.from(admin.toBytes()),
    i64LE(1_700_000_000n),
    Uint8Array.of(251, 1),
    new Uint8Array(64),
  );
}

async function withBufferDisabled<T>(run: () => Promise<T>): Promise<T> {
  const originalBuffer = (globalThis as { Buffer?: unknown }).Buffer;
  // @ts-expect-error intentional browser simulation
  globalThis.Buffer = undefined;
  try {
    return await run();
  } finally {
    // @ts-expect-error restore test global
    globalThis.Buffer = originalBuffer;
  }
}

describe("browser-safe deserialization", () => {
  beforeEach(() => {
    expect(hexFromBytes(accountDiscriminator("VelaMandate"))).toBe("fe7d92c3d9e76cc8");
    expect(hexFromBytes(accountDiscriminator("StreamMandate"))).toBe("91ee9766c7c905a4");
    expect(hexFromBytes(accountDiscriminator("TokenConfig"))).toBe("5c49ff2b6b337565");
  });

  test("deserializes mandate, stream, and token config without Buffer", async () => {
    await withBufferDisabled(async () => {
      const {
        deserializeMandateAccount,
        deserializeStreamMandate,
        deserializeTokenConfigAccount,
      } = await import("../../accounts/deserialize");

      const mandate = deserializeMandateAccount(address, mandateBytes());
      const stream = deserializeStreamMandate(address, streamMandateBytes());
      const tokenConfig = deserializeTokenConfigAccount(address, tokenConfigBytes());

      expect(mandate.amount).toBe(10_000_000n);
      expect(mandate.pendingNewPlan).toBeUndefined();
      expect(stream.ratePerSecond).toBe(5n);
      expect(stream.pendingChangeType).toBe(2);
      expect(tokenConfig.enabled).toBe(true);
      expect(tokenConfig.decimals).toBe(6);
    });
  });

  test("rejects truncated and wrong-discriminator browser bytes", async () => {
    await withBufferDisabled(async () => {
      const { deserializeMandateAccount } = await import("../../accounts/deserialize");

      expect(() =>
        deserializeMandateAccount(address, mandateBytes().subarray(0, 32)),
      ).toThrow(/truncated/);

      const wrongDiscriminator = mandateBytes().slice();
      wrongDiscriminator.set(accountDiscriminator("TokenConfig"), 0);
      expect(() =>
        deserializeMandateAccount(address, wrongDiscriminator),
      ).toThrow(/Expected VelaMandate|Wrong account type|does not contain/i);
    });
  });
});
