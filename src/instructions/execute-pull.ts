import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  addExtraAccountMetasForExecute,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { deriveMandateAddress } from "../accounts/pda";
import { APPROVAL_SEED, PROGRAM_ID } from "../constants";
import type { VelaPullParams } from "../types";

export interface BuildExecutePullResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

/**
 * Builds a raw `execute_pull` TransactionInstruction without signing or sending.
 *
 * Uses Token-2022 transfer_checked which triggers the transfer hook CPI.
 * The mandate PDA signs the transfer as authority over the subscriber's wrapped USDC account.
 * Extra accounts for the transfer hook (ExtraAccountMetaList, vault, config) are resolved
 * automatically via addExtraAccountMetasForExecute. The PullApproval PDA is appended manually.
 *
 * Pull execution is permissionless -- any payer can submit the transaction
 * as long as the mandate conditions are met on-chain and a valid PullApproval PDA exists.
 */
export async function buildExecutePullInstruction(
  program: Program,
  connection: Connection,
  params: VelaPullParams & { payer: PublicKey },
): Promise<BuildExecutePullResult> {
  const {
    payer,
    subscriberAddress,
    merchantAddress,
    planAddress,
    wrappedUsdcMint,
  } = params;

  const programId = program.programId ?? PROGRAM_ID;

  // Derive mandate PDA
  const [mandateAddress] = deriveMandateAddress(
    subscriberAddress,
    planAddress,
    programId,
  );

  // Derive PullApproval PDA: seeds = [b"approval", mandate.key()]
  const [pullApproval] = PublicKey.findProgramAddressSync(
    [APPROVAL_SEED, mandateAddress.toBuffer()],
    programId,
  );

  // Derive Token-2022 ATAs for wrapped USDC
  const subscriberWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    subscriberAddress,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const merchantWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    merchantAddress,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Build the base execute_pull instruction from Anchor
  // The mandate PDA is the authority (token::authority = mandate in the program)
  const baseInstruction = await (program.methods as any)
    .executePull()
    .accounts({
      payer,
      subscriber: subscriberAddress,
      merchant: merchantAddress,
      plan: planAddress,
      mandate: mandateAddress,
      subscriberWrappedAccount,
      merchantWrappedAccount,
      wrappedUsdcMint,
      pullApproval,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  // Resolve extra account metas for the transfer hook from the ExtraAccountMetaList PDA.
  // This adds the ExtraAccountMetaList PDA and any static extra accounts (vault, config)
  // that were registered in init_extra_account_meta_list.
  // The PullApproval PDA is already in the Anchor accounts struct and does NOT need
  // to be added via addExtraAccountMetasForExecute (it is passed as a named account).
  try {
    await addExtraAccountMetasForExecute(
      connection,
      baseInstruction,
      programId, // transfer hook program ID = this program
      subscriberWrappedAccount,
      wrappedUsdcMint,
      merchantWrappedAccount,
      mandateAddress, // owner/authority for the transfer hook Execute
      BigInt(0), // amount placeholder (hook reads it from the instruction)
      "confirmed",
    );
  } catch {
    // If ExtraAccountMetaList is not yet initialized (e.g., in tests or before protocol setup),
    // proceed without extra accounts. The on-chain hook will fail if called, but this allows
    // building the instruction offline.
  }

  return { instruction: baseInstruction, mandateAddress };
}
