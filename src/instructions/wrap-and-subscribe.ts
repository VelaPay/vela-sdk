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
 * 1. createAssociatedTokenAccountIdempotentInstruction for subscriber's wrapped USDC ATA (Token-2022)
 * 2. buildWrapInstruction -- wraps SPL USDC -> wrapped USDC
 * 3. buildSubscribeInstruction -- creates mandate + mints credential NFT
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

  // 1. Create subscriber's wrapped USDC ATA (idempotent -- safe to include even if already exists)
  const wrappedAta = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    subscriber,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      subscriber, // payer
      wrappedAta, // ata address
      subscriber, // owner
      wrappedUsdcMint, // mint
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // 2. Wrap SPL USDC into wrapped USDC
  const { instruction: wrapIx } = await buildWrapInstruction(program, {
    subscriber,
    amount,
    splUsdcMint,
    wrappedUsdcMint,
    wrappingVault,
  });
  instructions.push(wrapIx);

  // 3. Subscribe (creates mandate PDA + mints credential NFT)
  const { instruction: subscribeIx, mandateAddress, credentialAccountAddress } =
    await buildSubscribeInstruction(program, {
      subscriber,
      planAddress,
      merchantAddress,
      usdcMintAddress: splUsdcMint, // kept for backward compat; subscribe no longer uses USDC
      credentialMintAddress,
    });
  instructions.push(subscribeIx);

  return { instructions, mandateAddress, credentialAccountAddress };
}
