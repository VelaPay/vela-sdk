import {
  type Connection,
  type Keypair,
  type PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Command } from "commander";
import { fetchStreamMandate } from "../../../src/accounts";
import {
  buildCancelStreamInstruction,
  buildCreateStreamMandateInstruction,
  buildExecuteStreamInstruction,
  buildPauseStreamInstruction,
  buildResumeStreamInstruction,
} from "../../../src/instructions";
import type { StreamMandate } from "../../../src/types/stream-mandate";
import { createConnection } from "../../utils/connection";
import { printOutput } from "../../utils/output";
import {
  createCliContext,
  type GlobalCliOptions,
  handleCliError,
  parsePublicKey,
  parseUint,
} from "../agent-mandate/shared";

export { handleCliError, parsePublicKey, parseUint };

export type StreamWriteResult = {
  signature: string;
  mandate: PublicKey;
  action: "create" | "settle" | "pause" | "resume" | "cancel";
};

export type StreamStatusResult = {
  mandate: StreamMandate;
};

export type StreamCliRuntime = {
  buildCreateStreamMandateInstruction: typeof buildCreateStreamMandateInstruction;
  buildExecuteStreamInstruction: typeof buildExecuteStreamInstruction;
  buildPauseStreamInstruction: typeof buildPauseStreamInstruction;
  buildResumeStreamInstruction: typeof buildResumeStreamInstruction;
  buildCancelStreamInstruction: typeof buildCancelStreamInstruction;
  sendInstruction: (
    connection: Connection,
    payer: Keypair,
    instruction: TransactionInstruction,
  ) => Promise<string>;
  fetchStreamMandate: typeof fetchStreamMandate;
};

const defaultRuntime: StreamCliRuntime = {
  buildCreateStreamMandateInstruction,
  buildExecuteStreamInstruction,
  buildPauseStreamInstruction,
  buildResumeStreamInstruction,
  buildCancelStreamInstruction,
  async sendInstruction(connection, payer, instruction) {
    const transaction = new Transaction().add(instruction);
    return sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: "confirmed",
    });
  },
  fetchStreamMandate,
};

let runtime: StreamCliRuntime = defaultRuntime;

export function setStreamCliRuntimeForTests(
  nextRuntime: Partial<StreamCliRuntime> | null,
): void {
  runtime =
    nextRuntime == null
      ? defaultRuntime
      : { ...defaultRuntime, ...nextRuntime };
}

export function getStreamCliRuntime(): StreamCliRuntime {
  return runtime;
}

export async function createStreamWriteContext(command: Command) {
  const context = await createCliContext(command);
  return {
    ...context,
    runtime,
  };
}

export function getGlobalOptions(command: Command): GlobalCliOptions {
  let current: Command | null = command;
  while (current?.parent) {
    current = current.parent;
  }
  return (current?.opts() ?? {}) as GlobalCliOptions;
}

export function createReadOnlyConnection(command: Command): {
  globalOpts: GlobalCliOptions;
  connection: ReturnType<typeof createConnection>;
} {
  const globalOpts = getGlobalOptions(command);
  return {
    globalOpts,
    connection: createConnection(globalOpts.url),
  };
}

export function parseOptionalUint(
  value: string | undefined,
  label: string,
): bigint | null {
  return value == null ? null : parseUint(value, label);
}

export function parseSettleInterval(value: string): number {
  const parsed = parseUint(value, "min-settle-interval");
  if (parsed > 4_294_967_295n) {
    throw new Error("Invalid min-settle-interval: must fit in uint32");
  }
  return Number(parsed);
}

function formatStreamMandate(mandate: StreamMandate): string {
  const lines = [
    `Stream Mandate: ${mandate.address.toBase58()}`,
    `Status: ${mandate.status}`,
    `Subscriber: ${mandate.subscriber.toBase58()}`,
    `Merchant: ${mandate.merchant.toBase58()}`,
    `Mint: ${mandate.mint.toBase58()}`,
    `Rate Per Second: ${mandate.ratePerSecond.toString()}`,
    `Authorized Max Rate: ${mandate.authorizedMaxRate.toString()}`,
    `Total Streamed: ${mandate.totalStreamed.toString()}`,
    `Last Settled: ${mandate.lastSettledTs.toString()}`,
    `Min Settle Interval: ${mandate.minSettleInterval}s`,
    `Mandate Index: ${mandate.mandateIndex.toString()}`,
  ];

  if (mandate.maxStreamed != null) {
    lines.push(`Max Streamed: ${mandate.maxStreamed.toString()}`);
  }

  if (mandate.pausedAt != null) {
    lines.push(`Paused At: ${mandate.pausedAt.toString()}`);
  }

  return lines.join("\n");
}

function formatStreamWriteResult(result: StreamWriteResult): string {
  return [
    `Stream ${result.action} succeeded`,
    `Transaction: ${result.signature}`,
    `Mandate: ${result.mandate.toBase58()}`,
  ].join("\n");
}

export function printStreamWriteResult(
  result: StreamWriteResult,
  json?: boolean,
): void {
  printOutput(result, {
    json,
    formatHuman: formatStreamWriteResult,
  });
}

export function printStreamStatusResult(
  result: StreamStatusResult,
  json?: boolean,
): void {
  printOutput(result, {
    json,
    formatHuman: (value) => formatStreamMandate(value.mandate),
  });
}
