import { sha256 } from "@noble/hashes/sha2.js";
import {
  type Connection,
  type PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";

function instructionDiscriminator(name: string): Buffer {
  return Buffer.from(
    sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8),
  );
}

function encodeOptionU64(value: bigint | null): Buffer {
  if (value == null) {
    return Buffer.from([0]);
  }

  const buffer = Buffer.alloc(9);
  buffer.writeUInt8(1, 0);
  buffer.writeBigUInt64LE(value, 1);
  return buffer;
}

async function fetchStreamMandateCounter(
  connection: Connection,
  merchant: PublicKey,
  programId: PublicKey,
): Promise<bigint> {
  const [merchantStateAddress] = PDAFactory.merchantState(merchant, programId);
  const info = await connection.getAccountInfo(merchantStateAddress);
  if (!info) {
    throw new Error(
      `MerchantState account not found: ${merchantStateAddress.toBase58()}`,
    );
  }

  const data = Buffer.from(info.data);
  if (data.length < 97) {
    throw new Error(
      `MerchantState account ${merchantStateAddress.toBase58()} is truncated`,
    );
  }

  return data.readBigUInt64LE(89);
}

export async function buildCreateStreamMandateInstruction(args: {
  connection: Connection;
  subscriber: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  ratePerSecond: bigint;
  authorizedMaxRate: bigint;
  maxStreamed: bigint | null;
  minSettleInterval: number;
  programId?: PublicKey;
}): Promise<TransactionInstruction> {
  const {
    connection,
    subscriber,
    merchant,
    mint,
    ratePerSecond,
    authorizedMaxRate,
    maxStreamed,
    minSettleInterval,
    programId = PROGRAM_ID,
  } = args;

  const [merchantState] = PDAFactory.merchantState(merchant, programId);
  const mandateIndex = await fetchStreamMandateCounter(
    connection,
    merchant,
    programId,
  );
  const [mandate] = PDAFactory.stream(
    subscriber,
    merchant,
    mandateIndex,
    programId,
  );
  const [tokenConfig] = PDAFactory.tokenConfig(mint, programId);

  const data = Buffer.concat([
    instructionDiscriminator("create_stream_mandate"),
    Buffer.alloc(8),
    Buffer.alloc(8),
    encodeOptionU64(maxStreamed),
    Buffer.alloc(4),
  ]);
  data.writeBigUInt64LE(ratePerSecond, 8);
  data.writeBigUInt64LE(authorizedMaxRate, 16);
  data.writeUInt32LE(minSettleInterval, 33);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: subscriber, isSigner: true, isWritable: true },
      { pubkey: merchantState, isSigner: false, isWritable: true },
      { pubkey: mandate, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenConfig, isSigner: false, isWritable: false },
      { pubkey: subscriber, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
