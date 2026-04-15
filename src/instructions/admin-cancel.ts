import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PDAFactory, deriveConfigAddress } from "../accounts/pda";
import {
  getSubscribablePlan,
  resolvePlanContext,
} from "../accounts/subscribable-plan";
import { TOKEN_2022_PROGRAM_ID } from "../constants";
import type { VelaAdminCancelParams } from "../types";

export interface BuildAdminCancelResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

/**
 * Builds an admin_cancel TransactionInstruction.
 *
 * Requires admin authority (protocol admin in ProtocolConfig).
 * Uses PermanentDelegate on the plan PDA to burn the subscriber's credential token
 * without requiring the subscriber's signature.
 *
 * Optionally accepts credentialMintAddress. If not provided, the plan account
 * is fetched on-chain to resolve the credential mint.
 */
export async function buildAdminCancelInstruction(
  program: Program,
  params: VelaAdminCancelParams & { authority: PublicKey },
): Promise<BuildAdminCancelResult> {
  const { authority, subscriberAddress, planAddress, mandateAddress } = params;
  const planAccount = await getSubscribablePlan(program, planAddress);
  const resolvedPlan = resolvePlanContext(planAccount);
  const merchantAddress = resolvedPlan.merchant;
  const [merchantStateAddress] = PDAFactory.merchantState(
    merchantAddress,
    program.programId,
  );

  // Resolve credential mint -- either from param or by fetching the plan
  let credentialMint: PublicKey;
  if (params.credentialMintAddress) {
    credentialMint = params.credentialMintAddress;
  } else {
    credentialMint = resolvedPlan.credentialMint;
  }

  // Derive subscriber's credential ATA (Token-2022)
  const subscriberCredentialAccount = getAssociatedTokenAddressSync(
    credentialMint,
    subscriberAddress,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Derive the protocol config PDA
  const [protocolConfig] = deriveConfigAddress(program.programId);

  const instruction = await (program.methods as any)
    .adminCancel()
    .accounts({
      admin: authority,
      protocolConfig,
      merchant: merchantAddress,
      merchantState: merchantStateAddress,
      subscriber: subscriberAddress,
      plan: planAddress,
      mandate: mandateAddress,
      subscriberCredentialAccount,
      credentialMint,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction, mandateAddress };
}
