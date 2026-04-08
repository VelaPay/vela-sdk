import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

export const DEFAULT_KEYPAIR_PATH = join(
  homedir(),
  ".config",
  "solana",
  "id.json",
);

export function resolveKeypairPath(path?: string): string {
  const envKeypair = process.env.KEYPAIR?.trim() || undefined;
  return path ?? envKeypair ?? DEFAULT_KEYPAIR_PATH;
}

/**
 * Loads a Solana keypair from a JSON file.
 *
 * Follows Solana CLI conventions:
 * 1. If `path` is provided, loads from that path.
 * 2. Otherwise, uses the KEYPAIR env var when present.
 * 3. Finally, falls back to the default Solana CLI path (~/.config/solana/id.json).
 */
export async function loadKeypair(path?: string): Promise<Keypair> {
  const keypairPath = resolveKeypairPath(path);
  const file = Bun.file(keypairPath);
  if (!(await file.exists())) {
    throw new Error(
      `Keypair not found at ${keypairPath}. Run 'solana-keygen new', set KEYPAIR, or specify --keypair <path>`,
    );
  }
  const secretKey = Uint8Array.from(await file.json());
  return Keypair.fromSecretKey(secretKey);
}
