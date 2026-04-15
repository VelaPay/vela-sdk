import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../constants";

export interface BuildInitMerchantCredentialParams {
  merchant: PublicKey;
}

export interface BuildInitMerchantCredentialResult {
  instruction: TransactionInstruction;
  merchantStateAddress: PublicKey;
  credentialMintAddress: PublicKey;
}

/**
 * Builds `init_merchant_credential`.
 *
 * IDL account order reference: `idl/vela_protocol.json:1006-1042`
 * (`merchant`, `merchant_state`, `credential_mint`, `system_program`,
 * `token_2022_program`, `rent`).
 */
export async function buildInitMerchantCredentialInstruction(
  program: Program,
  params: BuildInitMerchantCredentialParams,
): Promise<BuildInitMerchantCredentialResult> {
  const programId = program.programId ?? PROGRAM_ID;
  const [merchantStateAddress] = PDAFactory.merchantState(
    params.merchant,
    programId,
  );
  const [credentialMintAddress] = PDAFactory.credential(
    params.merchant,
    programId,
  );

  const instruction = await (program.methods as any)
    .initMerchantCredential()
    .accounts({
      merchant: params.merchant,
      merchantState: merchantStateAddress,
      credentialMint: credentialMintAddress,
      systemProgram: SystemProgram.programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  return { instruction, merchantStateAddress, credentialMintAddress };
}
