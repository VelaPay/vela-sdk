import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveConfigAddress } from "../accounts/pda";

export interface BuildPauseProtocolResult {
  instruction: TransactionInstruction;
  configAddress: PublicKey;
}

/**
 * Builds a pause_protocol TransactionInstruction.
 * Accounts: admin (signer), config PDA (writable).
 *
 * Sets paused=true and paused_at=now on the ProtocolConfig.
 * After this, execute_pull returns ProtocolPaused until unpause_protocol is called.
 */
export async function buildPauseProtocolInstruction(
  program: Program,
  params: { authority: PublicKey },
): Promise<BuildPauseProtocolResult> {
  const { authority } = params;

  const [configAddress] = deriveConfigAddress(program.programId);

  const instruction = await (program.methods as any)
    .pauseProtocol()
    .accounts({
      admin: authority,
      config: configAddress,
    })
    .instruction();

  return { instruction, configAddress };
}
