import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { PDAFactory, deriveMandateAddress } from "../accounts/pda";
import {
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../constants";
import type { VelaPullParams } from "../types";

export interface BuildExecutePullResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

async function fetchProtocolConfigValues(
  program: Program,
  protocolConfig: PublicKey,
): Promise<{
  wrappingVault: PublicKey;
  hookProgramId: PublicKey;
}> {
  const raw = await (program.account as any).protocolConfig.fetch(protocolConfig);
  return {
    wrappingVault: raw.wrappingVault,
    hookProgramId: raw.transferHookProgramId ?? TRANSFER_HOOK_PROGRAM_ID,
  };
}

/**
 * Builds a raw `execute_pull` TransactionInstruction without signing or sending.
 *
 * Settles a pull through Token-2022 `transfer_checked`, which fires the
 * dedicated Vela transfer-hook validator against the mandate-owned source ATA.
 *
 * Pull execution requires the payer to be the authorized keeper (keeper_authority in KeeperConfig).
 * The on-chain program validates that payer.key() == keeper_config.keeper_authority.
 */
export async function buildExecutePullInstruction(
  program: Program,
  _connection: Connection,
  params: VelaPullParams & { payer: PublicKey },
): Promise<BuildExecutePullResult> {
  const {
    payer,
    mandateAddress: explicitMandateAddress,
    subscriberAddress,
    merchantAddress,
    planAddress,
    wrappedUsdcMint,
  } = params;

  const programId = program.programId ?? PROGRAM_ID;

  // Derive mandate PDA
  const mandateAddress =
    explicitMandateAddress ??
    deriveMandateAddress(subscriberAddress, planAddress, programId)[0];

  const [pullApproval] = PDAFactory.approval(mandateAddress, programId);
  const [protocolConfig] = PDAFactory.config(programId);
  const [keeperConfig] = PDAFactory.keeperConfig(programId);
  const protocolConfigValues = await fetchProtocolConfigValues(
    program,
    protocolConfig,
  );
  const effectiveHookProgramId =
    params.hookProgramId ?? protocolConfigValues.hookProgramId;
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    wrappedUsdcMint,
    effectiveHookProgramId,
  );

  // Derive Token-2022 ATAs for wrapped USDC
  const subscriberWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    mandateAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const merchantWrappedAccount = getAssociatedTokenAddressSync(
    wrappedUsdcMint,
    merchantAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const wrappingVault =
    params.wrappingVault ??
    protocolConfigValues.wrappingVault;

  const baseInstruction = await (program.methods as any)
    .executePull()
    .accounts({
      payer,
      subscriber: subscriberAddress,
      merchant: merchantAddress,
      keeperConfig,
      plan: planAddress,
      mandate: mandateAddress,
      subscriberWrappedAccount,
      merchantWrappedAccount,
      wrappedUsdcMint,
      pullApproval,
      protocolConfig,
      wrappingVault,
      hookProgram: effectiveHookProgramId,
      extraAccountMetaList,
      protocolProgram: programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction: baseInstruction, mandateAddress };
}
