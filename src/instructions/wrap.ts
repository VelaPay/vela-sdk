import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getAssociatedTokenAddress, PDAFactory } from "../accounts/pda";
import {
  PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants";
import type { VelaWrapParams } from "../types";

export interface BuildWrapResult {
  instruction: TransactionInstruction;
}

/**
 * Builds a raw `wrap` TransactionInstruction without signing or sending.
 *
 * Wraps SPL USDC into Token-2022 wrapped USDC by:
 * 1. Transferring SPL USDC from subscriber to protocol vault
 * 2. Minting equivalent wrapped USDC to subscriber's Token-2022 account
 */
export async function buildWrapInstruction(
  program: Program,
  params: VelaWrapParams,
): Promise<BuildWrapResult> {
  const {
    subscriber,
    amount,
    splUsdcMint,
    wrappedUsdcMint,
    wrappingVault,
    destinationOwner = subscriber,
    destinationWrappedAccount,
  } = params;

  const programId = program.programId ?? PROGRAM_ID;

  const [config] = PDAFactory.config(programId);
  const [mintAuthority] = PDAFactory.mintAuthority(programId);

  // Subscriber's SPL USDC ATA (Token program)
  const subscriberUsdcAccount = getAssociatedTokenAddress(
    splUsdcMint,
    subscriber,
    false,
    TOKEN_PROGRAM_ID,
  );

  const resolvedDestinationWrappedAccount =
    destinationWrappedAccount ??
    getAssociatedTokenAddress(
      wrappedUsdcMint,
      destinationOwner,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

  const amountBN = new BN(amount.toString());

  const instruction = await (program.methods as any)
    .wrap(amountBN)
    .accounts({
      subscriber,
      config,
      splUsdcMint,
      wrappedUsdcMint,
      subscriberUsdcAccount,
      destinationWrappedAccount: resolvedDestinationWrappedAccount,
      destinationAuthority: destinationOwner,
      wrappingVault,
      mintAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction };
}
