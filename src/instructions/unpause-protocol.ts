import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveConfigAddress } from "../accounts/pda";

export interface BuildUnpauseProtocolResult {
  instruction: TransactionInstruction;
  configAddress: PublicKey;
}

/**
 * Builds an unpause_protocol TransactionInstruction.
 * Accounts: admin (signer), config PDA (writable).
 *
 * Sets paused=false and paused_at=0 on the ProtocolConfig.
 * After this, execute_pull resumes normal operation.
 */
export async function buildUnpauseProtocolInstruction(
  program: Program,
  params: { authority: PublicKey },
): Promise<BuildUnpauseProtocolResult> {
  const { authority } = params;

  const [configAddress] = deriveConfigAddress(program.programId);

  const instruction = await (program.methods as any)
    .unpauseProtocol()
    .accounts({
      admin: authority,
      config: configAddress,
    })
    .instruction();

  return { instruction, configAddress };
}
