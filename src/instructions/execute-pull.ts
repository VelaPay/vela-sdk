import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveMandateAddress } from "../accounts/pda";
import { TOKEN_PROGRAM_ID } from "../constants";
import type { VelaPullParams } from "../types";

export interface BuildExecutePullResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

/**
 * Builds a raw `execute_pull` TransactionInstruction without signing or sending.
 *
 * Pull execution is permissionless -- any payer can submit the transaction
 * as long as the mandate conditions are met on-chain.
 */
export async function buildExecutePullInstruction(
  program: Program,
  params: VelaPullParams & { payer: PublicKey },
): Promise<BuildExecutePullResult> {
  const {
    payer,
    subscriberAddress,
    merchantAddress,
    planAddress,
    usdcMintAddress,
  } = params;

  // Derive mandate PDA
  const [mandateAddress] = deriveMandateAddress(
    subscriberAddress,
    planAddress,
    program.programId,
  );

  // Derive USDC ATAs for subscriber and merchant
  const subscriberTokenAccount = getAssociatedTokenAddressSync(
    usdcMintAddress,
    subscriberAddress,
    false,
    TOKEN_PROGRAM_ID,
  );

  const merchantTokenAccount = getAssociatedTokenAddressSync(
    usdcMintAddress,
    merchantAddress,
    false,
    TOKEN_PROGRAM_ID,
  );

  const instruction = await (program.methods as any)
    .executePull()
    .accounts({
      payer,
      subscriber: subscriberAddress,
      merchant: merchantAddress,
      plan: planAddress,
      mandate: mandateAddress,
      subscriberTokenAccount,
      merchantTokenAccount,
      usdcMint: usdcMintAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return { instruction, mandateAddress };
}
