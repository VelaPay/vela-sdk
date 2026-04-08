import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveAgentMandateAddress } from "../accounts/pda";
import type { VelaResumeAgentMandateParams } from "../types";

export interface BuildResumeAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

export async function buildResumeAgentMandateInstruction(
  program: Program,
  params: VelaResumeAgentMandateParams & { authority: PublicKey },
): Promise<BuildResumeAgentMandateResult> {
  const { authority, agent } = params;
  const [mandateAddress] = deriveAgentMandateAddress(
    authority,
    agent,
    program.programId,
  );

  const instruction = await (program.methods as any)
    .resumeAgentMandate()
    .accounts({
      authority,
      agent,
      agentMandate: mandateAddress,
    })
    .instruction();

  return { instruction, mandateAddress };
}
