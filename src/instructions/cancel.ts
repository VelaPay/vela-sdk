import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import {
  getSubscribablePlan,
  resolvePlanContext,
} from "../accounts/subscribable-plan";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import type { VelaCancelParams } from "../types";

export interface BuildCancelResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

/**
 * Builds a raw `cancel` TransactionInstruction without signing or sending.
 *
 * Optionally accepts `credentialMintAddress`. If not provided, the plan account
 * is fetched on-chain to resolve the credential mint.
 */
export async function buildCancelInstruction(
  program: Program,
  params: VelaCancelParams & {
    authority: PublicKey;
    usdcMintAddress: PublicKey;
    credentialMint?: PublicKey;
    credentialMintAddress?: PublicKey;
  },
): Promise<BuildCancelResult> {
  const { authority, subscriberAddress, planAddress, usdcMintAddress } = params;
  const programId = program.programId;

  const [derivedMandateAddress] = PDAFactory.mandateV1(
    subscriberAddress,
    planAddress,
    programId,
  );
  const mandateAddress = params.mandateAddress ?? derivedMandateAddress;

  // Resolve credential mint -- explicit override wins, otherwise prefer the V2
  // merchant credential and fall back to the plan-scoped legacy credential when
  // the fetched plan still points at the older mint.
  let credentialMint: PublicKey;
  const explicitCredentialMint =
    params.credentialMint ?? params.credentialMintAddress;
  if (explicitCredentialMint) {
    credentialMint = explicitCredentialMint;
  } else {
    const planAccount = await getSubscribablePlan(
      program,
      planAddress,
    );
    const resolvedPlan = resolvePlanContext(planAccount);
    const [merchantCredentialMint] = PDAFactory.credential(
      resolvedPlan.merchant,
      programId,
    );
    const [legacyCredentialMint] = PDAFactory.credentialV1(
      resolvedPlan.merchant,
      resolvedPlan.plan.planId,
      programId,
    );
    credentialMint = resolvedPlan.credentialMint.equals(legacyCredentialMint)
      ? legacyCredentialMint
      : resolvedPlan.credentialMint.equals(merchantCredentialMint)
        ? merchantCredentialMint
        : resolvedPlan.credentialMint;
  }

  // Derive subscriber's credential ATA and USDC ATA
  const subscriberCredentialAccount = getAssociatedTokenAddressSync(
    credentialMint,
    subscriberAddress,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const subscriberTokenAccount = getAssociatedTokenAddressSync(
    usdcMintAddress,
    subscriberAddress,
    false,
    TOKEN_PROGRAM_ID,
  );

  const instruction = await (program.methods as any)
    .cancel()
    .accounts({
      authority,
      subscriber: subscriberAddress,
      plan: planAddress,
      mandate: mandateAddress,
      subscriberCredentialAccount,
      credentialMint,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      subscriberTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return { instruction, mandateAddress };
}
