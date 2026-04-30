import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import { deserializeAgentMandate } from "../../../src/accounts/deserialize";
import { VelaError } from "../../../src/errors/base";
import { velaProgramIdl } from "../../../src/idl";
import type {
  AgentMandate,
  AgentMandateDrainResult,
  AgentMandateMethodResult,
  AgentMandateRevokeResult,
  AgentServiceLimitInput,
} from "../../../src/types";
import { createConnection } from "../../utils/connection";
import { formatDuration, formatLamports } from "../../utils/formatting";
import { loadKeypair } from "../../utils/keypair";
import { printOutput } from "../../utils/output";
import { createCliVelaClient } from "../../utils/sdk";

export type AgentMandateWriteResult =
  | AgentMandateMethodResult
  | AgentMandateDrainResult
  | AgentMandateRevokeResult;

export type GlobalCliOptions = {
  keypair?: string;
  url?: string;
  json?: boolean;
};

export function getGlobalOptions(command: Command): GlobalCliOptions {
  let current: Command | null = command;
  while (current?.parent) {
    current = current.parent;
  }
  return (current?.opts() ?? {}) as GlobalCliOptions;
}

export async function createCliContext(command: Command): Promise<{
  globalOpts: GlobalCliOptions;
  keypair: Awaited<ReturnType<typeof loadKeypair>>;
  connection: ReturnType<typeof createConnection>;
  vela: ReturnType<typeof createCliVelaClient>;
}> {
  const globalOpts = getGlobalOptions(command);
  const keypair = await loadKeypair(globalOpts.keypair);
  const connection = createConnection(globalOpts.url);
  const wallet = new Wallet(keypair);
  const vela = createCliVelaClient({ connection, wallet: wallet as any });

  return {
    globalOpts,
    keypair,
    connection,
    vela,
  };
}

export function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export function parseOptionalPublicKey(
  value: string | undefined,
  label: string,
): PublicKey | undefined {
  return value ? parsePublicKey(value, label) : undefined;
}

export function parseUsdcAmount(value: string, label: string): bigint {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(?:\.(\d{1,6})?)?$/);
  if (!match) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return whole * 1_000_000n + fractional;
}

export function parseUint(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return BigInt(normalized);
}

function parseCsv(value: string, label: string): string[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    throw new Error(`Expected at least one ${label}`);
  }
  return entries;
}

export function parseServiceLimitInputs(
  servicesValue?: string,
  serviceLimitsValue?: string,
): AgentServiceLimitInput[] | undefined {
  if (servicesValue == null && serviceLimitsValue == null) {
    return undefined;
  }

  if (servicesValue == null || serviceLimitsValue == null) {
    throw new Error(
      "Both --services and --service-limits are required when updating service limits.",
    );
  }

  const services = parseCsv(servicesValue, "services");
  const serviceLimits = parseCsv(serviceLimitsValue, "service limits");

  if (services.length !== serviceLimits.length) {
    throw new Error(
      "The number of --services entries must match the number of --service-limits entries.",
    );
  }

  return services.map((service, index) => ({
    service: parsePublicKey(service, `service[${index}]`),
    dailyLimit: parseUsdcAmount(
      serviceLimits[index]!,
      `service-limits[${index}]`,
    ),
  }));
}

export async function fetchAgentMandateByAddress(
  connection: ReturnType<typeof createConnection>,
  mandateAddress: PublicKey,
): Promise<AgentMandate> {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async (transaction: any) => transaction,
      signAllTransactions: async (transactions: any) => transactions,
    } as any,
    { commitment: "confirmed" },
  );
  const program = new Program(velaProgramIdl as any, provider);
  const raw = await (program.account as any).agentMandate.fetch(mandateAddress);
  return deserializeAgentMandate(mandateAddress, raw);
}

function formatAgentMandateWriteResult(
  action: string,
  result: AgentMandateWriteResult,
): string {
  const lines = [`${action} succeeded`, `Transaction: ${result.signature}`];

  if (result.address) {
    lines.push(`Mandate: ${result.address.toBase58()}`);
  }

  if ("drainedAmount" in result) {
    lines.push(`Drained Amount: ${formatLamports(result.drainedAmount)}`);
  }

  if ("reclaimedAmount" in result) {
    lines.push(`Reclaimed Amount: ${formatLamports(result.reclaimedAmount)}`);
  }

  if (result.data) {
    lines.push(`Status: ${result.data.status}`);
    lines.push(`Daily Spent: ${formatLamports(result.data.dailySpent)}`);
    lines.push(`Total Spent: ${formatLamports(result.data.totalSpent)}`);
    lines.push(
      `Min Pull Interval: ${formatDuration(result.data.minPullInterval)}`,
    );
  }

  return lines.join("\n");
}

export function printAgentMandateWriteResult(
  action: string,
  result: AgentMandateWriteResult,
  json?: boolean,
): void {
  printOutput(result, {
    json,
    formatHuman: (value) => formatAgentMandateWriteResult(action, value),
  });
}

export function handleCliError(err: unknown): never {
  if (err instanceof VelaError) {
    console.error(`\nError [${err.name}]: ${err.message}`);
    if (err.context) {
      console.error("Context:", JSON.stringify(err.context, null, 2));
    }
  } else if (err instanceof Error) {
    console.error(`\nError: ${err.message}`);
  } else {
    console.error("\nAn unexpected error occurred. Use --verbose for details.");
  }

  process.exit(1);
}
