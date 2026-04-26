import { BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "../constants";
import idl from "../../idl/vela_protocol.json";
import { createHelius } from "./provider";
import type {
  AgentMandateAdjustedEvent,
  AgentMandateCreatedEvent,
  AgentMandateDrainedEvent,
  AgentMandatePausedEvent,
  AgentMandateResumedEvent,
  AgentMandateRevokedEvent,
  AgentPullExecutedEvent,
  AgentWebhookConfig,
  AgentWebhookEvent,
  HeliusWebhookPayload,
  HeliusWebhookTransaction,
} from "../types";

type AnchorNumeric = string | number | bigint | { toString(): string };
type AnchorMandateStatus = Partial<
  Record<"active" | "paused" | "revoked", object>
>;
interface AnchorEventData {
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  service?: PublicKey;
  dailyLimit?: AnchorNumeric;
  lifetimeCap?: AnchorNumeric;
  serviceCount?: AnchorNumeric;
  fundedAmount?: AnchorNumeric;
  minPullAmount?: AnchorNumeric;
  minPullInterval?: AnchorNumeric;
  amount?: AnchorNumeric;
  dailySpent: AnchorNumeric;
  totalSpent: AnchorNumeric;
  remainingBalance?: AnchorNumeric;
  status?: AnchorMandateStatus;
}

function normalizeWebhookTypes(transactionTypes?: string[]): string[] {
  return [...(transactionTypes ?? ["Any"])].sort();
}

function sameWebhookTypes(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export async function ensureAgentWebhook(args: {
  apiKey: string;
  agentWebhook: AgentWebhookConfig;
  programId?: import("@solana/web3.js").PublicKey;
}): Promise<{ webhookId: string; reused: boolean }> {
  const programId = (args.programId ?? PROGRAM_ID).toBase58();
  const helius = await createHelius(args.apiKey);
  const expectedTypes = normalizeWebhookTypes(
    args.agentWebhook.transactionTypes,
  );
  const expectedWebhookType = args.agentWebhook.webhookType ?? "enhanced";
  const expectedAuthHeader = args.agentWebhook.authHeader ?? null;
  const existing = (await helius.webhooks.getAll()).find(
    (webhook: {
      webhookURL: string;
      accountAddresses: string[];
      webhookType: string;
      transactionTypes?: string[];
      authHeader?: string | null;
      webhookID: string;
    }) =>
      webhook.webhookURL === args.agentWebhook.url &&
      webhook.accountAddresses.includes(programId) &&
      webhook.webhookType === expectedWebhookType &&
      sameWebhookTypes(
        normalizeWebhookTypes(webhook.transactionTypes),
        expectedTypes,
      ) &&
      (webhook.authHeader ?? null) === expectedAuthHeader,
  );

  if (existing) {
    return { webhookId: existing.webhookID, reused: true };
  }

  const created = await helius.webhooks.create({
    webhookURL: args.agentWebhook.url,
    accountAddresses: [programId],
    transactionTypes: expectedTypes,
    webhookType: expectedWebhookType,
    authHeader: args.agentWebhook.authHeader,
  });

  return { webhookId: created.webhookID, reused: false };
}

function normalizePayload(
  payload:
    | HeliusWebhookPayload
    | HeliusWebhookTransaction[]
    | HeliusWebhookTransaction,
): HeliusWebhookTransaction[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if ("transactions" in payload) {
    return payload.transactions;
  }
  return [payload];
}

function toBigInt(
  value: AnchorNumeric | undefined,
  field = "event numeric field",
): bigint {
  if (value === undefined) {
    throw new Error(`Missing ${field}`);
  }
  return BigInt(value.toString());
}

function toNumber(value: AnchorNumeric | undefined, field: string): number {
  if (value === undefined) {
    throw new Error(`Missing ${field}`);
  }
  return Number(value);
}

function requirePublicKey(
  value: PublicKey | undefined,
  field: string,
): PublicKey {
  if (value === undefined) {
    throw new Error(`Missing ${field}`);
  }
  return value;
}

function normalizeMandateStatus(
  raw: AnchorMandateStatus | undefined,
): "active" | "paused" | "revoked" {
  if (raw === undefined) {
    throw new Error("Missing AgentMandateStatus variant");
  }
  if (raw.active !== undefined) {
    return "active";
  }
  if (raw.paused !== undefined) {
    return "paused";
  }
  if (raw.revoked !== undefined) {
    return "revoked";
  }
  throw new Error(`Unknown AgentMandateStatus variant: ${JSON.stringify(raw)}`);
}

function normalizeAgentEvent(
  event: { name: string; data: AnchorEventData },
  signature?: string,
): AgentWebhookEvent | null {
  switch (event.name) {
    case "AgentMandateCreated":
      return {
        type: "AgentMandateCreated",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        dailyLimit: toBigInt(event.data.dailyLimit),
        lifetimeCap: toBigInt(event.data.lifetimeCap),
        serviceCount: toNumber(event.data.serviceCount, "serviceCount"),
        fundedAmount: toBigInt(event.data.fundedAmount),
        remainingBalance: toBigInt(event.data.remainingBalance),
      } satisfies AgentMandateCreatedEvent;
    case "AgentMandateAdjusted":
      return {
        type: "AgentMandateAdjusted",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        dailyLimit: toBigInt(event.data.dailyLimit),
        lifetimeCap: toBigInt(event.data.lifetimeCap),
        minPullAmount: toBigInt(event.data.minPullAmount),
        minPullInterval: toBigInt(event.data.minPullInterval),
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
        remainingBalance: toBigInt(event.data.remainingBalance),
      } satisfies AgentMandateAdjustedEvent;
    case "AgentPullExecuted":
      return {
        type: "AgentPullExecuted",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        service: requirePublicKey(event.data.service, "service"),
        amount: toBigInt(event.data.amount),
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
        remainingBalance: toBigInt(event.data.remainingBalance),
      } satisfies AgentPullExecutedEvent;
    case "AgentMandatePaused":
      return {
        type: "AgentMandatePaused",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
      } satisfies AgentMandatePausedEvent;
    case "AgentMandateResumed":
      return {
        type: "AgentMandateResumed",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
      } satisfies AgentMandateResumedEvent;
    case "AgentMandateRevoked":
      return {
        type: "AgentMandateRevoked",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
        remainingBalance: toBigInt(event.data.remainingBalance),
      } satisfies AgentMandateRevokedEvent;
    case "AgentMandateDrained":
      return {
        type: "AgentMandateDrained",
        signature,
        mandate: event.data.mandate,
        authority: event.data.authority,
        agent: event.data.agent,
        status: normalizeMandateStatus(event.data.status),
        dailySpent: toBigInt(event.data.dailySpent),
        totalSpent: toBigInt(event.data.totalSpent),
        remainingBalance: toBigInt(event.data.remainingBalance),
      } satisfies AgentMandateDrainedEvent;
    default:
      return null;
  }
}

export function parseAgentWebhookPayload(
  payload:
    | HeliusWebhookPayload
    | HeliusWebhookTransaction[]
    | HeliusWebhookTransaction,
  programId = PROGRAM_ID,
): AgentWebhookEvent[] {
  const parser = new EventParser(programId, new BorshCoder(idl as Idl));
  const events: AgentWebhookEvent[] = [];

  for (const transaction of normalizePayload(payload)) {
    const logs = transaction.logs ?? transaction.meta?.logMessages ?? [];
    for (const parsed of parser.parseLogs(logs)) {
      const normalized = normalizeAgentEvent(parsed, transaction.signature);
      if (normalized) {
        events.push(normalized);
      }
    }
  }

  return events;
}

export async function handleAgentWebhookPayload(
  payload:
    | HeliusWebhookPayload
    | HeliusWebhookTransaction[]
    | HeliusWebhookTransaction,
  onAgentEvent: (event: AgentWebhookEvent) => void | Promise<void>,
  programId = PROGRAM_ID,
): Promise<AgentWebhookEvent[]> {
  const events = parseAgentWebhookPayload(payload, programId);
  for (const event of events) {
    await onAgentEvent(event);
  }
  return events;
}
