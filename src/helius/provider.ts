import type { Connection, VersionedTransaction } from "@solana/web3.js";

/**
 * Creates a Solana Connection backed by Helius RPC.
 *
 * Uses dynamic import of helius-sdk to keep it as an optional peer dependency.
 * If helius-sdk is not installed, throws a clear installation instruction.
 */
export async function createHeliusConnection(
  apiKey: string,
  cluster: string = "devnet",
): Promise<Connection> {
  try {
    const { Helius } = await import("helius-sdk");
    const helius = new Helius(apiKey, cluster as any);
    return helius.connection;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes("Cannot find module") ||
        err.message.includes("Cannot find package"))
    ) {
      throw new Error(
        "helius-sdk is not installed. Install it with: bun add helius-sdk",
      );
    }
    throw err;
  }
}

/**
 * Sends a transaction using Helius priority fee estimation and smart sending.
 *
 * Falls back to standard `connection.sendTransaction()` if Helius smart send
 * is unavailable or fails.
 */
export async function sendWithPriorityFee(
  heliusApiKey: string,
  connection: Connection,
  transaction: VersionedTransaction,
): Promise<string> {
  try {
    const { Helius } = await import("helius-sdk");
    const helius = new Helius(heliusApiKey);
    // Helius sendSmartTransaction handles priority fee estimation
    const signature = await helius.rpc.sendSmartTransaction(
      transaction.serialize() as any,
    );
    return signature;
  } catch {
    // Fallback to standard send
    const signature = await connection.sendTransaction(transaction);
    return signature;
  }
}
