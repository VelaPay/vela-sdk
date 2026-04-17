import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { describe, expect, test } from "bun:test";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as instructionBarrel from "../../src/instructions";
import * as root from "../../src/index";
import { velaProgramIdl } from "../../src/idl";
import {
  buildAdjustAgentMandateInstruction,
  buildAgentPullInstruction,
  buildCreateAgentMandateInstruction,
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  deriveConfigAddress,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../../src/index";

function createReadOnlyProgramWithConfigStub(configStub?: {
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
  transferHookProgramId?: PublicKey;
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
  (program.account as any).protocolConfig = {
    fetch: async () => ({
      wrappedUsdcMint:
        configStub?.wrappedUsdcMint ?? Keypair.generate().publicKey,
      wrappingVault: configStub?.wrappingVault ?? Keypair.generate().publicKey,
      transferHookProgramId:
        configStub?.transferHookProgramId ?? TRANSFER_HOOK_PROGRAM_ID,
    }),
  };
  return program;
}

describe("agent mandate raw builders", () => {
  test("buildCreateAgentMandateInstruction derives the same mandate PDA and mandate-owned ATA used on-chain", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const service = new PublicKey("11111111111111111111111111111114");
    const splUsdcMint = new PublicKey("11111111111111111111111111111115");
    const wrappedUsdcMint = new PublicKey("11111111111111111111111111111116");
    const wrappingVault = new PublicKey("11111111111111111111111111111117");
    const program = createReadOnlyProgramWithConfigStub({
      wrappedUsdcMint,
      wrappingVault,
    });

    const result = await buildCreateAgentMandateInstruction(program, {
      authority,
      agent,
      splUsdcMint,
      wrappedUsdcMint,
      wrappingVault,
      dailyLimit: 5_000_000n,
      lifetimeCap: 20_000_000n,
      minPullAmount: 100_000n,
      minPullInterval: 60n,
      services: [{ service, dailyLimit: 4_000_000n }],
      fundedAmount: 3_000_000n,
    });

    const [expectedMandate] = deriveAgentMandateAddress(
      authority,
      agent,
      program.programId ?? PROGRAM_ID,
    );
    const expectedWrappedAta = deriveAgentMandateWrappedAta(
      expectedMandate,
      wrappedUsdcMint,
    );
    const expectedAuthorityUsdcAccount = getAssociatedTokenAddressSync(
      splUsdcMint,
      authority,
      false,
      TOKEN_PROGRAM_ID,
    );

    expect(result.mandateAddress.toBase58()).toBe(expectedMandate.toBase58());
    expect(result.mandateWrappedAccount.toBase58()).toBe(
      expectedWrappedAta.toBase58(),
    );
    expect(result.instruction.keys[2]?.pubkey.toBase58()).toBe(
      expectedMandate.toBase58(),
    );
    expect(result.instruction.keys[3]?.pubkey.toBase58()).toBe(
      expectedAuthorityUsdcAccount.toBase58(),
    );
    expect(result.instruction.keys[4]?.pubkey.toBase58()).toBe(
      expectedWrappedAta.toBase58(),
    );
    expect(result.instruction.keys[6]?.pubkey.toBase58()).toBe(
      deriveConfigAddress(program.programId ?? PROGRAM_ID)[0].toBase58(),
    );
    expect(result.instruction.keys[10]?.pubkey.toBase58()).toBe(
      TOKEN_PROGRAM_ID.toBase58(),
    );
    expect(result.instruction.keys[11]?.pubkey.toBase58()).toBe(
      TOKEN_2022_PROGRAM_ID.toBase58(),
    );
    expect(result.instruction.keys[12]?.pubkey.toBase58()).toBe(
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    );
    expect(result.instruction.keys[13]?.pubkey.toBase58()).toBe(
      SystemProgram.programId.toBase58(),
    );
  });

  test("buildAgentPullInstruction injects the transfer-hook accounts in the same order as the protocol", async () => {
    const payer = new PublicKey("11111111111111111111111111111112");
    const agent = new PublicKey("11111111111111111111111111111113");
    const authority = new PublicKey("11111111111111111111111111111114");
    const serviceWrappedAccount = new PublicKey(
      "11111111111111111111111111111115",
    );
    const wrappedUsdcMint = new PublicKey("11111111111111111111111111111116");
    const wrappingVault = new PublicKey("11111111111111111111111111111117");
    const program = createReadOnlyProgramWithConfigStub({
      wrappedUsdcMint,
      wrappingVault,
      transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    });

    const result = await buildAgentPullInstruction(program, {
      payer,
      agent,
      authority,
      serviceWrappedAccount,
      wrappedUsdcMint,
      wrappingVault,
      amount: 700_000n,
    });

    expect(result.instruction.keys[8]?.pubkey.toBase58()).toBe(
      wrappedUsdcMint.toBase58(),
    );
    expect(result.instruction.keys[9]?.pubkey.toBase58()).toBe(
      deriveConfigAddress(program.programId ?? PROGRAM_ID)[0].toBase58(),
    );
    expect(result.instruction.keys[10]?.pubkey.toBase58()).toBe(
      wrappingVault.toBase58(),
    );
    expect(result.instruction.keys[11]?.pubkey.toBase58()).toBe(
      TRANSFER_HOOK_PROGRAM_ID.toBase58(),
    );
    expect(result.instruction.keys[13]?.pubkey.toBase58()).toBe(
      (program.programId ?? PROGRAM_ID).toBase58(),
    );
    expect(result.instruction.keys[14]?.pubkey.toBase58()).toBe(
      TOKEN_2022_PROGRAM_ID.toBase58(),
    );
    expect(result.instruction.keys[15]?.pubkey.toBase58()).toBe(
      SystemProgram.programId.toBase58(),
    );
    expect(result.pullApprovalAddress.toBase58()).toBe(
      result.instruction.keys[6]!.pubkey.toBase58(),
    );
  });

  test("buildAgentPullInstruction rejects a supplied mandate that does not match authority + agent", async () => {
    const payer = new PublicKey("11111111111111111111111111111112");
    const agent = new PublicKey("11111111111111111111111111111113");
    const authority = new PublicKey("11111111111111111111111111111114");
    const wrappedUsdcMint = new PublicKey("11111111111111111111111111111117");
    const wrappingVault = new PublicKey("11111111111111111111111111111118");
    const program = createReadOnlyProgramWithConfigStub({
      wrappedUsdcMint,
      wrappingVault,
      transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    });

    await expect(
      buildAgentPullInstruction(program, {
        payer,
        agent,
        authority,
        mandateAddress: new PublicKey("11111111111111111111111111111115"),
        serviceWrappedAccount: new PublicKey(
          "11111111111111111111111111111116",
        ),
        wrappedUsdcMint,
        wrappingVault,
        amount: 700_000n,
      }),
    ).rejects.toThrow("does not match the authority/agent-derived mandate");
  });

  test("buildAdjustAgentMandateInstruction forwards partial limit and service updates with typed params", async () => {
    const authority = new PublicKey("11111111111111111111111111111112");
    const agent = new PublicKey("11111111111111111111111111111113");
    const replacementService = new PublicKey(
      "11111111111111111111111111111114",
    );
    const wrappedUsdcMint = new PublicKey("11111111111111111111111111111115");
    const program = createReadOnlyProgramWithConfigStub({
      wrappedUsdcMint,
    });

    const result = await buildAdjustAgentMandateInstruction(program, {
      authority,
      agent,
      wrappedUsdcMint,
      lifetimeCap: 30_000_000n,
      services: [{ service: replacementService, dailyLimit: 9_000_000n }],
    });

    const decoded = (program.coder.instruction as any).decode(
      result.instruction.data,
    );
    expect(decoded.name).toBe("adjustAgentMandate");
    expect(decoded.data.dailyLimit).toBeNull();
    expect(decoded.data.lifetimeCap.toString()).toBe("30000000");
    expect(decoded.data.minPullAmount).toBeNull();
    expect(decoded.data.minPullInterval).toBeNull();
    expect(decoded.data.services).toHaveLength(1);
    expect(decoded.data.services[0].service.toBase58()).toBe(
      replacementService.toBase58(),
    );
    expect(decoded.data.services[0].dailyLimit.toString()).toBe("9000000");
  });

  test("instruction and root barrels publish all seven agent-mandate builders", () => {
    const names = [
      "buildCreateAgentMandateInstruction",
      "buildAgentPullInstruction",
      "buildRevokeAgentMandateInstruction",
      "buildAdjustAgentMandateInstruction",
      "buildPauseAgentMandateInstruction",
      "buildResumeAgentMandateInstruction",
      "buildDrainAgentMandateInstruction",
    ] as const;

    for (const name of names) {
      expect(typeof (instructionBarrel as Record<string, unknown>)[name]).toBe(
        "function",
      );
      expect(typeof (root as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
