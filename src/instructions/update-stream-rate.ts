import {
  type Connection,
  type PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { fetchStreamMandate } from "../accounts/deserialize";
import { PDAFactory } from "../accounts/pda";
import {
  asInstructionData,
  concatBytes,
  instructionDiscriminator,
  optionU64LE,
} from "../browser/bytes";
import { PROGRAM_ID } from "../constants";
import { buildPauseStreamInstruction } from "./pause-stream";

export async function buildUpdateStreamRateInstruction(args: {
  connection: Connection;
  mandate: PublicKey;
  authority: PublicKey;
  newRate?: bigint | null;
  newAuthorizedMaxRate?: bigint | null;
  programId?: PublicKey;
}): Promise<TransactionInstruction> {
  const {
    connection,
    mandate,
    authority,
    newRate,
    newAuthorizedMaxRate,
    programId = PROGRAM_ID,
  } = args;

  const streamMandate = await fetchStreamMandate(connection, mandate);
  PDAFactory.stream(
    streamMandate.subscriber,
    streamMandate.merchant,
    streamMandate.mandateIndex,
    programId,
  );
  const baseInstruction = await buildPauseStreamInstruction({
    connection,
    mandate,
    authority,
    programId,
  });

  return new TransactionInstruction({
    programId,
    keys: baseInstruction.keys,
    data: asInstructionData(
      concatBytes(
        instructionDiscriminator("update_stream_rate"),
        optionU64LE(newRate),
        optionU64LE(newAuthorizedMaxRate),
      ),
    ),
  });
}
