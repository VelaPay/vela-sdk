import { sha256 } from "@noble/hashes/sha2.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, test } from "bun:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as instructionBarrel from "../../src/instructions";
import * as root from "../../src/index";
import {
  buildCancelStreamInstruction,
  buildCreateStreamMandateInstruction,
  buildExecuteStreamInstruction,
  buildPauseStreamInstruction,
  buildResumeStreamInstruction,
  buildUpdateStreamRateInstruction,
  PDAFactory,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../../src/index";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const mint = new PublicKey("11111111111111111111111111111114");
const payer = new PublicKey("11111111111111111111111111111115");
const wrappingVault = new PublicKey("11111111111111111111111111111116");

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

function serializeMerchantState(streamMandateCounter: bigint): Buffer {
  const data = Buffer.alloc(154);
  let offset = 8;
  merchant.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeUInt8(200, offset);
  offset += 1;
  PublicKey.default.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(streamMandateCounter, offset);
  offset += 8;
  data.writeUInt8(1, offset);
  return data;
}

function serializeProtocolConfig(): Buffer {
  const data = Buffer.alloc(220);
  let offset = 8;
  payer.toBuffer().copy(data, offset);
  offset += 32;
  PublicKey.default.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeBigUInt64LE(456n, offset);
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
  data.writeUInt8(253, offset);
  offset += 1;
  data.writeUInt8(1, offset);
  return data;
}

function serializeStreamMandate(mandateIndex = 7n): Buffer {
  const [mandate] = PDAFactory.stream(subscriber, merchant, mandateIndex, PROGRAM_ID);
  const data = Buffer.alloc(225);
  let offset = 0;
  Buffer.from(sha256(new TextEncoder().encode("account:StreamMandate")).slice(0, 8)).copy(
    data,
    offset,
  );
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
  data.writeBigUInt64LE(mandateIndex, offset);
  offset += 8;
  data.writeUInt8(255, offset);

  return Buffer.from(data);
}

function makeConnection(streamMandateCounter = 7n) {
  const [merchantState] = PDAFactory.merchantState(merchant, PROGRAM_ID);
  const [config] = PDAFactory.config(PROGRAM_ID);
  const [mandate] = PDAFactory.stream(subscriber, merchant, streamMandateCounter, PROGRAM_ID);
  const accounts = new Map<string, Buffer>([
    [merchantState.toBase58(), serializeMerchantState(streamMandateCounter)],
    [config.toBase58(), serializeProtocolConfig()],
    [mandate.toBase58(), serializeStreamMandate(streamMandateCounter)],
  ]);

  return {
    connection: {
      getAccountInfo: async (key: PublicKey) => {
        const data = accounts.get(key.toBase58());
        if (!data) return null;
        return {
          data,
          executable: false,
          lamports: 1,
          owner: PROGRAM_ID,
          rentEpoch: 0,
        };
      },
    } as any,
    mandate,
  };
}

function assertMeta(
  meta: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean } | undefined,
  expected: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean },
) {
  expect(meta?.pubkey.toBase58()).toBe(expected.pubkey.toBase58());
  expect(meta?.isSigner).toBe(expected.isSigner);
  expect(meta?.isWritable).toBe(expected.isWritable);
}

describe("stream instruction builders", () => {
  test("buildCreateStreamMandateInstruction derives the mandate PDA and encodes args", async () => {
    const { connection } = makeConnection();
    const instruction = await buildCreateStreamMandateInstruction({
      connection,
      subscriber,
      merchant,
      mint,
      ratePerSecond: 5n,
      authorizedMaxRate: 10n,
      maxStreamed: 100n,
      minSettleInterval: 60,
    });

    const [expectedMandate] = PDAFactory.stream(subscriber, merchant, 7n, PROGRAM_ID);
    expect(instruction.programId.toBase58()).toBe(PROGRAM_ID.toBase58());
    expect(instruction.keys).toHaveLength(7);
    expect(instruction.keys[0]?.pubkey.toBase58()).toBe(subscriber.toBase58());
    expect(instruction.keys[1]?.pubkey.toBase58()).toBe(
      PDAFactory.merchantState(merchant, PROGRAM_ID)[0].toBase58(),
    );
    expect(instruction.keys[2]?.pubkey.toBase58()).toBe(expectedMandate.toBase58());
    expect(instruction.keys[4]?.pubkey.toBase58()).toBe(
      PDAFactory.tokenConfig(mint, PROGRAM_ID)[0].toBase58(),
    );
    expect(instruction.keys[5]?.pubkey.toBase58()).toBe(subscriber.toBase58());
    expect(instruction.keys[6]?.pubkey.toBase58()).toBe(
      SystemProgram.programId.toBase58(),
    );
    expect(Buffer.from(instruction.data.subarray(0, 8)).equals(ixDiscriminator("create_stream_mandate"))).toBe(true);
    expect(instruction.data.length).toBe(37);
  });

  test("buildExecuteStreamInstruction derives transfer accounts from the mandate", async () => {
    const { connection, mandate } = makeConnection();
    const instruction = await buildExecuteStreamInstruction({
      connection,
      mandate,
      payer,
    });
    const subscriberWrappedAccount = getAssociatedTokenAddressSync(
      mint,
      mandate,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const merchantWrappedAccount = getAssociatedTokenAddressSync(
      mint,
      merchant,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(instruction.programId.toBase58()).toBe(PROGRAM_ID.toBase58());
    expect(instruction.keys).toHaveLength(17);
    assertMeta(instruction.keys[0], { pubkey: payer, isSigner: true, isWritable: true });
    assertMeta(instruction.keys[3], {
      pubkey: PDAFactory.keeperConfig(PROGRAM_ID)[0],
      isSigner: false,
      isWritable: false,
    });
    assertMeta(instruction.keys[4], { pubkey: mandate, isSigner: false, isWritable: true });
    assertMeta(instruction.keys[5], {
      pubkey: subscriberWrappedAccount,
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[6], {
      pubkey: merchantWrappedAccount,
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[7], { pubkey: mint, isSigner: false, isWritable: true });
    assertMeta(instruction.keys[8], {
      pubkey: PDAFactory.approval(mandate, PROGRAM_ID)[0],
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[11], {
      pubkey: wrappingVault,
      isSigner: false,
      isWritable: true,
    });
    expect(Buffer.from(instruction.data).toString("hex")).toBe(
      ixDiscriminator("execute_stream").toString("hex"),
    );
  });

  test("buildPauseStreamInstruction encodes pause_stream", async () => {
    const { connection, mandate } = makeConnection();
    const instruction = await buildPauseStreamInstruction({
      connection,
      mandate,
      authority: subscriber,
    });
    const subscriberWrappedAccount = getAssociatedTokenAddressSync(
      mint,
      mandate,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const merchantWrappedAccount = getAssociatedTokenAddressSync(
      mint,
      merchant,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(instruction.keys).toHaveLength(14);
    assertMeta(instruction.keys[1], { pubkey: mandate, isSigner: false, isWritable: true });
    assertMeta(instruction.keys[2], {
      pubkey: subscriberWrappedAccount,
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[3], {
      pubkey: merchantWrappedAccount,
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[4], { pubkey: mint, isSigner: false, isWritable: true });
    assertMeta(instruction.keys[5], {
      pubkey: PDAFactory.approval(mandate, PROGRAM_ID)[0],
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[11], {
      pubkey: PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    expect(Buffer.from(instruction.data).toString("hex")).toBe(
      ixDiscriminator("pause_stream").toString("hex"),
    );
  });

  test("buildResumeStreamInstruction encodes resume_stream", async () => {
    const { connection, mandate } = makeConnection();
    const instruction = await buildResumeStreamInstruction({
      connection,
      mandate,
      authority: merchant,
    });

    expect(instruction.keys).toHaveLength(2);
    expect(instruction.keys[0]?.pubkey.toBase58()).toBe(merchant.toBase58());
    expect(instruction.keys[1]?.pubkey.toBase58()).toBe(mandate.toBase58());
    expect(Buffer.from(instruction.data).toString("hex")).toBe(
      ixDiscriminator("resume_stream").toString("hex"),
    );
  });

  test("buildUpdateStreamRateInstruction encodes optional rate fields", async () => {
    const { connection, mandate } = makeConnection();
    const instruction = await buildUpdateStreamRateInstruction({
      connection,
      mandate,
      authority: merchant,
      newRate: 9n,
      newAuthorizedMaxRate: 12n,
    });

    expect(instruction.keys).toHaveLength(14);
    assertMeta(instruction.keys[2], {
      pubkey: getAssociatedTokenAddressSync(mint, mandate, true, TOKEN_2022_PROGRAM_ID),
      isSigner: false,
      isWritable: true,
    });
    assertMeta(instruction.keys[3], {
      pubkey: getAssociatedTokenAddressSync(mint, merchant, true, TOKEN_2022_PROGRAM_ID),
      isSigner: false,
      isWritable: true,
    });
    expect(Buffer.from(instruction.data.subarray(0, 8)).equals(ixDiscriminator("update_stream_rate"))).toBe(true);
    expect(instruction.data.length).toBe(26);
  });

  test("buildCancelStreamInstruction encodes cancel_stream", async () => {
    const { connection, mandate } = makeConnection();
    const instruction = await buildCancelStreamInstruction({
      connection,
      mandate,
      authority: subscriber,
    });

    expect(instruction.keys).toHaveLength(14);
    assertMeta(instruction.keys[1], { pubkey: mandate, isSigner: false, isWritable: true });
    assertMeta(instruction.keys[2], {
      pubkey: getAssociatedTokenAddressSync(mint, mandate, true, TOKEN_2022_PROGRAM_ID),
      isSigner: false,
      isWritable: true,
    });
    expect(Buffer.from(instruction.data).toString("hex")).toBe(
      ixDiscriminator("cancel_stream").toString("hex"),
    );
  });

  test("instruction and root barrels publish all six stream builders", () => {
    const names = [
      "buildCreateStreamMandateInstruction",
      "buildExecuteStreamInstruction",
      "buildPauseStreamInstruction",
      "buildResumeStreamInstruction",
      "buildUpdateStreamRateInstruction",
      "buildCancelStreamInstruction",
      "fetchStreamMandate",
    ] as const;

    for (const name of names) {
      expect(typeof (instructionBarrel as Record<string, unknown>)[name]).toBe(
        "function",
      );
      expect(typeof (root as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
