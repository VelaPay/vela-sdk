import { sha256 } from "@noble/hashes/sha2.js";
import { type Connection, PublicKey } from "@solana/web3.js";
import type {
  AgentMandate,
  AgentMandateStatus,
  AgentServiceLimit,
  BillingRail,
  BillingType,
  MandateStatus,
  MerchantState,
  PlanStatus,
  ProtocolConfig,
  TokenConfig,
  VelaMandate,
  VelaPlan,
  VelaUsagePlan,
} from "../types";
import type { StreamMandate, StreamStatus } from "../types/stream-mandate";
import { WrongAccountTypeError } from "../errors/stream-errors";

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

function toBigInt(raw: { toString(): string } | bigint | number): bigint {
  return BigInt(raw.toString());
}

function toReserved(raw: number[] | Uint8Array | undefined): number[] | undefined {
  if (raw == null) {
    return undefined;
  }
  return Array.from(raw);
}

function mapBillingRail(raw: any): BillingRail {
  if (!raw || raw.transferHook !== undefined) return "transferHook";
  if (raw.tokenDelegate !== undefined) return "tokenDelegate";
  throw new Error(`Unknown BillingRail variant: ${JSON.stringify(raw)}`);
}

function mapStreamStatus(raw: number): StreamStatus {
  switch (raw) {
    case 0:
      return "active";
    case 1:
      return "paused";
    case 2:
      return "cancelled";
    default:
      throw new Error(`Unknown StreamStatus variant: ${raw}`);
  }
}

function readOptionU64(
  data: Buffer,
  offset: number,
): { value: bigint | null; nextOffset: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, nextOffset: offset + 9 };
  }
  return {
    value: data.readBigUInt64LE(offset + 1),
    nextOffset: offset + 9,
  };
}

function readOptionI64(
  data: Buffer,
  offset: number,
): { value: bigint | null; nextOffset: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, nextOffset: offset + 9 };
  }
  return {
    value: data.readBigInt64LE(offset + 1),
    nextOffset: offset + 9,
  };
}

function discriminatorHex(data: Buffer | Uint8Array): string {
  return Buffer.from(data).toString("hex");
}

export const STREAM_MANDATE_DISCRIMINATOR = Buffer.from(
  sha256(new TextEncoder().encode("account:StreamMandate")).slice(0, 8),
);

export function deserializeStreamMandate(
  address: PublicKey,
  raw: Buffer | Uint8Array,
): StreamMandate {
  const data = Buffer.from(raw);
  if (data.length < 225) {
    throw new Error(`StreamMandate account ${address.toBase58()} is truncated`);
  }
  const gotDiscriminator = data.subarray(0, 8);
  if (!Buffer.from(STREAM_MANDATE_DISCRIMINATOR).equals(gotDiscriminator)) {
    throw new WrongAccountTypeError(
      address,
      "StreamMandate",
      discriminatorHex(gotDiscriminator),
    );
  }

  const version = data.readUInt8(8);
  switch (version) {
    case 1:
      break;
    case 2:
      throw new Error("StreamMandate version 2 deserializer not yet implemented");
    default:
      throw new Error(`Unsupported StreamMandate version: ${version}`);
  }

  let offset = 9;
  const subscriber = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const merchant = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const ratePerSecond = data.readBigUInt64LE(offset);
  offset += 8;
  const authorizedMaxRate = data.readBigUInt64LE(offset);
  offset += 8;
  const lastSettledTs = data.readBigInt64LE(offset);
  offset += 8;
  const totalStreamed = data.readBigUInt64LE(offset);
  offset += 8;
  const maxStreamed = readOptionU64(data, offset);
  offset = maxStreamed.nextOffset;
  const pausedAt = readOptionI64(data, offset);
  offset = pausedAt.nextOffset;
  const minSettleInterval = data.readUInt32LE(offset);
  offset += 4;
  const status = mapStreamStatus(data.readUInt8(offset));
  offset += 1;
  const mandateIndex = data.readBigUInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    address,
    version,
    subscriber,
    merchant,
    mint,
    ratePerSecond,
    authorizedMaxRate,
    lastSettledTs,
    totalStreamed,
    maxStreamed: maxStreamed.value,
    pausedAt: pausedAt.value,
    minSettleInterval,
    status,
    mandateIndex,
    bump,
  };
}

export async function fetchStreamMandate(
  connection: Connection,
  address: PublicKey,
): Promise<StreamMandate> {
  const info = await connection.getAccountInfo(address);
  if (!info) {
    throw new Error(`StreamMandate account not found: ${address.toBase58()}`);
  }

  const data = Buffer.from(info.data);
  const gotDiscriminator = data.subarray(0, Math.min(8, data.length));
  if (
    data.length < 8 ||
    !Buffer.from(STREAM_MANDATE_DISCRIMINATOR).equals(gotDiscriminator)
  ) {
    throw new WrongAccountTypeError(
      address,
      "StreamMandate",
      discriminatorHex(gotDiscriminator),
    );
  }

  return deserializeStreamMandate(address, data);
}

/**
 * Converts an Anchor-deserialized VelaMandate account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMandate(address: PublicKey, raw: any): VelaMandate {
  const version = Number(raw.version ?? 0);
  return {
    address,
    subscriber: raw.subscriber,
    plan: version === 0 ? raw.plan : (raw.plan ?? undefined),
    merchant: raw.merchant,
    mandateIndex: version >= 1 ? toBigInt(raw.mandateIndex ?? 0) : undefined,
    amount: toBigInt(raw.amount),
    frequency: toBigInt(raw.frequency),
    startDate: toBigInt(raw.startDate),
    expiry: toBigInt(raw.expiry),
    maxPulls: toBigInt(raw.maxPulls),
    pullsExecuted: toBigInt(raw.pullsExecuted),
    nextPaymentDue: toBigInt(raw.nextPaymentDue),
    status: mapMandateStatus(raw.status),
    bump: raw.bump,
    billingType: mapBillingType(raw.billingType),
    version,
    _reserved: toReserved(raw._reserved),
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
    version: raw.version,
    _reserved: toReserved(raw._reserved),
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
    version: raw.version,
    _reserved: toReserved(raw._reserved),
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
    version: raw.version,
    _reserved: toReserved(raw._reserved),
  };
}

/**
 * Converts an Anchor-deserialized MerchantState account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMerchantState(
  address: PublicKey,
  raw: any,
): MerchantState {
  const version = raw.version;
  return {
    address,
    merchant: raw.merchant,
    planCount: toBigInt(raw.planCount),
    bump: raw.bump,
    credentialMint: version != null ? raw.credentialMint : undefined,
    mandateCounter: version != null ? toBigInt(raw.mandateCounter ?? 0) : 0n,
    version,
    _reserved: toReserved(raw._reserved),
  };
}

export function deserializeProtocolConfig(raw: any): ProtocolConfig {
  return {
    admin: raw.admin,
    wrappedUsdcMint: raw.wrappedUsdcMint,
    wrappingVault: raw.wrappingVault,
    transferHookProgramId: raw.transferHookProgramId,
    paused: raw.paused,
    version: Number(raw.version ?? 0),
  };
}

export function deserializeTokenConfig(raw: any): TokenConfig {
  return {
    mint: raw.mint,
    tokenProgram: raw.tokenProgram,
    billingRail: mapBillingRail(raw.billingRail),
    decimals: Number(raw.decimals ?? 0),
    enabled: Boolean(raw.enabled),
    oracleReference: raw.oracleReference,
  };
}
