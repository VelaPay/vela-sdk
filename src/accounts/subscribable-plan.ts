import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import {
  deserializePlan,
  deserializeUsagePlan,
} from "./deserialize";
import type {
  BillingType,
  VelaUsagePlan,
  SubscribablePlan,
} from "../types";

function isAccountMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Account does not exist");
}

function isPlanTypeMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Account did not deserialize") ||
    message.includes("Invalid account discriminator") ||
    message.includes("AccountDiscriminatorMismatch")
  );
}

function shouldTryUsageFallback(error: unknown): boolean {
  return isAccountMissing(error) || isPlanTypeMismatch(error);
}

function planAccountError(planAddress: PublicKey): Error {
  return new Error(
    `Unsupported or missing plan account at ${planAddress.toBase58()}`,
  );
}

export async function getSubscribablePlan(
  program: Program,
  planAddress: PublicKey,
): Promise<SubscribablePlan> {
  try {
    const raw = await (program.account as any).velaPlan.fetch(planAddress);
    return deserializePlan(planAddress, raw);
  } catch (flatError) {
    if (!shouldTryUsageFallback(flatError)) {
      throw flatError instanceof Error ? flatError : planAccountError(planAddress);
    }

    try {
      const raw = await (program.account as any).usagePlan.fetch(planAddress);
      return deserializeUsagePlan(planAddress, raw);
    } catch (usageError) {
      if (isAccountMissing(flatError) && isAccountMissing(usageError)) {
        throw planAccountError(planAddress);
      }
      throw usageError instanceof Error ? usageError : planAccountError(planAddress);
    }
  }
}

export interface ResolvedPlanContext {
  plan: SubscribablePlan;
  billingType: BillingType;
  credentialMint: PublicKey;
  merchant: PublicKey;
  wrapAmount: bigint;
  frequency: bigint;
}

export function resolvePlanContext(plan: SubscribablePlan): ResolvedPlanContext {
  if (plan.billingType === "usage") {
    return {
      plan,
      billingType: "usage",
      credentialMint: plan.credentialMint,
      merchant: plan.merchant,
      wrapAmount: plan.maxChargePerPeriod,
      frequency: plan.settlementFrequency,
    };
  }

  return {
    plan,
    billingType: "flat",
    credentialMint: plan.credentialMint,
    merchant: plan.merchant,
    wrapAmount: plan.amount,
    frequency: plan.frequency,
  };
}

export function isUsagePlan(
  plan: SubscribablePlan,
): plan is VelaUsagePlan {
  return plan.billingType === "usage";
}
