import { describe, expect, test } from "bun:test";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "../../idl/vela_protocol.json";
import { PDAFactory } from "../../src/accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../../src/constants";
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
  const program = new Program(idl as any, provider);
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

function findKey(
  ix: { keys: { pubkey: PublicKey }[] },
  target: PublicKey,
): boolean {
  return ix.keys.some((k) => k.pubkey.equals(target));
}

describe("buildExecutePullInstruction — dynamic hook program ID resolution", () => {
  test("explicit hookProgramId override wins over ProtocolConfig", async () => {
    const configHook = Keypair.generate().publicKey;
    const overrideHook = Keypair.generate().publicKey;
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: configHook,
    });

    const params = fixedParams();
    const { instruction } = await buildExecutePullInstruction(
      program,
      {} as any,
      { ...params, hookProgramId: overrideHook },
    );

    // hookProgram account must be the override, not the config value.
    expect(findKey(instruction, overrideHook)).toBe(true);
    expect(findKey(instruction, configHook)).toBe(false);

    // extraAccountMetas PDA is derived against the override.
    const [expectedMetas] = PDAFactory.extraAccountMetas(
      params.wrappedUsdcMint,
      overrideHook,
    );
    expect(findKey(instruction, expectedMetas)).toBe(true);
  });

  test("ProtocolConfig-sourced hookProgramId is used when no override is passed", async () => {
    const configHook = Keypair.generate().publicKey;
    const program = createReadOnlyProgramWithConfigStub({
      wrappingVault: Keypair.generate().publicKey,
      transferHookProgramId: configHook,
    });

    const params = fixedParams();
    const { instruction } = await buildExecutePullInstruction(
      program,
      {} as any,
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
    const { instruction } = await buildExecutePullInstruction(
      program,
      {} as any,
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
    const { instruction, mandateAddress } = await buildExecutePullInstruction(
      program,
      {} as any,
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
