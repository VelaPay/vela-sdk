import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, PDAFactory } from "../accounts/pda";
import {
  getSubscribablePlan,
  resolvePlanContext,
} from "../accounts/subscribable-plan";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants";
import type { VelaSubscribeParams } from "../types";

export interface BuildSubscribeResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  credentialAccountAddress: PublicKey;
}

/**
 * Builds a raw `subscribe` TransactionInstruction without signing or sending.
 *
 * D-12 (fully implemented): No delegate approval. The mandate PDA is the authority
 * over the subscriber's wrapped USDC account. Subscribers must wrap SPL USDC before
 * executing pulls (use wrapAndSubscribe for atomic wrapping + subscribing).
 *
 * Optionally accepts `credentialMintAddress`. If not provided, the plan account
 * is fetched on-chain to resolve the credential mint.
 */
export async function buildSubscribeInstruction(
  program: Program,
  params: VelaSubscribeParams & {
    subscriber: PublicKey;
    credentialMint?: PublicKey;
    credentialMintAddress?: PublicKey;
  },
): Promise<BuildSubscribeResult> {
  const { subscriber, planAddress, merchantAddress } = params;

  const programId = program.programId;

  // Resolve credential mint -- explicit override wins, otherwise prefer the V2
  // merchant credential and fall back to the plan-scoped legacy credential when
  // the fetched plan still points at the older mint.
  let credentialMint: PublicKey;
  let resolvedMerchant = merchantAddress;
  const explicitCredentialMint =
    params.credentialMint ?? params.credentialMintAddress;
  if (explicitCredentialMint && resolvedMerchant != null) {
    credentialMint = explicitCredentialMint;
  } else {
    const planAccount = await getSubscribablePlan(program, planAddress);
    const resolvedPlan = resolvePlanContext(planAccount);
    credentialMint = resolvedPlan.credentialMint;
    resolvedMerchant = resolvedPlan.merchant;
    const [merchantCredentialMint] = PDAFactory.credential(
      resolvedMerchant,
      programId,
    );
    const [legacyCredentialMint] = PDAFactory.credentialV1(
      resolvedMerchant,
      resolvedPlan.plan.planId,
      programId,
    );
    if (credentialMint.equals(legacyCredentialMint)) {
      credentialMint = legacyCredentialMint;
    } else if (credentialMint.equals(merchantCredentialMint)) {
      credentialMint = merchantCredentialMint;
    } else {
      credentialMint = resolvedPlan.credentialMint;
    }
  }

  const [merchantStateAddress] = PDAFactory.merchantState(
    resolvedMerchant,
    programId,
  );
  const rawMerchantState = await (program.account as any).merchantState.fetch(
    merchantStateAddress,
  );
  const mandateIndex = BigInt(
    (rawMerchantState.mandateCounter ?? 0).toString(),
  );
  const [mandateAddress] = PDAFactory.mandate(
    subscriber,
    resolvedMerchant,
    mandateIndex,
    programId,
  );

  // Derive subscriber's credential ATA (Token-2022, for the non-transferable credential NFT)
  const subscriberCredentialAccount = getAssociatedTokenAddress(
    credentialMint,
    subscriber,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // No USDC accounts needed -- D-12: delegate approval removed entirely.
  // The subscribe instruction only creates the mandate and mints the credential NFT.
  const instruction = await (program.methods as any)
    .subscribe()
    .accounts({
      subscriber,
      merchant: resolvedMerchant,
      merchantState: merchantStateAddress,
      plan: planAddress,
      mandate: mandateAddress,
      credentialMint,
      subscriberCredentialAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  return {
    instruction,
    mandateAddress,
    credentialAccountAddress: subscriberCredentialAccount,
  };
}
