import { sha256 } from "@noble/hashes/sha2.js";
import { type Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { fetchStreamMandate } from "../accounts/deserialize";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
import { buildPauseStreamInstruction } from "./pause-stream";

function instructionDiscriminator(name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8));
}

function encodeOptionU64(value: bigint | null | undefined): Buffer {
  if (value == null) {
    return Buffer.from([0]);
  }

  const buffer = Buffer.alloc(9);
  buffer.writeUInt8(1, 0);
  buffer.writeBigUInt64LE(value, 1);
  return buffer;
}

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
    data: Buffer.concat([
      instructionDiscriminator("update_stream_rate"),
      encodeOptionU64(newRate),
      encodeOptionU64(newAuthorizedMaxRate),
    ]),
  });
}
