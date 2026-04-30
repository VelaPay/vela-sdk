import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  deriveCredentialMintAddress,
  deriveMerchantStateAddress,
  derivePlanAddress,
  PDAFactory,
} from "../accounts/pda";
import { TOKEN_2022_PROGRAM_ID } from "../constants";
import type { VelaCreatePlanParams } from "../types";

export interface BuildCreatePlanResult {
  instruction: TransactionInstruction;
  planAddress: PublicKey;
  credentialMintAddress: PublicKey;
  billingMintAddress: PublicKey;
  tokenConfigAddress: PublicKey;
}

/**
 * Builds a raw `create_plan` TransactionInstruction without signing or sending.
 *
 * The caller must provide `planId` which is the current `merchant_state.plan_count`
 * (the next plan ID). The convenience client fetches this automatically;
 * the raw instruction builder requires it explicitly.
 */
export async function buildCreatePlanInstruction(
  program: Program,
  params: VelaCreatePlanParams & { merchant: PublicKey; planId: bigint },
): Promise<BuildCreatePlanResult> {
  const { merchant, planId, amount, frequency, maxPulls } = params;
  const trialPeriod = params.trialPeriod ?? 0;
  const maxPullsBigInt = BigInt(maxPulls);
  const programId = program.programId;

  if (maxPullsBigInt < 1n) {
    throw new RangeError("Plan maxPulls must be at least 1");
  }

  // Derive PDAs
  const [merchantState] = deriveMerchantStateAddress(merchant, programId);
  const [planAddress] = derivePlanAddress(merchant, planId, programId);
  const [credentialMintAddress] = deriveCredentialMintAddress(
    merchant,
    planId,
    programId,
  );
  const billingMintAddress =
    params.billingMint ?? (await fetchDefaultBillingMint(program));
  const [tokenConfigAddress] = PDAFactory.tokenConfig(
    billingMintAddress,
    programId,
  );

  // Convert to BN for Anchor
  const amountBN = new BN(BigInt(amount).toString());
  const frequencyBN = new BN(BigInt(frequency).toString());
  const trialPeriodBN = new BN(BigInt(trialPeriod).toString());
  const maxPullsBN = new BN(maxPullsBigInt.toString());

  const instruction = await (program.methods as any)
    .createPlan(amountBN, frequencyBN, trialPeriodBN, maxPullsBN)
    .accounts({
      merchant,
      merchantState,
      plan: planAddress,
      credentialMint: credentialMintAddress,
      billingMint: billingMintAddress,
      tokenConfig: tokenConfigAddress,
      systemProgram: SystemProgram.programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  return {
    instruction,
    planAddress,
    credentialMintAddress,
    billingMintAddress,
    tokenConfigAddress,
  };
}

async function fetchDefaultBillingMint(program: Program): Promise<PublicKey> {
  const [protocolConfig] = PDAFactory.config(program.programId);
  const raw = await (program.account as any).protocolConfig.fetch(
    protocolConfig,
  );
  return raw.wrappedUsdcMint as PublicKey;
}
