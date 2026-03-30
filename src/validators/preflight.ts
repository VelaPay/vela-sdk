import type { Program } from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import { deserializeMandate, deserializePlan } from "../accounts/deserialize";
import { deriveMandateAddress } from "../accounts/pda";
import type {
  ValidationResult,
  SubscribeValidationResult,
  CancelValidationResult,
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
    const dueDate = new Date(Number(mandate.nextPaymentDue) * 1000).toISOString();
    reasons.push(`Next payment not due until ${dueDate}`);
  }

  // Check pulls remaining
  if (mandate.maxPulls > 0n && mandate.pullsExecuted >= mandate.maxPulls) {
    reasons.push(
      `All ${mandate.maxPulls.toString()} pulls exhausted`,
    );
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
  const raw = await (program.account as any).velaPlan.fetch(planAddress);
  const plan = deserializePlan(planAddress, raw);
  const reasons: string[] = [];

  // Check plan is active
  if (plan.status !== "active") {
    reasons.push(`Plan is ${plan.status}`);
  }

  // Check if mandate already exists (PDA collision)
  const [mandateAddress] = deriveMandateAddress(subscriber, planAddress, program.programId);
  try {
    await (program.account as any).velaMandate.fetch(mandateAddress);
    // If fetch succeeds, mandate already exists
    reasons.push("Subscription already exists for this subscriber and plan");
  } catch {
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
