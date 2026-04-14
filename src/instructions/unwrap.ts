import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
import type { VelaUnwrapParams } from "../types";

export interface BuildUnwrapResult {
  instruction: TransactionInstruction;
}

/**
 * Builds a raw `unwrap_tokens` TransactionInstruction without signing or sending.
 *
 * Unwraps Token-2022 wrapped USDC back into SPL USDC by:
 * 1. Burning wrapped USDC from user's Token-2022 account
 * 2. Releasing equivalent SPL USDC from the protocol vault to user
 */
export async function buildUnwrapInstruction(
  program: Program,
  params: VelaUnwrapParams,
): Promise<BuildUnwrapResult> {
  const { user, amount, splUsdcMint, wrappedUsdcMint, wrappingVault } = params;

  const programId = program.programId ?? PROGRAM_ID;

  const [config] = PDAFactory.config(programId);
  const [mintAuthority] = PDAFactory.mintAuthority(programId);

  // User's Token-2022 wrapped USDC ATA
  const userWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    user,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // User's SPL USDC ATA (Token program)
  const userUsdcAccount = getAssociatedTokenAddressSync(
    splUsdcMint,
    user,
    false,
    TOKEN_PROGRAM_ID,
  );

  const amountBN = new BN(amount.toString());

  // Note: instruction name is `unwrapTokens` (camelCase of `unwrap_tokens` in lib.rs)
  const instruction = await (program.methods as any)
    .unwrapTokens(amountBN)
    .accounts({
      user,
      config,
      splUsdcMint,
      wrappedUsdcMint,
      userWrappedAccount,
      userUsdcAccount,
      wrappingVault,
      mintAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction };
}
