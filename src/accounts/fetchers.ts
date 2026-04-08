import type { Program } from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import type {
  AgentBudgetSummary,
  AgentMandate,
  AgentMandateVerificationResult,
  CheckAgentBudgetParams,
  MerchantState,
  VerifyAgentMandateParams,
  VelaMandate,
  VelaPlan,
} from "../types";
import {
  deserializeAgentMandate,
  deserializeMandate,
  deserializeMerchantState,
  deserializePlan,
} from "./deserialize";
import {
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  deriveConfigAddress,
  deriveMerchantStateAddress,
} from "./pda";

const AGENT_DAILY_RESET_WINDOW_SECONDS = 86_400n;

function resolveNow(now?: bigint | number): bigint {
  return now == null ? BigInt(Math.floor(Date.now() / 1000)) : BigInt(now);
}

function computeResetWindow(
  spent: bigint,
  lastReset: bigint,
  now: bigint,
): { spent: bigint; nextResetAt: bigint } {
  if (now - lastReset >= AGENT_DAILY_RESET_WINDOW_SECONDS) {
    return {
      spent: 0n,
      nextResetAt: now + AGENT_DAILY_RESET_WINDOW_SECONDS,
    };
  }

  return {
    spent,
    nextResetAt: lastReset + AGENT_DAILY_RESET_WINDOW_SECONDS,
  };
}

function clampRemaining(limit: bigint, spent: bigint): bigint {
  return limit > spent ? limit - spent : 0n;
}

async function resolveWrappedUsdcMint(
  program: Program,
  wrappedUsdcMint?: PublicKey,
): Promise<PublicKey> {
  if (wrappedUsdcMint) {
    return wrappedUsdcMint;
  }

  const [configAddress] = deriveConfigAddress(program.programId);
  const raw = await (program.account as any).protocolConfig.fetch(configAddress);
  return raw.wrappedUsdcMint;
}

async function getMandateBalance(
  connection: Connection,
  mandateWrappedAccount: PublicKey,
): Promise<bigint> {
  const balance = await connection.getTokenAccountBalance(mandateWrappedAccount);
  return BigInt(balance.value.amount);
}

async function getAgentMandateAccount(
  program: Program,
  authority: PublicKey,
  agent: PublicKey,
): Promise<AgentMandate> {
  const [address] = deriveAgentMandateAddress(authority, agent, program.programId);
  const raw = await (program.account as any).agentMandate.fetch(address);
  return deserializeAgentMandate(address, raw);
}

export async function listAgentMandates(
  program: Program,
  authority: PublicKey,
): Promise<AgentMandate[]> {
  const accounts = await (program.account as any).agentMandate.all([
    { memcmp: { offset: 8, bytes: authority.toBase58() } },
  ]);

  return accounts.map((acc: any) =>
    deserializeAgentMandate(acc.publicKey, acc.account),
  );
}

export async function checkAgentBudget(
  program: Program,
  connection: Connection,
  params: CheckAgentBudgetParams,
): Promise<AgentBudgetSummary> {
  const now = resolveNow(params.now);
  const mandate = await getAgentMandateAccount(
    program,
    params.authority,
    params.agent,
  );
  const wrappedUsdcMint = await resolveWrappedUsdcMint(
    program,
    params.wrappedUsdcMint,
  );
  const mandateWrappedAccount = deriveAgentMandateWrappedAta(
    mandate.address,
    wrappedUsdcMint,
  );
  const mandateBalance = await getMandateBalance(connection, mandateWrappedAccount);
  const dailyWindow = computeResetWindow(
    mandate.dailySpent,
    mandate.dailyLastReset,
    now,
  );
  const serviceLimit =
    params.service == null
      ? null
      : mandate.services.find((entry) => entry.service.equals(params.service!)) ??
        null;
  const serviceWindow =
    serviceLimit == null
      ? null
      : computeResetWindow(serviceLimit.dailySpent, serviceLimit.lastReset, now);

  return {
    mandate,
    status: mandate.status,
    mandateBalance,
    globalRemaining: clampRemaining(mandate.dailyLimit, dailyWindow.spent),
    serviceRemaining:
      serviceLimit == null
        ? null
        : clampRemaining(serviceLimit.dailyLimit, serviceWindow!.spent),
    dailyResetAt: dailyWindow.nextResetAt,
    serviceResetAt: serviceWindow?.nextResetAt ?? null,
    serviceAuthorized: serviceLimit != null,
    funded: mandateBalance > 0n,
  };
}

export async function verifyAgentMandate(
  program: Program,
  connection: Connection,
  params: VerifyAgentMandateParams,
): Promise<AgentMandateVerificationResult> {
  const budget = await checkAgentBudget(program, connection, params);
  const [configAddress] = deriveConfigAddress(program.programId);
  const protocolConfig = await (program.account as any).protocolConfig.fetch(
    configAddress,
  );
  const reasons: string[] = [];

  if (budget.status !== "active") {
    reasons.push(`Mandate is ${budget.status}`);
  }
  if (protocolConfig.paused) {
    reasons.push("Protocol is paused");
  }
  if (params.service && !budget.serviceAuthorized) {
    reasons.push("Service is not authorized for this mandate");
  }
  if (!budget.funded) {
    reasons.push("Mandate has no wrapped balance");
  }

  return {
    ...budget,
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Fetches active subscriptions (mandates) filtered by subscriber or merchant.
 *
 * Uses Anchor's `program.account.velaMandate.all()` with memcmp filters:
 * - subscriber: offset 8 (8-byte discriminator), 32-byte pubkey
 * - merchant:   offset 72 (8 + 32 subscriber + 32 plan), 32-byte pubkey
 */
export async function getActiveSubscriptions(
  program: Program,
  filter: { subscriber?: PublicKey; merchant?: PublicKey },
): Promise<VelaMandate[]> {
  const filters: Array<{ memcmp: { offset: number; bytes: string } }> = [];

  if (filter.subscriber) {
    filters.push({
      memcmp: { offset: 8, bytes: filter.subscriber.toBase58() },
    });
  }

  if (filter.merchant) {
    filters.push({
      memcmp: { offset: 72, bytes: filter.merchant.toBase58() },
    });
  }

  const accounts = await (program.account as any).velaMandate.all(filters);

  return accounts.map((acc: any) =>
    deserializeMandate(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a single VelaPlan by its address.
 */
export async function getPlanDetails(
  program: Program,
  planAddress: PublicKey,
): Promise<VelaPlan> {
  const raw = await (program.account as any).velaPlan.fetch(planAddress);
  return deserializePlan(planAddress, raw);
}

/**
 * Fetches all plans owned by a merchant.
 *
 * Uses memcmp filter at offset 8 (8-byte discriminator) for the merchant pubkey field.
 */
export async function getMerchantPlans(
  program: Program,
  merchant: PublicKey,
): Promise<VelaPlan[]> {
  const accounts = await (program.account as any).velaPlan.all([
    { memcmp: { offset: 8, bytes: merchant.toBase58() } },
  ]);

  return accounts.map((acc: any) =>
    deserializePlan(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a merchant's state account.
 */
export async function getMerchantState(
  program: Program,
  merchant: PublicKey,
): Promise<MerchantState> {
  const [merchantStateAddress] = deriveMerchantStateAddress(
    merchant,
    program.programId,
  );
  const raw = await (program.account as any).merchantState.fetch(
    merchantStateAddress,
  );
  return deserializeMerchantState(merchantStateAddress, raw);
}
