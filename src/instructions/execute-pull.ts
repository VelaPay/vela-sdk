import type { Program } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  type Connection,
  type PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { fetchMandate } from "../accounts/deserialize";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../constants";
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
  const raw = await (program.account as any).protocolConfig.fetch(
    protocolConfig,
  );
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
  } = params;
  const billingMint = params.billingMint ?? params.wrappedUsdcMint;

  const programId = program.programId ?? PROGRAM_ID;

  if (!explicitMandateAddress) {
    throw new Error(
      "buildExecutePullInstruction: mandateAddress is required (V2 -- cannot be re-derived from plan alone).",
    );
  }
  if (!billingMint) {
    throw new Error("buildExecutePullInstruction: billingMint is required");
  }
  const mandateAddress = explicitMandateAddress;
  const mandate = await fetchMandate(_connection, mandateAddress);

  const [pullApproval] = PDAFactory.approval(mandateAddress, programId);
  const [tokenConfigAddress] = PDAFactory.tokenConfig(billingMint, programId);
  const [protocolConfig] = PDAFactory.config(programId);
  const [keeperConfig] = PDAFactory.keeperConfig(programId);
  const protocolConfigValues = await fetchProtocolConfigValues(
    program,
    protocolConfig,
  );
  if (
    params.hookProgramId &&
    !params.hookProgramId.equals(protocolConfigValues.hookProgramId)
  ) {
    throw new Error(
      `buildExecutePullInstruction: hookProgramId override ${params.hookProgramId.toBase58()} does not match ProtocolConfig.transferHookProgramId ${protocolConfigValues.hookProgramId.toBase58()}.`,
    );
  }
  const effectiveHookProgramId = protocolConfigValues.hookProgramId;
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    billingMint,
    effectiveHookProgramId,
  );

  // Derive Token-2022 ATAs for the plan billing mint.
  const subscriberWrappedAccount = getAssociatedTokenAddressSync(
    billingMint,
    mandateAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const merchantWrappedAccount = getAssociatedTokenAddressSync(
    billingMint,
    merchantAddress,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const wrappingVault =
    params.wrappingVault ?? protocolConfigValues.wrappingVault;

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
      wrappedUsdcMint: billingMint,
      pullApproval,
      tokenConfig: tokenConfigAddress,
      protocolConfig,
      wrappingVault,
      hookProgram: effectiveHookProgramId,
      extraAccountMetaList,
      protocolProgram: programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  if (
    mandate.pendingChangeType === 2 &&
    mandate.pendingNewPlan &&
    mandate.pendingEffectiveAt !== undefined &&
    BigInt(Math.floor(Date.now() / 1000)) >= mandate.pendingEffectiveAt
  ) {
    return {
      instruction: new TransactionInstruction({
        programId: baseInstruction.programId,
        keys: [
          ...baseInstruction.keys,
          {
            pubkey: mandate.pendingNewPlan,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: baseInstruction.data,
      }),
      mandateAddress,
    };
  }

  return { instruction: baseInstruction, mandateAddress };
}
