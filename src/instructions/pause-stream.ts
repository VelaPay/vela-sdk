import { type Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { fetchStreamMandate } from "../accounts/deserialize";
import { getAssociatedTokenAddress, PDAFactory } from "../accounts/pda";
import { asBytes, asInstructionData, instructionDiscriminator } from "../browser/bytes";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../constants";

async function fetchProtocolConfigValues(
  connection: Connection,
  programId: PublicKey,
): Promise<{ wrappingVault: PublicKey; hookProgramId: PublicKey }> {
  const [protocolConfig] = PDAFactory.config(programId);
  const info = await connection.getAccountInfo(protocolConfig);
  if (!info) {
    throw new Error(`ProtocolConfig account not found: ${protocolConfig.toBase58()}`);
  }

  const data = asBytes(info.data);
  const wrappingVault = new PublicKey(data.subarray(113, 145));
  const hookProgramId = new PublicKey(data.subarray(154, 186));
  return {
    wrappingVault,
    hookProgramId:
      hookProgramId.equals(PublicKey.default) ? TRANSFER_HOOK_PROGRAM_ID : hookProgramId,
  };
}

export async function buildPauseStreamInstruction(args: {
  connection: Connection;
  mandate: PublicKey;
  authority: PublicKey;
  programId?: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, mandate, authority, programId = PROGRAM_ID } = args;
  const streamMandate = await fetchStreamMandate(connection, mandate);
  const [tokenConfig] = PDAFactory.tokenConfig(streamMandate.mint, programId);
  const [protocolConfig] = PDAFactory.config(programId);
  const [pullApproval] = PDAFactory.approval(mandate, programId);
  const protocolConfigValues = await fetchProtocolConfigValues(connection, programId);
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    streamMandate.mint,
    protocolConfigValues.hookProgramId,
  );
  const subscriberWrappedAccount = getAssociatedTokenAddress(
    streamMandate.mint,
    mandate,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const merchantWrappedAccount = getAssociatedTokenAddress(
    streamMandate.mint,
    streamMandate.merchant,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: mandate, isSigner: false, isWritable: true },
      { pubkey: subscriberWrappedAccount, isSigner: false, isWritable: true },
      { pubkey: merchantWrappedAccount, isSigner: false, isWritable: true },
      { pubkey: streamMandate.mint, isSigner: false, isWritable: true },
      { pubkey: pullApproval, isSigner: false, isWritable: true },
      { pubkey: tokenConfig, isSigner: false, isWritable: false },
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: protocolConfigValues.wrappingVault, isSigner: false, isWritable: true },
      { pubkey: protocolConfigValues.hookProgramId, isSigner: false, isWritable: false },
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: asInstructionData(instructionDiscriminator("pause_stream")),
  });
}
