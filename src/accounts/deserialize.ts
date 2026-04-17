import { type Connection, PublicKey } from "@solana/web3.js";
import {
  accountDiscriminator,
  asBytes,
  type BufferLike,
  hexFromBytes,
  readI64LE,
  readU32LE,
  readU64LE,
  readU8,
  sliceEquals,
  utf8FromFixedBytes,
} from "../browser/bytes";
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
  TokenConfigAccount,
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
  return utf8FromFixedBytes(raw);
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

function mapBillingRailByte(raw: number): BillingRail {
  switch (raw) {
    case 0:
      return "transferHook";
    case 1:
      return "tokenDelegate";
    default:
      throw new Error(`Unknown BillingRail variant: ${raw}`);
  }
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
  data: BufferLike,
  offset: number,
): { value: bigint | null; nextOffset: number } {
  const tag = readU8(data, offset);
  if (tag === 0) {
    return { value: null, nextOffset: offset + 9 };
  }
  return {
    value: readU64LE(data, offset + 1),
    nextOffset: offset + 9,
  };
}

function readOptionI64(
  data: BufferLike,
  offset: number,
): { value: bigint | null; nextOffset: number } {
  const tag = readU8(data, offset);
  if (tag === 0) {
    return { value: null, nextOffset: offset + 9 };
  }
  return {
    value: readI64LE(data, offset + 1),
    nextOffset: offset + 9,
  };
}

function discriminatorHex(data: BufferLike): string {
  return hexFromBytes(data);
}

export const STREAM_MANDATE_DISCRIMINATOR = accountDiscriminator("StreamMandate");
export const VELA_MANDATE_DISCRIMINATOR = accountDiscriminator("VelaMandate");
export const TOKEN_CONFIG_DISCRIMINATOR = accountDiscriminator("TokenConfig");

export function deserializeStreamMandate(
  address: PublicKey,
  raw: BufferLike,
): StreamMandate {
  const data = asBytes(raw);
  if (data.length < 225) {
    throw new Error(`StreamMandate account ${address.toBase58()} is truncated`);
  }
  const gotDiscriminator = data.subarray(0, 8);
  if (!sliceEquals(gotDiscriminator, STREAM_MANDATE_DISCRIMINATOR)) {
    throw new WrongAccountTypeError(
      address,
      "StreamMandate",
      discriminatorHex(gotDiscriminator),
    );
  }

  const version = readU8(data, 8);
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported StreamMandate version: ${version}`);
  }

  let offset = 9;
  const subscriber = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const merchant = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const ratePerSecond = readU64LE(data, offset);
  offset += 8;
  const authorizedMaxRate = readU64LE(data, offset);
  offset += 8;
  const lastSettledTs = readI64LE(data, offset);
  offset += 8;
  const totalStreamed = readU64LE(data, offset);
  offset += 8;
  const maxStreamed = readOptionU64(data, offset);
  offset = maxStreamed.nextOffset;
  const pausedAt = readOptionI64(data, offset);
  offset = pausedAt.nextOffset;
  const minSettleInterval = readU32LE(data, offset);
  offset += 4;
  const status = mapStreamStatus(readU8(data, offset));
  offset += 1;
  const mandateIndex = readU64LE(data, offset);
  offset += 8;
  const bump = readU8(data, offset);
  offset += 1;

  let pendingNewRatePerSecond = 0n;
  let pendingNewAuthorizedMaxRate = 0n;
  let pendingEffectiveAt = 0n;
  let pendingChangeType = 0;
  let pendingNonceShort: number[] = [];
  if (version >= 2) {
    pendingNewRatePerSecond = readU64LE(data, offset);
    offset += 8;
    pendingNewAuthorizedMaxRate = readU64LE(data, offset);
    offset += 8;
    pendingEffectiveAt = readI64LE(data, offset);
    offset += 8;
    pendingChangeType = readU8(data, offset);
    offset += 1;
    pendingNonceShort = Array.from(data.subarray(offset, offset + 8));
  }

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
    pendingNewRatePerSecond,
    pendingNewAuthorizedMaxRate,
    pendingEffectiveAt,
    pendingChangeType,
    pendingNonceShort,
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

  const data = asBytes(info.data);
  const gotDiscriminator = data.subarray(0, Math.min(8, data.length));
  if (data.length < 8 || !sliceEquals(gotDiscriminator, STREAM_MANDATE_DISCRIMINATOR)) {
    throw new WrongAccountTypeError(
      address,
      "StreamMandate",
      discriminatorHex(gotDiscriminator),
    );
  }

  return deserializeStreamMandate(address, data);
}

function mapMandateStatusByte(raw: number): MandateStatus {
  switch (raw) {
    case 0:
      return "active";
    case 1:
      return "cancelled";
    case 2:
      return "expired";
    default:
      throw new Error(`Unknown MandateStatus discriminator: ${raw}`);
  }
}

function mapBillingTypeByte(raw: number): BillingType {
  switch (raw) {
    case 0:
      return "flat";
    case 1:
      return "usage";
    default:
      throw new Error(`Unknown BillingType discriminator: ${raw}`);
  }
}

export function deserializeMandateAccount(
  address: PublicKey,
  raw: BufferLike,
): VelaMandate {
  const data = asBytes(raw);
  if (data.length < 268) {
    throw new Error(`VelaMandate account ${address.toBase58()} is truncated`);
  }
  const gotDiscriminator = data.subarray(0, 8);
  if (!sliceEquals(gotDiscriminator, VELA_MANDATE_DISCRIMINATOR)) {
    throw new WrongAccountTypeError(
      address,
      "VelaMandate",
      discriminatorHex(gotDiscriminator),
    );
  }

  let offset = 8;
  const subscriber = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const plan = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const merchant = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = readU64LE(data, offset);
  offset += 8;
  const frequency = readU64LE(data, offset);
  offset += 8;
  const startDate = readI64LE(data, offset);
  offset += 8;
  const expiry = readI64LE(data, offset);
  offset += 8;
  const maxPulls = readU64LE(data, offset);
  offset += 8;
  const pullsExecuted = readU64LE(data, offset);
  offset += 8;
  const nextPaymentDue = readI64LE(data, offset);
  offset += 8;
  const lastPullAt = readI64LE(data, offset);
  offset += 8;
  const lastBillingRecordedPull = readU64LE(data, offset);
  offset += 8;
  const validationRequestNonce = readU64LE(data, offset);
  offset += 8;
  const billingRequestNonce = readU64LE(data, offset);
  offset += 8;
  const status = mapMandateStatusByte(readU8(data, offset));
  offset += 1;
  const bump = readU8(data, offset);
  offset += 1;
  const billingType = mapBillingTypeByte(readU8(data, offset));
  offset += 1;
  const mandateIndex = readU64LE(data, offset);
  offset += 8;
  const version = readU8(data, offset);
  offset += 1;
  const creditBalance = readU64LE(data, offset);
  offset += 8;
  const pendingPlan = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const pendingEffectiveAt = readI64LE(data, offset);
  offset += 8;
  const pendingChangeType = readU8(data, offset);
  offset += 1;
  const pendingNonceShort = Array.from(data.subarray(offset, offset + 8));
  offset += 8;
  const reserved = Array.from(data.subarray(offset, offset + 7));

  return {
    address,
    subscriber,
    plan: plan.equals(PublicKey.default) ? undefined : plan,
    merchant,
    mandateIndex,
    amount,
    frequency,
    startDate,
    expiry,
    maxPulls,
    pullsExecuted,
    nextPaymentDue,
    status,
    bump,
    billingType,
    version,
    lastPullAt,
    lastBillingRecordedPull,
    validationRequestNonce,
    billingRequestNonce,
    creditBalance,
    pendingNewPlan: pendingPlan.equals(PublicKey.default)
      ? undefined
      : pendingPlan,
    pendingEffectiveAt,
    pendingChangeType,
    pendingNonceShort,
    _reserved: reserved,
  };
}

export async function fetchMandate(
  connection: Connection,
  address: PublicKey,
): Promise<VelaMandate> {
  const info = await connection.getAccountInfo(address);
  if (!info) {
    throw new Error(`VelaMandate account not found: ${address.toBase58()}`);
  }
  return deserializeMandateAccount(address, info.data);
}

/**
 * Converts an Anchor-deserialized VelaMandate account (BN fields) to SDK type (bigint fields).
 */
export function deserializeMandate(address: PublicKey, raw: any): VelaMandate {
  const version = Number(raw.version ?? 0);
  const pendingNewPlan =
    raw.pendingNewPlan &&
    raw.pendingNewPlan instanceof PublicKey &&
    !raw.pendingNewPlan.equals(PublicKey.default)
      ? raw.pendingNewPlan
      : undefined;
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
    lastPullAt:
      raw.lastPullAt !== undefined ? toBigInt(raw.lastPullAt) : undefined,
    lastBillingRecordedPull:
      raw.lastBillingRecordedPull !== undefined
        ? toBigInt(raw.lastBillingRecordedPull)
        : undefined,
    validationRequestNonce:
      raw.validationRequestNonce !== undefined
        ? toBigInt(raw.validationRequestNonce)
        : undefined,
    billingRequestNonce:
      raw.billingRequestNonce !== undefined
        ? toBigInt(raw.billingRequestNonce)
        : undefined,
    creditBalance:
      raw.creditBalance !== undefined ? toBigInt(raw.creditBalance) : undefined,
    pendingNewPlan,
    pendingEffectiveAt:
      raw.pendingEffectiveAt !== undefined
        ? toBigInt(raw.pendingEffectiveAt)
        : undefined,
    pendingChangeType:
      raw.pendingChangeType !== undefined
        ? Number(raw.pendingChangeType)
        : undefined,
    pendingNonceShort: toReserved(raw.pendingNonceShort),
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

export function deserializeTokenConfig(raw: any): TokenConfigAccount {
  return {
    address: raw.address,
    mint: raw.mint,
    tokenProgram: raw.tokenProgram,
    billingRail: mapBillingRail(raw.billingRail),
    decimals: Number(raw.decimals ?? 0),
    enabled: Boolean(raw.enabled),
    oracleReference: raw.oracleReference,
    admin: raw.admin,
    createdAt:
      raw.createdAt !== undefined ? toBigInt(raw.createdAt) : undefined,
    bump: raw.bump !== undefined ? Number(raw.bump) : undefined,
    version: raw.version !== undefined ? Number(raw.version) : undefined,
    _reserved: toReserved(raw._reserved),
  };
}

export function deserializeTokenConfigAccount(
  address: PublicKey,
  raw: BufferLike,
): TokenConfigAccount {
  const data = asBytes(raw);
  if (data.length < 213) {
    throw new Error(`TokenConfig account ${address.toBase58()} is truncated`);
  }
  const gotDiscriminator = data.subarray(0, 8);
  if (!sliceEquals(gotDiscriminator, TOKEN_CONFIG_DISCRIMINATOR)) {
    throw new WrongAccountTypeError(
      address,
      "TokenConfig",
      discriminatorHex(gotDiscriminator),
    );
  }

  let offset = 8;
  const mint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const tokenProgram = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const billingRail = mapBillingRailByte(readU8(data, offset));
  offset += 1;
  const decimals = readU8(data, offset);
  offset += 1;
  const enabled = readU8(data, offset) === 1;
  offset += 1;
  const oracleReference = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const admin = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const createdAt = readI64LE(data, offset);
  offset += 8;
  const bump = readU8(data, offset);
  offset += 1;
  const version = readU8(data, offset);
  offset += 1;
  const reserved = Array.from(data.subarray(offset, offset + 64));

  return {
    address,
    mint,
    tokenProgram,
    billingRail,
    decimals,
    enabled,
    oracleReference,
    admin,
    createdAt,
    bump,
    version,
    _reserved: reserved,
  };
}

export async function fetchTokenConfig(
  connection: Connection,
  address: PublicKey,
): Promise<TokenConfigAccount> {
  const info = await connection.getAccountInfo(address);
  if (!info) {
    throw new Error(`TokenConfig account not found: ${address.toBase58()}`);
  }
  return deserializeTokenConfigAccount(address, info.data);
}
