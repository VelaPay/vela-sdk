import { describe, expect, test } from "bun:test";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { VELA_MANDATE_DISCRIMINATOR } from "../../src/accounts/deserialize";
import { PDAFactory } from "../../src/accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../../src/constants";
import { velaProgramIdl } from "../../src/idl";
import { buildExecutePullInstruction } from "../../src/instructions/execute-pull";

/**
 * SDK-03 coverage: `buildExecutePullInstruction` must resolve the transfer-hook
 * program ID dynamically from ProtocolConfig at runtime, while still honoring an
 * explicit per-call override. The `TRANSFER_HOOK_PROGRAM_ID` constant remains as
 * a last-resort fallback only when ProtocolConfig does not report one.
 */

function createReadOnlyProgramWithConfigStub(configStub: {
  wrappingVault: PublicKey;
  transferHookProgramId: PublicKey | null;
}): Program {
  const provider = new AnchorProvider(
    new Connection("http://127.0.0.1:8899"),
    {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    } as any,
    { commitment: "confirmed" },
  );
  const program = new Program(velaProgramIdl as any, provider);
  // Monkey-patch the protocolConfig account fetcher to return our stub.
  (program.account as any).protocolConfig = {
    fetch: async () => ({
      wrappingVault: configStub.wrappingVault,
      transferHookProgramId: configStub.transferHookProgramId,
    }),
  };
  return program;
}

function fixedParams() {
  const payer = Keypair.generate().publicKey;
  const subscriberAddress = Keypair.generate().publicKey;
  const merchantAddress = Keypair.generate().publicKey;
  // Use a valid-ish plan PDA so deriveMandateAddress works deterministically.
  const [planAddress] = PDAFactory.plan(merchantAddress, 0n);
  const [mandateAddress] = PDAFactory.mandate(
    subscriberAddress,
    merchantAddress,
    0n,
  );
  const wrappedUsdcMint = Keypair.generate().publicKey;
  return {
    payer,
    mandateAddress,
    subscriberAddress,
    merchantAddress,
    planAddress,
    wrappedUsdcMint,
  };
}

function serializeMandate(args: {
  subscriber: PublicKey;
  merchant: PublicKey;
  plan: PublicKey;
}): Buffer {
  const data = Buffer.alloc(268);
  let offset = 0;
  data.set(VELA_MANDATE_DISCRIMINATOR, offset);
  offset += 8;
  args.subscriber.toBuffer().copy(data, offset);
  offset += 32;
  args.plan.toBuffer().copy(data, offset);
  offset += 32;
  args.merchant.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigUInt64LE(1_000_000n, offset);
  offset += 8;
  data.writeBigUInt64LE(30n * 86_400n, offset);
  offset += 8;
  data.writeBigInt64LE(1_700_000_000n, offset);
  offset += 8;
  data.writeBigInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(12n, offset);
  offset += 8;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigInt64LE(1_700_100_000n, offset);
  offset += 8;
  data.writeBigInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeUInt8(255, offset);
  offset += 1;
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeBigUInt64LE(1n, offset);
  offset += 8;
  data.writeUInt8(3, offset);
  offset += 1;
  data.writeBigUInt64LE(0n, offset);
  offset += 8;
  PublicKey.default.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigInt64LE(0n, offset);
  offset += 8;
  data.writeUInt8(0, offset);
  return data;
}

function createConnectionStub(params: ReturnType<typeof fixedParams>) {
  const mandateData = serializeMandate({
    subscriber: params.subscriberAddress,
    merchant: params.merchantAddress,
    plan: params.planAddress,
  });
  return {
    getAccountInfo: async (key: PublicKey) =>
      key.equals(params.mandateAddress)
        ? {
            data: mandateData,
            executable: false,
            lamports: 1,
            owner: PROGRAM_ID,
            rentEpoch: 0,
          }
        : null,
  } as any;
}

function findKey(
  ix: { keys: { pubkey: PublicKey }[] },
  target: PublicKey,
): boolean {
  return ix.keys.some((k) => k.pubkey.equals(target));
}

describe("buildExecutePullInstruction — dynamic hook program ID resolution", () => {
  test("explicit hookProgramId override must match ProtocolConfig", async () => {
    const configHook = Keypair.generate().publicKey;
    const overrideHook = Keypair.generate().publicKey;
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: configHook,
    });

    const params = fixedParams();
    const connection = createConnectionStub(params);
    await expect(
      buildExecutePullInstruction(program, connection, {
        ...params,
        hookProgramId: overrideHook,
      }),
    ).rejects.toThrow("does not match ProtocolConfig.transferHookProgramId");

    const { instruction } = await buildExecutePullInstruction(
      program,
      connection,
      { ...params, hookProgramId: configHook },
    );
    expect(findKey(instruction, configHook)).toBe(true);
  });

  test("ProtocolConfig-sourced hookProgramId is used when no override is passed", async () => {
    const configHook = Keypair.generate().publicKey;
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: configHook,
    });

    const params = fixedParams();
    const connection = createConnectionStub(params);
    const { instruction } = await buildExecutePullInstruction(
      program,
      connection,
      params,
    );

    expect(findKey(instruction, configHook)).toBe(true);
    const [expectedMetas] = PDAFactory.extraAccountMetas(
      params.wrappedUsdcMint,
      configHook,
    );
    expect(findKey(instruction, expectedMetas)).toBe(true);
    // The fallback constant should NOT appear when ProtocolConfig reports a
    // different hook program (unless the stub happens to equal it, which it
    // does not since configHook is a random keypair).
    expect(configHook.equals(TRANSFER_HOOK_PROGRAM_ID)).toBe(false);
    expect(findKey(instruction, TRANSFER_HOOK_PROGRAM_ID)).toBe(false);
  });

  test("falls back to TRANSFER_HOOK_PROGRAM_ID constant when ProtocolConfig lacks a hook program", async () => {
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: null, // deserializeProtocolConfig-equivalent: missing/nullish
    });

    const params = fixedParams();
    const connection = createConnectionStub(params);
    const { instruction } = await buildExecutePullInstruction(
      program,
      connection,
      params,
    );

    expect(findKey(instruction, TRANSFER_HOOK_PROGRAM_ID)).toBe(true);
    const [expectedMetas] = PDAFactory.extraAccountMetas(
      params.wrappedUsdcMint,
      TRANSFER_HOOK_PROGRAM_ID,
    );
    expect(findKey(instruction, expectedMetas)).toBe(true);
  });

  test("instruction carries the expected Vela-owned PDAs from PDAFactory", async () => {
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    });
    const params = fixedParams();
    const connection = createConnectionStub(params);
    const { instruction, mandateAddress } = await buildExecutePullInstruction(
      program,
      connection,
      params,
    );

    const programId = program.programId ?? PROGRAM_ID;
    const [expectedApproval] = PDAFactory.approval(mandateAddress, programId);
    const [expectedConfig] = PDAFactory.config(programId);
    const [expectedKeeperConfig] = PDAFactory.keeperConfig(programId);

    expect(findKey(instruction, expectedApproval)).toBe(true);
    expect(findKey(instruction, expectedConfig)).toBe(true);
    expect(findKey(instruction, expectedKeeperConfig)).toBe(true);
  });
});
