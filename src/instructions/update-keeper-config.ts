import type { Program } from "@coral-xyz/anchor";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { deriveKeeperConfigAddress } from "../accounts/pda";
import { CONFIG_SEED, PROGRAM_ID } from "../constants";
import type { UpdateKeeperConfigParams } from "../types";

export interface BuildUpdateKeeperConfigResult {
  instruction: TransactionInstruction;
  keeperConfigAddress: PublicKey;
}

/**
 * Builds a raw `update_keeper_config` TransactionInstruction without signing or sending.
 *
 * Updates the KeeperConfig singleton PDA for the protocol.
 * Admin-only: the caller must be the ProtocolConfig admin.
 * All fields are optional -- only non-null values are applied on-chain.
 */
export async function buildUpdateKeeperConfigInstruction(
  program: Program,
  params: UpdateKeeperConfigParams & { admin: PublicKey },
): Promise<BuildUpdateKeeperConfigResult> {
  const { admin, mode, keeperEndpoint, keeperAuthority } = params;

  const programId = program.programId ?? PROGRAM_ID;

  const [keeperConfigAddress] = deriveKeeperConfigAddress(programId);
  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    programId,
  );

  // Map optional mode string to Anchor enum object (null if not provided)
  const modeEnum =
    mode !== undefined
      ? mode === "centralized"
        ? { centralized: {} }
        : { tukTuk: {} }
      : null;

  // Convert optional endpoint string to bytes (null if not provided)
  const endpointBytes =
    keeperEndpoint !== undefined ? Buffer.from(keeperEndpoint) : null;

  // Keeper authority (null if not provided)
  const keeperAuthorityArg = keeperAuthority ?? null;

  const instruction = await (program.methods as any)
    .updateKeeperConfig(modeEnum, endpointBytes, keeperAuthorityArg)
    .accounts({
      admin,
      protocolConfig,
      keeperConfig: keeperConfigAddress,
    })
    .instruction();

  return { instruction, keeperConfigAddress };
}
