import { describe, expect, test } from "bun:test";
import { sha256 } from "@noble/hashes/sha2.js";
import { PublicKey } from "@solana/web3.js";
import { PDAFactory } from "../../accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../../constants";
import type { TokenConfigAccount } from "../../types";
import type { StreamMandate } from "../../types/stream-mandate";
import { UpgradeBuilder } from "../upgrade-builder";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const mint = new PublicKey("11111111111111111111111111111114");
const wrappingVault = new PublicKey("11111111111111111111111111111115");

function ixDiscriminator(name: string): Buffer {
  return Buffer.from(
    sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8),
  );
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

function serializeProtocolConfig(): Buffer {
  const data = Buffer.alloc(220);
  let offset = 8;
  subscriber.toBuffer().copy(data, offset);
  offset += 32;
  PublicKey.default.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeBigUInt64LE(1n, offset);
  offset += 8;
  mint.toBuffer().copy(data, offset);
  offset += 32;
  wrappingVault.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeBigInt64LE(0n, offset);
  offset += 8;
  TRANSFER_HOOK_PROGRAM_ID.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(254, offset);
  offset += 1;
  data.writeUInt8(1, offset);
  offset += 1;
  PublicKey.default.toBuffer().copy(data, offset);
  return data;
}

function serializeStreamMandate(): Buffer {
  const data = Buffer.alloc(225);
  let offset = 0;
  Buffer.from(
    sha256(new TextEncoder().encode("account:StreamMandate")).slice(0, 8),
  ).copy(data, offset);
  offset += 8;
  data.writeUInt8(2, offset);
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
  data.writeUInt8(255, offset);
  offset += 1;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigInt64LE(0n, offset);
  offset += 8;
  data.writeUInt8(0, offset);
  return data;
}

describe("UpgradeBuilder streaming execute", () => {
  test("dispatches to update_stream_rate", async () => {
    const mandate: StreamMandate = {
      address: new PublicKey("11111111111111111111111111111116"),
      version: 2,
      subscriber,
      merchant,
      mint,
      ratePerSecond: 5n,
      authorizedMaxRate: 10n,
      lastSettledTs: 1_700_000_000n,
      totalStreamed: 25n,
      maxStreamed: 100n,
      pausedAt: null,
      minSettleInterval: 60,
      status: "active",
      mandateIndex: 7n,
      bump: 255,
      pendingNewRatePerSecond: 0n,
      pendingNewAuthorizedMaxRate: 0n,
      pendingEffectiveAt: 0n,
      pendingChangeType: 0,
      pendingNonceShort: [],
    };
    const tokenConfig: TokenConfigAccount = {
      mint,
      tokenProgram: mint,
      billingRail: "transferHook",
      decimals: 6,
      enabled: true,
      oracleReference: PublicKey.default,
    };
    const [protocolConfig] = PDAFactory.config(PROGRAM_ID);
    const accounts = new Map<string, Buffer>([
      [mandate.address.toBase58(), serializeStreamMandate()],
      [protocolConfig.toBase58(), serializeProtocolConfig()],
    ]);
    const connection = {
      getAccountInfo: async (key: PublicKey) => {
        const data = accounts.get(key.toBase58());
        return data
          ? {
              data,
              executable: false,
              lamports: 1,
              owner: PROGRAM_ID,
              rentEpoch: 0,
            }
          : null;
      },
    } as any;

    const instruction = await new UpgradeBuilder({
      connection,
      program: { programId: PROGRAM_ID } as any,
      mandate,
      newPlan: { amount: 8n },
      tokenConfig,
      authority: subscriber,
    }).execute();

    expect(Buffer.from(instruction.data.subarray(0, 8)).toString("hex")).toBe(
      ixDiscriminator("update_stream_rate").toString("hex"),
    );
  });
});
