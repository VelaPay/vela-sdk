import { describe, expect, test } from "bun:test";
import BN from "bn.js";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  accountDiscriminator,
  asInstructionData,
  concatBytes,
  hexFromBytes,
  instructionDiscriminator,
  u64LE,
} from "../bytes";
import { PDAFactory } from "../../accounts/pda";
import { buildCancelInstruction } from "../../instructions/cancel";
import { buildCancelPlanChangeInstruction } from "../../instructions/cancel-plan-change";
import { buildCreatePlanInstruction } from "../../instructions/create-plan";
import { buildWrapAndSubscribeInstructions } from "../../instructions/wrap-and-subscribe";
import type { VelaPlan } from "../../types";

const merchant = Keypair.generate().publicKey;
const subscriber = Keypair.generate().publicKey;
const planAddress = Keypair.generate().publicKey;
const mandateAddress = PDAFactory.mandate(subscriber, merchant, 3n)[0];
const splUsdcMint = Keypair.generate().publicKey;
const wrappedUsdcMint = Keypair.generate().publicKey;
const wrappingVault = Keypair.generate().publicKey;
const credentialMint = Keypair.generate().publicKey;
const authority = Keypair.generate().publicKey;

function encodeMethodInstruction(name: string, args: Uint8Array = new Uint8Array()) {
  return new TransactionInstruction({
    programId: authority,
    keys: [],
    data: asInstructionData(concatBytes(instructionDiscriminator(name), args)),
  });
}

function flatPlanRaw(): VelaPlan {
  return {
    billingType: "flat",
    address: planAddress,
    merchant,
    planId: 7n,
    amount: 10_000_000n,
    frequency: 30n * 86_400n,
    trialPeriod: 0n,
    maxPulls: 12n,
    status: "active",
    credentialMint,
    bump: 254,
    version: 1,
  };
}

function mockProgram() {
  const plan = flatPlanRaw();
  return {
    programId: authority,
    account: {
      velaPlan: {
        fetch: async () => ({
          merchant: plan.merchant,
          planId: new BN(plan.planId.toString()),
          amount: new BN(plan.amount.toString()),
          frequency: new BN(plan.frequency.toString()),
          trialPeriod: new BN(plan.trialPeriod.toString()),
          maxPulls: new BN(plan.maxPulls.toString()),
          status: { active: {} },
          credentialMint: plan.credentialMint,
          bump: plan.bump,
          version: plan.version,
          _reserved: [],
        }),
      },
      usagePlan: {
        fetch: async () => {
          throw new Error("Account does not exist");
        },
      },
      merchantState: {
        fetch: async () => ({
          mandateCounter: new BN(3),
        }),
      },
    },
    methods: {
      createPlan: (amount: BN, frequency: BN, trialPeriod: BN, maxPulls: BN) => ({
        accounts: () => ({
          instruction: async () =>
            encodeMethodInstruction(
              "create_plan",
              concatBytes(
                u64LE(BigInt(amount.toString())),
                u64LE(BigInt(frequency.toString())),
                u64LE(BigInt(trialPeriod.toString())),
                u64LE(BigInt(maxPulls.toString())),
              ),
            ),
        }),
      }),
      cancel: () => ({
        accounts: () => ({
          instruction: async () => encodeMethodInstruction("cancel"),
        }),
      }),
      subscribe: () => ({
        accounts: () => ({
          instruction: async () => encodeMethodInstruction("subscribe"),
        }),
      }),
      wrap: (amount: BN) => ({
        accounts: () => ({
          instruction: async () =>
            encodeMethodInstruction("wrap", u64LE(BigInt(amount.toString()))),
        }),
      }),
    },
  } as any;
}

describe("instruction byte stability", () => {
  test("keeps discriminator hex values byte-identical", () => {
    expect(hexFromBytes(accountDiscriminator("StreamMandate"))).toBe("91ee9766c7c905a4");
    expect(hexFromBytes(accountDiscriminator("VelaMandate"))).toBe("fe7d92c3d9e76cc8");
    expect(hexFromBytes(accountDiscriminator("TokenConfig"))).toBe("5c49ff2b6b337565");
    expect(hexFromBytes(instructionDiscriminator("cancel_plan_change"))).toBe("37d0c8f18612c0a5");
  });

  test("preserves create, cancel-plan-change, cancel, and wrap+subscribe instruction data", async () => {
    const program = mockProgram();
    const { instruction: createInstruction } = await buildCreatePlanInstruction(program, {
      merchant,
      planId: 7n,
      amount: 10_000_000n,
      frequency: 30n * 86_400n,
      trialPeriod: 0n,
      maxPulls: 12n,
    });
    const cancelPlanChange = await buildCancelPlanChangeInstruction(
      { programId: authority } as any,
      {} as any,
      { mandate: mandateAddress, authority },
    );
    const { instruction: cancelInstruction } = await buildCancelInstruction(program, {
      authority,
      subscriberAddress: subscriber,
      planAddress,
      mandateAddress,
      usdcMintAddress: splUsdcMint,
      credentialMint,
    });
    const wrapAndSubscribe = await buildWrapAndSubscribeInstructions(program, {
      subscriber,
      planAddress,
      merchantAddress: merchant,
      splUsdcMint,
      wrappedUsdcMint,
      wrappingVault,
      amount: 10_000_000n,
      credentialMintAddress: credentialMint,
    });

    expect(hexFromBytes(createInstruction.data)).toBe(
      "4d2b8dfed47629ba8096980000000000008d27000000000000000000000000000c00000000000000",
    );
    expect(hexFromBytes(cancelPlanChange.instruction.data)).toBe("37d0c8f18612c0a5");
    expect(hexFromBytes(cancelInstruction.data)).toBe("e8dbdf29dbecdcbe");
    expect(
      wrapAndSubscribe.instructions.map((instruction) => hexFromBytes(instruction.data)),
    ).toEqual([
      "fe1cbf8a9cb3b735",
      hexFromBytes(
        createAssociatedTokenAccountIdempotentInstruction(
          subscriber,
          PDAFactory.agentMandateWrappedAta(mandateAddress, wrappedUsdcMint),
          mandateAddress,
            wrappedUsdcMint,
            TOKEN_2022_PROGRAM_ID,
          ).data,
        ),
      "b2280abde481ba8c8096980000000000",
    ]);

    expect(wrapAndSubscribe.instructions[1]?.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(
      true,
    );
    expect(createInstruction.programId.equals(authority)).toBe(true);
    expect(cancelInstruction.programId.equals(authority)).toBe(true);
    expect(wrapAndSubscribe.instructions[0]?.programId.equals(authority)).toBe(true);
    expect(wrapAndSubscribe.instructions[2]?.programId.equals(authority)).toBe(true);
  });
});
