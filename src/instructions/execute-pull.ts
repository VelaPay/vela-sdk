import type { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { deriveMandateAddress } from "../accounts/pda";
import {
  APPROVAL_SEED,
  CONFIG_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  KEEPER_CONFIG_SEED,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../constants";
import type { VelaPullParams } from "../types";

export interface BuildExecutePullResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
}

async function fetchWrappingVault(
  connection: Connection,
  protocolConfig: PublicKey,
): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(protocolConfig);
  if (!accountInfo || accountInfo.data.length < 145) {
    throw new Error("ProtocolConfig account not found or invalid");
  }

  const wrappingVaultOffset = 113;
  return new PublicKey(
    accountInfo.data.subarray(wrappingVaultOffset, wrappingVaultOffset + 32),
  );
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

  // Derive PullApproval PDA: seeds = [b"approval", mandate.key()]
  const [pullApproval] = PublicKey.findProgramAddressSync(
    [APPROVAL_SEED, mandateAddress.toBuffer()],
    programId,
  );
  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    programId,
  );
  const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, wrappedUsdcMint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  );
  const [keeperConfig] = PublicKey.findProgramAddressSync(
    [KEEPER_CONFIG_SEED],
    programId,
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
    (await fetchWrappingVault(_connection, protocolConfig));

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
      hookProgram: TRANSFER_HOOK_PROGRAM_ID,
      extraAccountMetaList,
      protocolProgram: programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction: baseInstruction, mandateAddress };
}
