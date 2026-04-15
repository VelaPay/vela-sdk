import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";

export type TokenConfigBillingRail = "hook" | "delegate";

export interface BuildInitTokenConfigParams {
  admin: PublicKey;
  mint: PublicKey;
  billingRail: TokenConfigBillingRail;
  decimals: number;
}

export interface BuildInitTokenConfigResult {
  instruction: TransactionInstruction;
  tokenConfigAddress: PublicKey;
  protocolConfigAddress: PublicKey;
}

function serializeBillingRail(rail: TokenConfigBillingRail) {
  return rail === "hook" ? { transferHook: {} } : { tokenDelegate: {} };
}

/**
 * Builds `init_token_config`.
 *
 * IDL account order reference: `idl/vela_protocol.json:1085-1138`
 * (`admin`, `protocol_config`, `mint`, `token_config`, `system_program`).
 * BillingRail enum variants reference: `idl/vela_protocol.json:3720-3728`
 * (`TransferHook`, `TokenDelegate`).
 */
export async function buildInitTokenConfigInstruction(
  program: Program,
  params: BuildInitTokenConfigParams,
): Promise<BuildInitTokenConfigResult> {
  const programId = program.programId ?? PROGRAM_ID;
  const [tokenConfigAddress] = PDAFactory.tokenConfig(params.mint, programId);
  const [protocolConfigAddress] = PDAFactory.config(programId);

  const instruction = await (program.methods as any)
    .initTokenConfig({
      billingRail: serializeBillingRail(params.billingRail),
      decimals: params.decimals,
    })
    .accounts({
      admin: params.admin,
      protocolConfig: protocolConfigAddress,
      mint: params.mint,
      tokenConfig: tokenConfigAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { instruction, tokenConfigAddress, protocolConfigAddress };
}
