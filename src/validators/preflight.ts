import type { Program } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import {
  checkAgentBudget,
  deserializeMandate,
  deriveConfigAddress,
  deriveMandateAddress,
} from "../accounts";
import { getSubscribablePlan } from "../accounts/subscribable-plan";
import type {
  AgentPullValidationResult,
  CancelValidationResult,
  ValidateAgentPullParams,
  SubscribeValidationResult,
  ValidationResult,
} from "../types";

/**
 * Pre-flight validation for pull payment execution.
 *
 * Reads on-chain mandate state and checks:
 * 1. Mandate status is active
 * 2. Current time >= nextPaymentDue (timing)
 * 3. pullsExecuted < maxPulls (remaining pulls)
 * 4. Not expired (if expiry > 0)
 *
 * Returns validation result without submitting any transaction.
 */
export async function validatePullPayment(
  program: Program,
  _connection: Connection,
  mandateAddress: PublicKey,
): Promise<ValidationResult> {
  const raw = await (program.account as any).velaMandate.fetch(mandateAddress);
  const mandate = deserializeMandate(mandateAddress, raw);
  const reasons: string[] = [];

  // Check status
  if (mandate.status !== "active") {
    reasons.push(`Mandate is ${mandate.status}`);
  }

  // Check timing -- nextPaymentDue is in seconds (unix timestamp)
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (nowSeconds < mandate.nextPaymentDue) {
    const dueDate = new Date(
      Number(mandate.nextPaymentDue) * 1000,
    ).toISOString();
    reasons.push(`Next payment not due until ${dueDate}`);
  }

  // Check pulls remaining
  if (mandate.pullsExecuted >= mandate.maxPulls) {
    reasons.push(`All ${mandate.maxPulls.toString()} pulls exhausted`);
  }

  // Check expiry
  if (mandate.expiry > 0n && nowSeconds > mandate.expiry) {
    reasons.push("Mandate has expired");
  }

  return {
    canPull: reasons.length === 0,
    mandate,
    reasons,
  };
}

/**
 * Pre-flight validation for subscribing to a plan.
 *
 * Checks:
 * 1. Plan status is active
 * 2. Mandate PDA does not already exist (would cause collision)
 */
export async function validateSubscribe(
  program: Program,
  planAddress: PublicKey,
  subscriber: PublicKey,
): Promise<SubscribeValidationResult> {
  const plan = await getSubscribablePlan(program, planAddress);
  const reasons: string[] = [];

  // Check plan is active
  if (plan.status !== "active") {
    reasons.push(`Plan is ${plan.status}`);
  }

  // Check if mandate already exists (PDA collision)
  const [mandateAddress] = deriveMandateAddress(
    subscriber,
    planAddress,
    program.programId,
  );
  try {
    await (program.account as any).velaMandate.fetch(mandateAddress);
    // If fetch succeeds, mandate already exists
    reasons.push("Subscription already exists for this subscriber and plan");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Account does not exist")) {
      throw error;
    }
    // Mandate does not exist -- this is the expected case for a new subscription
  }

  return {
    canSubscribe: reasons.length === 0,
    plan,
    reasons,
  };
}

/**
 * Pre-flight validation for cancelling a subscription.
 *
 * Checks:
 * 1. Mandate status is active
 * 2. Authority matches subscriber (per protocol: only subscriber can cancel)
 */
export async function validateCancel(
  program: Program,
  mandateAddress: PublicKey,
  authority: PublicKey,
): Promise<CancelValidationResult> {
  const raw = await (program.account as any).velaMandate.fetch(mandateAddress);
  const mandate = deserializeMandate(mandateAddress, raw);
  const reasons: string[] = [];

  // Check mandate is active
  if (mandate.status !== "active") {
    reasons.push(`Mandate is ${mandate.status}`);
  }

  // Check authority is the subscriber
  if (!mandate.subscriber.equals(authority)) {
    reasons.push("Only the subscriber can cancel their mandate");
  }

  return {
    canCancel: reasons.length === 0,
    mandate,
    reasons,
  };
}

async function resolveServiceOwner(
  connection: Connection,
  serviceWrappedAccount: PublicKey,
): Promise<PublicKey> {
  if (typeof (connection as any).getParsedAccountInfo === "function") {
    const parsed = await (connection as any).getParsedAccountInfo(
      serviceWrappedAccount,
    );
    const owner =
      parsed?.value?.data?.parsed?.info?.owner ??
      parsed?.value?.data?.parsed?.info?.tokenAuthority;
    if (owner) {
      return new PublicKey(owner);
    }
  }

  const account = await getAccount(
    connection,
    serviceWrappedAccount,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  return account.owner;
}

export async function validateAgentPull(
  program: Program,
  connection: Connection,
  params: ValidateAgentPullParams,
): Promise<AgentPullValidationResult> {
  const service = await resolveServiceOwner(
    connection,
    params.serviceWrappedAccount,
  );
  const budget = await checkAgentBudget(program, connection, {
    authority: params.authority,
    agent: params.agent,
    service,
    wrappedUsdcMint: params.wrappedUsdcMint,
    now: params.now,
  });
  const [configAddress] = deriveConfigAddress(program.programId);
  const protocolConfig = await (program.account as any).protocolConfig.fetch(
    configAddress,
  );
  const amount = BigInt(params.amount);
  const reasons: string[] = [];

  if (budget.status !== "active") {
    reasons.push(`Mandate is ${budget.status}`);
  }
  if (protocolConfig.paused) {
    reasons.push("Protocol is paused");
  }
  if (!budget.serviceAuthorized) {
    reasons.push("Service is not authorized for this mandate");
  }

  const serviceLimit = budget.mandate.services.find((entry) =>
    entry.service.equals(service),
  );
  const serviceSpent =
    serviceLimit == null
      ? 0n
      : serviceLimit.dailyLimit - (budget.serviceRemaining ?? 0n);
  const nextServiceSpent = serviceSpent + amount;
  if (
    serviceLimit != null &&
    nextServiceSpent > serviceLimit.dailyLimit
  ) {
    reasons.push("Service daily limit would be exceeded");
  }

  const currentDailySpent =
    budget.mandate.dailyLimit - budget.globalRemaining;
  const nextDailySpent = currentDailySpent + amount;
  if (nextDailySpent > budget.mandate.dailyLimit) {
    reasons.push("Daily limit would be exceeded");
  }

  const nextTotalSpent = budget.mandate.totalSpent + amount;
  if (nextTotalSpent > budget.mandate.lifetimeCap) {
    reasons.push("Lifetime cap would be exceeded");
  }
  if (amount < budget.mandate.minPullAmount) {
    reasons.push("Pull amount is below the mandate minimum");
  }
  if (budget.mandate.lastPullAt > 0n && budget.mandate.minPullInterval > 0n) {
    const now =
      params.now == null ? BigInt(Math.floor(Date.now() / 1000)) : BigInt(params.now);
    const elapsed = now - budget.mandate.lastPullAt;
    if (elapsed < budget.mandate.minPullInterval) {
      reasons.push("Pull cooldown is still active");
    }
  }
  if (budget.mandateBalance < amount) {
    reasons.push("Mandate balance is insufficient");
  }

  return {
    ...budget,
    globalRemaining:
      nextDailySpent >= budget.mandate.dailyLimit
        ? 0n
        : budget.mandate.dailyLimit - nextDailySpent,
    serviceRemaining:
      serviceLimit == null
        ? null
        : nextServiceSpent >= serviceLimit.dailyLimit
          ? 0n
          : serviceLimit.dailyLimit - nextServiceSpent,
    funded: budget.mandateBalance >= amount,
    canPull: reasons.length === 0,
    reasons,
  };
}
