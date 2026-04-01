import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { TransactionInstruction } from "@solana/web3.js";
import type { VelaWrapAndSubscribeParams } from "../types";
import { buildSubscribeInstruction } from "./subscribe";
import { buildWrapInstruction } from "./wrap";

export interface BuildWrapAndSubscribeResult {
  instructions: TransactionInstruction[];
  mandateAddress: import("@solana/web3.js").PublicKey;
  credentialAccountAddress: import("@solana/web3.js").PublicKey;
}

/**
 * Builds an array of instructions for atomic wrap + subscribe in one transaction.
 *
 * Per D-02 (atomic pattern): bundles 3 instructions that execute atomically --
 * if any fails, all revert. The caller submits all 3 instructions in one transaction.
 *
 * Instructions:
 * 1. buildSubscribeInstruction -- creates the mandate + mints the credential NFT
 * 2. createAssociatedTokenAccountIdempotentInstruction for the mandate-owned wrapped USDC ATA
 * 3. buildWrapInstruction -- wraps SPL USDC directly into the mandate-owned billing account
 */
export async function buildWrapAndSubscribeInstructions(
  program: Program,
  params: VelaWrapAndSubscribeParams,
): Promise<BuildWrapAndSubscribeResult> {
  const {
    subscriber,
    planAddress,
    merchantAddress,
    splUsdcMint,
    wrappedUsdcMint,
    wrappingVault,
    amount,
    credentialMintAddress,
  } = params;

  const instructions: TransactionInstruction[] = [];

  // 1. Subscribe first so we have the mandate PDA that will own the billing balance.
  const { instruction: subscribeIx, mandateAddress, credentialAccountAddress } =
    await buildSubscribeInstruction(program, {
      subscriber,
      planAddress,
      merchantAddress,
      usdcMintAddress: splUsdcMint, // kept for backward compat; subscribe no longer uses USDC
      credentialMintAddress,
    });
  instructions.push(subscribeIx);

  // 2. Create the mandate-owned wrapped USDC ATA.
  const wrappedAta = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    mandateAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      subscriber,
      wrappedAta,
      mandateAddress,
      wrappedUsdcMint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // 3. Wrap SPL USDC directly into the mandate-owned billing account.
  const { instruction: wrapIx } = await buildWrapInstruction(program, {
    subscriber,
    amount,
    splUsdcMint,
    wrappedUsdcMint,
    wrappingVault,
    destinationOwner: mandateAddress,
    destinationWrappedAccount: wrappedAta,
  });
  instructions.push(wrapIx);

  return { instructions, mandateAddress, credentialAccountAddress };
}
