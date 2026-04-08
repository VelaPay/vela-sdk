import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveAgentMandateAddress } from "../accounts/pda";
import type { VelaPauseAgentMandateParams } from "../types";

export interface BuildPauseAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

export async function buildPauseAgentMandateInstruction(
  program: Program,
  params: VelaPauseAgentMandateParams & { authority: PublicKey },
): Promise<BuildPauseAgentMandateResult> {
  const { authority, agent } = params;
  const [mandateAddress] = deriveAgentMandateAddress(
    authority,
    agent,
    program.programId,
  );

  const instruction = await (program.methods as any)
    .pauseAgentMandate()
    .accounts({
      authority,
      agent,
      agentMandate: mandateAddress,
    })
    .instruction();

  return { instruction, mandateAddress };
}
