import type { Program } from "@coral-xyz/anchor";
import {
  type Connection,
  type PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { asInstructionData, instructionDiscriminator } from "../browser/bytes";
import { PROGRAM_ID } from "../constants";

export interface BuildSchedulePlanChangeResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

export async function buildSchedulePlanChangeInstruction(
  program: Program,
  _connection: Connection,
  params: {
    mandate: PublicKey;
    authority: PublicKey;
    newPlan: PublicKey;
  },
): Promise<BuildSchedulePlanChangeResult> {
  const programId = program.programId ?? PROGRAM_ID;
  const [protocolConfig] = PDAFactory.config(programId);

  return {
    instruction: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: true },
        { pubkey: params.newPlan, isSigner: false, isWritable: false },
        { pubkey: params.mandate, isSigner: false, isWritable: true },
        { pubkey: protocolConfig, isSigner: false, isWritable: false },
      ],
      data: asInstructionData(instructionDiscriminator("schedule_plan_change")),
    }),
    mandateAddress: params.mandate,
  };
}
