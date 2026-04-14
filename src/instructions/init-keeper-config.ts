import type { Program } from "@coral-xyz/anchor";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
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

  const [keeperConfigAddress] = PDAFactory.keeperConfig(programId);
  const [protocolConfig] = PDAFactory.config(programId);

  // Map TypeScript mode string to Anchor enum object
  const modeEnum =
    mode === "centralized" ? { centralized: {} } : { tukTuk: {} };

  // Convert endpoint string to Vec<u8> bytes with validation
  const endpointBytes = Buffer.from(keeperEndpoint);
  if (endpointBytes.length === 0) {
    throw new Error("keeperEndpoint must not be empty");
  }
  if (endpointBytes.length > 128) {
    throw new Error(
      `keeperEndpoint exceeds maximum length: ${endpointBytes.length} bytes (max 128)`,
    );
  }

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
