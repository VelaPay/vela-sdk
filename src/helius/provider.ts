import type { Connection, VersionedTransaction } from "@solana/web3.js";
import { Connection as Web3Connection } from "@solana/web3.js";

type HeliusConnectionClient = {
  connection?: Connection;
};

async function loadHeliusSdk() {
  try {
    return await import("helius-sdk");
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

function normalizeHeliusNetwork(cluster?: string): "mainnet" | "devnet" {
  switch (cluster) {
    case undefined:
    case "devnet":
      return "devnet";
    case "mainnet":
    case "mainnet-beta":
      return "mainnet";
    default:
      throw new Error(
        `Unsupported Helius cluster "${cluster}". Expected "devnet" or "mainnet-beta".`,
      );
  }
}

function buildHeliusRpcUrl(apiKey: string, cluster?: string): string {
  const network = normalizeHeliusNetwork(cluster);
  return network === "mainnet"
    ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
    : `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
}

export async function createHelius(apiKey: string, cluster?: string) {
  const { createHelius: createHeliusClient } = await loadHeliusSdk();
  return createHeliusClient({
    apiKey,
    network: normalizeHeliusNetwork(cluster),
  });
}

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
  const helius = (await createHelius(
    apiKey,
    cluster,
  )) as HeliusConnectionClient;
  if (helius.connection) {
    return helius.connection;
  }
  return new Web3Connection(buildHeliusRpcUrl(apiKey, cluster), "confirmed");
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
  await createHelius(heliusApiKey);
  return connection.sendTransaction(transaction);
}
