import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveMandateAddress } from "../accounts/pda";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../constants";
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
    credentialMintAddress?: PublicKey;
  },
): Promise<BuildCancelResult> {
  const { authority, subscriberAddress, planAddress, usdcMintAddress } = params;

  // Derive mandate PDA
  const [mandateAddress] = deriveMandateAddress(subscriberAddress, planAddress, program.programId);

  // Resolve credential mint -- either from param or by fetching the plan
  let credentialMint: PublicKey;
  if (params.credentialMintAddress) {
    credentialMint = params.credentialMintAddress;
  } else {
    const planAccount = await (program.account as any).velaPlan.fetch(planAddress);
    credentialMint = planAccount.credentialMint;
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
