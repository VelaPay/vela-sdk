import { Keypair } from "@solana/web3.js";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_KEYPAIR_PATH = join(homedir(), ".config", "solana", "id.json");

/**
 * Loads a Solana keypair from a JSON file.
 *
 * Follows Solana CLI conventions:
 * 1. If `path` is provided, loads from that path.
 * 2. Otherwise, loads from the default Solana CLI path (~/.config/solana/id.json).
 */
export async function loadKeypair(path?: string): Promise<Keypair> {
  const keypairPath = path ?? DEFAULT_KEYPAIR_PATH;
  const file = Bun.file(keypairPath);
  if (!(await file.exists())) {
    throw new Error(
      `Keypair not found at ${keypairPath}. Run 'solana-keygen new' or specify --keypair <path>`,
    );
  }
  const secretKey = Uint8Array.from(await file.json());
  return Keypair.fromSecretKey(secretKey);
}
