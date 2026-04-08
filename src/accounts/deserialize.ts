import type { PublicKey } from "@solana/web3.js";
import type {
  AgentMandate,
  AgentMandateStatus,
  AgentServiceLimit,
  BillingType,
  MandateStatus,
  MerchantState,
  PlanStatus,
  VelaMandate,
  VelaPlan,
  VelaUsagePlan,
} from "../types";

/**
 * Maps an Anchor-deserialized MandateStatus enum variant to SDK string literal.
 * Anchor represents Rust enums as objects with a single key: { active: {} } | { cancelled: {} } | { expired: {} }
 */
function mapMandateStatus(raw: any): MandateStatus {
  if (raw.active !== undefined) return "active";
  if (raw.cancelled !== undefined) return "cancelled";
  if (raw.expired !== undefined) return "expired";
  throw new Error(`Unknown MandateStatus variant: ${JSON.stringify(raw)}`);
}

/**
 * Maps an Anchor-deserialized PlanStatus enum variant to SDK string literal.
 */
function mapPlanStatus(raw: any): PlanStatus {
  if (raw.active !== undefined) return "active";
  if (raw.inactive !== undefined) return "inactive";
  throw new Error(`Unknown PlanStatus variant: ${JSON.stringify(raw)}`);
}

function mapBillingType(raw: any): BillingType {
  if (!raw || raw.flat !== undefined) return "flat";
  if (raw.usage !== undefined) return "usage";
  throw new Error(`Unknown BillingType variant: ${JSON.stringify(raw)}`);
}

function mapAgentMandateStatus(raw: any): AgentMandateStatus {
  if (raw.active !== undefined) return "active";
  if (raw.paused !== undefined) return "paused";
  if (raw.revoked !== undefined) return "revoked";
  throw new Error(`Unknown AgentMandateStatus variant: ${JSON.stringify(raw)}`);
}

function deserializeAgentServiceLimit(raw: any): AgentServiceLimit {
  return {
    service: raw.service,
    dailyLimit: BigInt(raw.dailyLimit.toString()),
    dailySpent: BigInt(raw.dailySpent.toString()),
    lastReset: BigInt(raw.lastReset.toString()),
  };
}

function decodeUnitName(raw: number[] | Uint8Array): string {
  const bytes = Uint8Array.from(raw);
  const terminator = bytes.indexOf(0);
  const slice = terminator >= 0 ? bytes.subarray(0, terminator) : bytes;
  return Buffer.from(slice).toString("utf-8");
}

/**
 * Converts an Anchor-deserialized VelaMandate account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMandate(address: PublicKey, raw: any): VelaMandate {
  return {
    address,
    subscriber: raw.subscriber,
    plan: raw.plan,
    merchant: raw.merchant,
    amount: BigInt(raw.amount.toString()),
    frequency: BigInt(raw.frequency.toString()),
    startDate: BigInt(raw.startDate.toString()),
    expiry: BigInt(raw.expiry.toString()),
    maxPulls: BigInt(raw.maxPulls.toString()),
    pullsExecuted: BigInt(raw.pullsExecuted.toString()),
    nextPaymentDue: BigInt(raw.nextPaymentDue.toString()),
    status: mapMandateStatus(raw.status),
    bump: raw.bump,
    billingType: mapBillingType(raw.billingType),
  };
}

/**
 * Converts an Anchor-deserialized AgentMandate account (BN fields) to SDK type (bigint fields).
 */
export function deserializeAgentMandate(
  address: PublicKey,
  raw: any,
): AgentMandate {
  return {
    address,
    authority: raw.authority,
    agent: raw.agent,
    dailyLimit: BigInt(raw.dailyLimit.toString()),
    dailySpent: BigInt(raw.dailySpent.toString()),
    dailyLastReset: BigInt(raw.dailyLastReset.toString()),
    lifetimeCap: BigInt(raw.lifetimeCap.toString()),
    totalSpent: BigInt(raw.totalSpent.toString()),
    minPullAmount: BigInt(raw.minPullAmount.toString()),
    minPullInterval: BigInt(raw.minPullInterval.toString()),
    lastPullAt: BigInt(raw.lastPullAt.toString()),
    status: mapAgentMandateStatus(raw.status),
    services: (raw.services ?? []).map(deserializeAgentServiceLimit),
    bump: raw.bump,
  };
}

/**
 * Converts an Anchor-deserialized VelaPlan account (BN fields) to SDK type (bigint fields).
 */
export function deserializePlan(address: PublicKey, raw: any): VelaPlan {
  return {
    billingType: "flat",
    address,
    merchant: raw.merchant,
    planId: BigInt(raw.planId.toString()),
    amount: BigInt(raw.amount.toString()),
    frequency: BigInt(raw.frequency.toString()),
    trialPeriod: BigInt(raw.trialPeriod.toString()),
    maxPulls: BigInt(raw.maxPulls.toString()),
    status: mapPlanStatus(raw.status),
    credentialMint: raw.credentialMint,
    bump: raw.bump,
  };
}

/**
 * Converts an Anchor-deserialized UsagePlan account (BN fields) to SDK type (bigint fields).
 */
export function deserializeUsagePlan(
  address: PublicKey,
  raw: any,
): VelaUsagePlan {
  const tierCount = Number(raw.tierCount ?? 0);
  const tiers = (raw.tiers ?? [])
    .slice(0, tierCount)
    .map((tier: any) => ({
      upTo: BigInt(tier.upTo.toString()),
      ratePerUnit: BigInt(tier.ratePerUnit.toString()),
    }));

  return {
    billingType: "usage",
    address,
    merchant: raw.merchant,
    planId: BigInt(raw.planId.toString()),
    unitName: decodeUnitName(raw.unitName),
    tiers,
    tierCount,
    maxChargePerPeriod: BigInt(raw.maxChargePerPeriod.toString()),
    settlementFrequency: BigInt(raw.settlementFrequency.toString()),
    status: mapPlanStatus(raw.status),
    credentialMint: raw.credentialMint,
    bump: raw.bump,
  };
}

/**
 * Converts an Anchor-deserialized MerchantState account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMerchantState(
  address: PublicKey,
  raw: any,
): MerchantState {
  return {
    address,
    merchant: raw.merchant,
    planCount: BigInt(raw.planCount.toString()),
    bump: raw.bump,
  };
}
