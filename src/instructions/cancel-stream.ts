import { sha256 } from "@noble/hashes/sha2.js";
import {
  type Connection,
  type PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { fetchStreamMandate } from "../accounts/deserialize";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
import { buildPauseStreamInstruction } from "./pause-stream";

function instructionDiscriminator(name: string): Buffer {
  return Buffer.from(
    sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8),
  );
}

export async function buildCancelStreamInstruction(args: {
  connection: Connection;
  mandate: PublicKey;
  authority: PublicKey;
  programId?: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, mandate, authority, programId = PROGRAM_ID } = args;
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
    data: instructionDiscriminator("cancel_stream"),
  });
}
