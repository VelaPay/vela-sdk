import { Connection, clusterApiUrl } from "@solana/web3.js";

/**
 * Creates a Solana RPC connection.
 *
 * Resolution order:
 * 1. Explicit `url` parameter (from --url flag)
 * 2. SOLANA_RPC_URL environment variable
 * 3. Devnet cluster URL (default)
 */
export function createConnection(url?: string): Connection {
  const rpcUrl = url ?? process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
  return new Connection(rpcUrl, "confirmed");
}
