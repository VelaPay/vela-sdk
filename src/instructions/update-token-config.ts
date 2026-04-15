import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";

export interface BuildUpdateTokenConfigParams {
  admin: PublicKey;
  mint: PublicKey;
  enabled: boolean | null;
  oracleReference: PublicKey | null;
}

export interface BuildUpdateTokenConfigResult {
  instruction: TransactionInstruction;
  tokenConfigAddress: PublicKey;
}

/**
 * Builds `update_token_config`.
 *
 * IDL account order reference: `idl/vela_protocol.json:2539-2585`
 * (`admin`, `protocol_config`, `token_config`).
 */
export async function buildUpdateTokenConfigInstruction(
  program: Program,
  params: BuildUpdateTokenConfigParams,
): Promise<BuildUpdateTokenConfigResult> {
  const programId = program.programId ?? PROGRAM_ID;
  const [tokenConfigAddress] = PDAFactory.tokenConfig(params.mint, programId);
  const [protocolConfigAddress] = PDAFactory.config(programId);

  const instruction = await (program.methods as any)
    .updateTokenConfig({
      enabled: params.enabled,
      oracleReference: params.oracleReference,
    })
    .accounts({
      admin: params.admin,
      protocolConfig: protocolConfigAddress,
      tokenConfig: tokenConfigAddress,
    })
    .instruction();

  return { instruction, tokenConfigAddress };
}
