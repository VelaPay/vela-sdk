import type { Program } from "@coral-xyz/anchor";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { deriveKeeperConfigAddress } from "../accounts/pda";
import { CONFIG_SEED, PROGRAM_ID } from "../constants";
import type { InitKeeperConfigParams } from "../types";

export interface BuildInitKeeperConfigResult {
  instruction: TransactionInstruction;
  keeperConfigAddress: PublicKey;
}

/**
 * Builds a raw `init_keeper_config` TransactionInstruction without signing or sending.
 *
 * Initializes the KeeperConfig singleton PDA for the protocol.
 * Admin-only: the caller must be the ProtocolConfig admin.
 */
export async function buildInitKeeperConfigInstruction(
  program: Program,
  params: InitKeeperConfigParams & { admin: PublicKey },
): Promise<BuildInitKeeperConfigResult> {
  const { admin, mode, keeperEndpoint, keeperAuthority } = params;

  const programId = program.programId ?? PROGRAM_ID;

  const [keeperConfigAddress] = deriveKeeperConfigAddress(programId);
  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    programId,
  );

  // Map TypeScript mode string to Anchor enum object
  const modeEnum =
    mode === "centralized" ? { centralized: {} } : { tukTuk: {} };

  // Convert endpoint string to Vec<u8> bytes
  const endpointBytes = Buffer.from(keeperEndpoint);

  const instruction = await (program.methods as any)
    .initKeeperConfig(modeEnum, endpointBytes, keeperAuthority)
    .accounts({
      admin,
      protocolConfig,
      keeperConfig: keeperConfigAddress,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .instruction();

  return { instruction, keeperConfigAddress };
}
