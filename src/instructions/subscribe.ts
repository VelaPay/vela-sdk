import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  type PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { deriveMandateAddress } from "../accounts/pda";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants";
import {
  getSubscribablePlan,
  resolvePlanContext,
} from "../accounts/subscribable-plan";
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
    credentialMintAddress?: PublicKey;
  },
): Promise<BuildSubscribeResult> {
  const { subscriber, planAddress, merchantAddress } = params;

  // Derive mandate PDA
  const [mandateAddress] = deriveMandateAddress(
    subscriber,
    planAddress,
    program.programId,
  );

  // Resolve credential mint -- either from param or by fetching the plan
  let credentialMint: PublicKey;
  let resolvedMerchant = merchantAddress;
  if (params.credentialMintAddress) {
    credentialMint = params.credentialMintAddress;
  } else {
    const planAccount = await getSubscribablePlan(
      program,
      planAddress,
    );
    const resolvedPlan = resolvePlanContext(planAccount);
    credentialMint = resolvedPlan.credentialMint;
    resolvedMerchant = resolvedPlan.merchant;
  }

  // Derive subscriber's credential ATA (Token-2022, for the non-transferable credential NFT)
  const subscriberCredentialAccount = getAssociatedTokenAddressSync(
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
