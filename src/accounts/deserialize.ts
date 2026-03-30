import type { PublicKey } from "@solana/web3.js";
import type {
  VelaMandate,
  VelaPlan,
  MerchantState,
  MandateStatus,
  PlanStatus,
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
  };
}

/**
 * Converts an Anchor-deserialized VelaPlan account (BN fields) to SDK type (bigint fields).
 */
export function deserializePlan(address: PublicKey, raw: any): VelaPlan {
  return {
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
 * Converts an Anchor-deserialized MerchantState account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMerchantState(address: PublicKey, raw: any): MerchantState {
  return {
    address,
    merchant: raw.merchant,
    planCount: BigInt(raw.planCount.toString()),
    bump: raw.bump,
  };
}
