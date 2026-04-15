import { sha256 } from "@noble/hashes/sha2.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { type Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { fetchStreamMandate } from "../accounts/deserialize";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../constants";

function instructionDiscriminator(name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8));
}

async function fetchProtocolConfigValues(
  connection: Connection,
  programId: PublicKey,
): Promise<{ wrappingVault: PublicKey; hookProgramId: PublicKey }> {
  const [protocolConfig] = PDAFactory.config(programId);
  const info = await connection.getAccountInfo(protocolConfig);
  if (!info) {
    throw new Error(`ProtocolConfig account not found: ${protocolConfig.toBase58()}`);
  }

  const data = Buffer.from(info.data);
  if (data.length < 154) {
    throw new Error(`ProtocolConfig account ${protocolConfig.toBase58()} is truncated`);
  }

  const wrappingVault = new PublicKey(data.subarray(113, 145));
  const hookProgramId = new PublicKey(data.subarray(154, 186));

  return {
    wrappingVault,
    hookProgramId:
      hookProgramId.equals(PublicKey.default) ? TRANSFER_HOOK_PROGRAM_ID : hookProgramId,
  };
}

export async function buildExecuteStreamInstruction(args: {
  connection: Connection;
  mandate: PublicKey;
  payer: PublicKey;
  programId?: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, mandate, payer, programId = PROGRAM_ID } = args;
  const streamMandate = await fetchStreamMandate(connection, mandate);
  const [keeperConfig] = PDAFactory.keeperConfig(programId);
  const [tokenConfig] = PDAFactory.tokenConfig(streamMandate.mint, programId);
  const [protocolConfig] = PDAFactory.config(programId);
  const protocolConfigValues = await fetchProtocolConfigValues(connection, programId);
  const [pullApproval] = PDAFactory.approval(mandate, programId);
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    streamMandate.mint,
    protocolConfigValues.hookProgramId,
  );

  const subscriberWrappedAccount = getAssociatedTokenAddressSync(
    streamMandate.mint,
    mandate,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const merchantWrappedAccount = getAssociatedTokenAddressSync(
    streamMandate.mint,
    streamMandate.merchant,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: streamMandate.subscriber, isSigner: false, isWritable: false },
      { pubkey: streamMandate.merchant, isSigner: false, isWritable: false },
      { pubkey: keeperConfig, isSigner: false, isWritable: false },
      { pubkey: mandate, isSigner: false, isWritable: true },
      { pubkey: subscriberWrappedAccount, isSigner: false, isWritable: true },
      { pubkey: merchantWrappedAccount, isSigner: false, isWritable: true },
      { pubkey: streamMandate.mint, isSigner: false, isWritable: false },
      { pubkey: pullApproval, isSigner: false, isWritable: false },
      { pubkey: tokenConfig, isSigner: false, isWritable: false },
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: protocolConfigValues.wrappingVault, isSigner: false, isWritable: false },
      { pubkey: protocolConfigValues.hookProgramId, isSigner: false, isWritable: false },
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionDiscriminator("execute_stream"),
  });
}
