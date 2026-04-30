import type { Program } from "@coral-xyz/anchor";
import {
  type Connection,
  type PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { fetchMandate } from "../accounts/deserialize";
import { getAssociatedTokenAddress, PDAFactory } from "../accounts/pda";
import { asInstructionData, instructionDiscriminator } from "../browser/bytes";
import {
  PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../constants";

export interface BuildUpdateMandatePlanResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

async function fetchProtocolConfigValues(
  program: Program,
  protocolConfig: PublicKey,
): Promise<{
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
  hookProgramId: PublicKey;
}> {
  const raw = await (program.account as any).protocolConfig.fetch(
    protocolConfig,
  );
  return {
    wrappedUsdcMint: raw.wrappedUsdcMint,
    wrappingVault: raw.wrappingVault,
    hookProgramId: raw.transferHookProgramId ?? TRANSFER_HOOK_PROGRAM_ID,
  };
}

export async function buildUpdateMandatePlanInstruction(
  program: Program,
  connection: Connection,
  params: {
    mandate: PublicKey;
    authority: PublicKey;
    newPlan: PublicKey;
  },
): Promise<BuildUpdateMandatePlanResult> {
  const programId = program.programId ?? PROGRAM_ID;
  const mandate = await fetchMandate(connection, params.mandate);
  const [protocolConfig] = PDAFactory.config(programId);
  const protocolConfigValues = await fetchProtocolConfigValues(
    program,
    protocolConfig,
  );
  const [pullApproval] = PDAFactory.approval(params.mandate, programId);
  const [tokenConfig] = PDAFactory.tokenConfig(
    protocolConfigValues.wrappedUsdcMint,
    programId,
  );
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    protocolConfigValues.wrappedUsdcMint,
    protocolConfigValues.hookProgramId,
  );
  const subscriberWrappedAccount = getAssociatedTokenAddress(
    protocolConfigValues.wrappedUsdcMint,
    params.mandate,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const merchantWrappedAccount = getAssociatedTokenAddress(
    protocolConfigValues.wrappedUsdcMint,
    mandate.merchant,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  return {
    instruction: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: true },
        { pubkey: params.newPlan, isSigner: false, isWritable: false },
        { pubkey: params.mandate, isSigner: false, isWritable: true },
        { pubkey: subscriberWrappedAccount, isSigner: false, isWritable: true },
        { pubkey: merchantWrappedAccount, isSigner: false, isWritable: true },
        {
          pubkey: protocolConfigValues.wrappedUsdcMint,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: pullApproval, isSigner: false, isWritable: true },
        { pubkey: tokenConfig, isSigner: false, isWritable: false },
        { pubkey: protocolConfig, isSigner: false, isWritable: false },
        {
          pubkey: protocolConfigValues.wrappingVault,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: protocolConfigValues.hookProgramId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
        { pubkey: programId, isSigner: false, isWritable: false },
        {
          pubkey: TOKEN_2022_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: asInstructionData(instructionDiscriminator("update_mandate_plan")),
    }),
    mandateAddress: params.mandate,
  };
}
