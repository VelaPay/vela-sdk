import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG_SEED, MINT_AUTHORITY_SEED, PROGRAM_ID } from "../constants";
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
  const { subscriber, amount, splUsdcMint, wrappedUsdcMint, wrappingVault } =
    params;

  const programId = program.programId ?? PROGRAM_ID;

  // Derive ProtocolConfig PDA: seeds = [b"config"]
  const [config] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    programId,
  );

  // Derive mint_authority PDA: seeds = [b"mint-authority"]
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [MINT_AUTHORITY_SEED],
    programId,
  );

  // Subscriber's SPL USDC ATA (Token program)
  const subscriberUsdcAccount = getAssociatedTokenAddressSync(
    splUsdcMint,
    subscriber,
    false,
    TOKEN_PROGRAM_ID,
  );

  // Subscriber's Token-2022 wrapped USDC ATA
  const subscriberWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    subscriber,
    false,
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
      subscriberWrappedAccount,
      wrappingVault,
      mintAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction };
}
