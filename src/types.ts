import type BN from "bn.js";
import type { Commitment, Connection, PublicKey } from "@solana/web3.js";

export interface VelaClientConfig {
  connection: Connection;
  wallet: VelaWallet;
  heliusApiKey?: string;
  heliusCluster?: string;
  agentWebhook?: AgentWebhookConfig;
  onAgentEvent?: (event: AgentWebhookEvent) => void | Promise<void>;
  commitment?: Commitment;
  programId?: PublicKey;
  keeperEndpoint?: string;
  keeperAuthToken?: string;
}

export interface VelaWallet {
  publicKey: PublicKey;
  signTransaction: <T extends { serialize(): Buffer }>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends { serialize(): Buffer }>(
    txs: T[],
  ) => Promise<T[]>;
}

export type MandateStatus = "active" | "cancelled" | "expired";
export type PlanStatus = "active" | "inactive";
export type AgentMandateStatus = "active" | "paused" | "revoked";

export interface AgentServiceLimit {
  service: PublicKey;
  dailyLimit: bigint;
  dailySpent: bigint;
  lastReset: bigint;
}

export interface AgentServiceLimitInput {
  service: PublicKey;
  dailyLimit: bigint | number;
}

export interface AgentMandate {
  address: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailyLimit: bigint;
  dailySpent: bigint;
  dailyLastReset: bigint;
  lifetimeCap: bigint;
  totalSpent: bigint;
  minPullAmount: bigint;
  minPullInterval: bigint;
  lastPullAt: bigint;
  status: AgentMandateStatus;
  services: AgentServiceLimit[];
  bump: number;
}

export interface VelaMandate {
  address: PublicKey;
  subscriber: PublicKey;
  plan: PublicKey;
  merchant: PublicKey;
  amount: bigint;
  frequency: bigint;
  startDate: bigint;
  expiry: bigint;
  maxPulls: bigint;
  pullsExecuted: bigint;
  nextPaymentDue: bigint;
  status: MandateStatus;
  bump: number;
  billingType: BillingType;
}

export interface VelaPlan {
  billingType: "flat";
  address: PublicKey;
  merchant: PublicKey;
  planId: bigint;
  amount: bigint;
  frequency: bigint;
  trialPeriod: bigint;
  maxPulls: bigint;
  status: PlanStatus;
  credentialMint: PublicKey;
  bump: number;
}

export interface VelaUsagePlan {
  billingType: "usage";
  address: PublicKey;
  merchant: PublicKey;
  planId: bigint;
  unitName: string;
  tiers: Array<{ upTo: bigint; ratePerUnit: bigint }>;
  tierCount: number;
  maxChargePerPeriod: bigint;
  settlementFrequency: bigint;
  status: PlanStatus;
  credentialMint: PublicKey;
  bump: number;
}

export type SubscribablePlan = VelaPlan | VelaUsagePlan;

export interface MerchantState {
  address: PublicKey;
  merchant: PublicKey;
  planCount: bigint;
  bump: number;
}

export interface VelaCreatePlanParams {
  amount: bigint | number;
  frequency: bigint | number;
  trialPeriod?: bigint | number;
  maxPulls: bigint | number;
}

export interface VelaSubscribeParams {
  planAddress: PublicKey;
  merchantAddress: PublicKey;
  /** @deprecated No longer used for delegate approval (D-12). Kept for backward compatibility. */
  usdcMintAddress?: PublicKey;
}

export interface VelaPullParams {
  /** Optional explicit mandate PDA. If omitted, it is derived from subscriberAddress + planAddress. */
  mandateAddress?: PublicKey;
  subscriberAddress: PublicKey;
  merchantAddress: PublicKey;
  planAddress: PublicKey;
  /** The Token-2022 wrapped USDC mint used for transfer_checked */
  wrappedUsdcMint: PublicKey;
  /** The protocol's SPL USDC vault (used for PDA resolution) */
  wrappingVault?: PublicKey;
}

export interface VelaCreateAgentMandateParams {
  agent: PublicKey;
  splUsdcMint: PublicKey;
  authorityUsdcAccount?: PublicKey;
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
  dailyLimit: bigint | number;
  lifetimeCap: bigint | number;
  minPullAmount: bigint | number;
  minPullInterval: bigint | number;
  services: AgentServiceLimitInput[];
  fundedAmount: bigint | number;
}

export interface VelaAgentPullParams {
  mandateAddress?: PublicKey;
  authority: PublicKey;
  serviceWrappedAccount: PublicKey;
  amount: bigint | number;
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
}

export interface VelaAdjustAgentMandateParams {
  agent: PublicKey;
  dailyLimit?: bigint | number;
  lifetimeCap?: bigint | number;
  minPullAmount?: bigint | number;
  minPullInterval?: bigint | number;
  services?: AgentServiceLimitInput[];
  wrappedUsdcMint?: PublicKey;
}

export interface VelaPauseAgentMandateParams {
  agent: PublicKey;
}

export interface VelaResumeAgentMandateParams {
  agent: PublicKey;
}

export interface VelaRevokeAgentMandateParams {
  agent: PublicKey;
  splUsdcMint: PublicKey;
  authorityUsdcAccount?: PublicKey;
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
}

export interface VelaDrainAgentMandateParams {
  agent: PublicKey;
  splUsdcMint: PublicKey;
  authorityUsdcAccount?: PublicKey;
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
}

export interface VelaTopUpAgentMandateParams {
  agent: PublicKey;
  amount: bigint | number;
  splUsdcMint: PublicKey;
  wrappedUsdcMint?: PublicKey;
  wrappingVault?: PublicKey;
}

export interface VelaCancelParams {
  mandateAddress: PublicKey;
  subscriberAddress: PublicKey;
  planAddress: PublicKey;
}

export interface VelaAdminCancelParams {
  mandateAddress: PublicKey;
  subscriberAddress: PublicKey;
  planAddress: PublicKey;
  credentialMintAddress?: PublicKey;
}

export interface VelaWrapParams {
  subscriber: PublicKey;
  amount: bigint;
  splUsdcMint: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
  /** Destination owner for wrapped USDC. Defaults to the subscriber. */
  destinationOwner?: PublicKey;
  /** Explicit destination token account. If omitted, the ATA for destinationOwner is derived. */
  destinationWrappedAccount?: PublicKey;
}

export interface VelaUnwrapParams {
  user: PublicKey;
  amount: bigint;
  splUsdcMint: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
}

export interface VelaWrapAndSubscribeParams {
  subscriber: PublicKey;
  planAddress: PublicKey;
  merchantAddress: PublicKey;
  splUsdcMint: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
  amount: bigint;
  credentialMintAddress?: PublicKey;
}

export type KeeperMode = "centralized" | "tuktuk";

export interface KeeperConfig {
  admin: PublicKey;
  mode: KeeperMode;
  keeperEndpoint: string;
  keeperAuthority: PublicKey;
  bump: number;
}

export interface BillingScheduleParams {
  mandateAddress: PublicKey;
  planAddress: PublicKey;
  subscriberAddress: PublicKey;
  merchantAddress: PublicKey;
  frequency: bigint;
  nextPaymentDue: bigint; // Unix timestamp (seconds)
  billingType?: BillingType;
  usagePlanAddress?: PublicKey;
}

export interface InitKeeperConfigParams {
  mode: KeeperMode;
  keeperEndpoint: string;
  keeperAuthority: PublicKey;
}

export interface UpdateKeeperConfigParams {
  mode?: KeeperMode;
  keeperEndpoint?: string;
  keeperAuthority?: PublicKey;
}

export interface VelaMethodResult<T = void> {
  signature: string;
  address?: PublicKey;
  data?: T;
}

export interface AgentMandateMethodResult
  extends VelaMethodResult<AgentMandate> {}

export interface AgentMandateDrainResult
  extends VelaMethodResult<AgentMandate> {
  drainedAmount: bigint;
}

export interface AgentMandateRevokeResult
  extends VelaMethodResult<AgentMandate> {
  reclaimedAmount: bigint;
}

export interface CheckAgentBudgetParams {
  authority: PublicKey;
  agent: PublicKey;
  service?: PublicKey;
  wrappedUsdcMint?: PublicKey;
  now?: bigint | number;
}

export interface VerifyAgentMandateParams {
  authority: PublicKey;
  agent: PublicKey;
  service?: PublicKey;
  wrappedUsdcMint?: PublicKey;
  now?: bigint | number;
}

export interface ValidateAgentPullParams {
  authority: PublicKey;
  agent: PublicKey;
  serviceWrappedAccount: PublicKey;
  amount: bigint | number;
  wrappedUsdcMint?: PublicKey;
  now?: bigint | number;
}

export interface AgentBudgetSummary {
  mandate: AgentMandate;
  status: AgentMandateStatus;
  mandateBalance: bigint;
  globalRemaining: bigint;
  serviceRemaining: bigint | null;
  dailyResetAt: bigint;
  serviceResetAt: bigint | null;
  serviceAuthorized: boolean;
  funded: boolean;
}

export interface AgentMandateVerificationResult extends AgentBudgetSummary {
  valid: boolean;
  reasons: string[];
}

export interface AgentPullValidationResult extends AgentBudgetSummary {
  canPull: boolean;
  reasons: string[];
}

export interface AgentWebhookConfig {
  url: string;
  authHeader?: string;
  webhookType?: string;
  transactionTypes?: string[];
}

export interface HeliusWebhookTransaction {
  signature?: string;
  logs?: string[];
  meta?: {
    logMessages?: string[];
  };
}

export interface HeliusWebhookPayload {
  transactions: HeliusWebhookTransaction[];
}

export interface AgentPullExecutedEvent {
  type: "AgentPullExecuted";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  service: PublicKey;
  amount: bigint;
  dailySpent: bigint;
  totalSpent: bigint;
  remainingBalance: bigint;
}

export interface AgentMandatePausedEvent {
  type: "AgentMandatePaused";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailySpent: bigint;
  totalSpent: bigint;
}

export interface AgentMandateRevokedEvent {
  type: "AgentMandateRevoked";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailySpent: bigint;
  totalSpent: bigint;
  remainingBalance: bigint;
}

export interface AgentMandateCreatedEvent {
  type: "AgentMandateCreated";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailyLimit: bigint;
  lifetimeCap: bigint;
  serviceCount: number;
  fundedAmount: bigint;
  remainingBalance: bigint;
}

export interface AgentMandateAdjustedEvent {
  type: "AgentMandateAdjusted";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailyLimit: bigint;
  lifetimeCap: bigint;
  minPullAmount: bigint;
  minPullInterval: bigint;
  dailySpent: bigint;
  totalSpent: bigint;
  remainingBalance: bigint;
}

export interface AgentMandateResumedEvent {
  type: "AgentMandateResumed";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  dailySpent: bigint;
  totalSpent: bigint;
}

export interface AgentMandateDrainedEvent {
  type: "AgentMandateDrained";
  signature?: string;
  mandate: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
  status: AgentMandateStatus;
  dailySpent: bigint;
  totalSpent: bigint;
  remainingBalance: bigint;
}

export type AgentWebhookEvent =
  | AgentMandateCreatedEvent
  | AgentMandateAdjustedEvent
  | AgentMandateResumedEvent
  | AgentMandateDrainedEvent
  | AgentPullExecutedEvent
  | AgentMandatePausedEvent
  | AgentMandateRevokedEvent;

export interface ValidationResult {
  canPull: boolean;
  mandate: VelaMandate;
  reasons: string[];
}

export interface SubscribeValidationResult {
  canSubscribe: boolean;
  plan: SubscribablePlan;
  reasons: string[];
}

export interface CancelValidationResult {
  canCancel: boolean;
  mandate: VelaMandate;
  reasons: string[];
}

// ── Usage-based billing types ─────────────────────────────────────────────────

export interface PricingTier {
  upTo: BN;         // usage units upper bound (0 = unlimited for last tier)
  ratePerUnit: BN;  // micro-USDC per unit (6 decimals)
  padding: BN;      // alignment/future use
}

export interface VelaUsagePlanParams {
  planId: BN;
  unitName: Uint8Array;       // 32 bytes, UTF-8 padded
  tiers: PricingTier[];
  maxChargePerPeriod: BN;
  settlementFrequency: BN;
}

export interface VelaSubmitUsageReportParams {
  mandateAddress: PublicKey;
  periodStart: BN;  // i64 timestamp
  periodEnd: BN;    // i64 timestamp
  usageUnits: BN;   // plaintext units (SDK encrypts before submitting)
}

export interface VelaRequestUsageComputationParams {
  payer: PublicKey;
  mandateAddress: PublicKey;
  usagePlanAddress: PublicKey;
  usageReportAddress: PublicKey;
  computationOffset: bigint;
  ciphertext: Uint8Array[];   // encrypted fields for Arcium circuit
  pubKey: Uint8Array;         // x25519 public key, 32 bytes
  nonce: bigint;              // u128
}

export type BillingType = "flat" | "usage";

// PDA seed buffers for usage billing
export const USAGE_PLAN_SEED = Buffer.from("usage_plan");
export const USAGE_REPORT_SEED = Buffer.from("usage_report");
export const USAGE_CREDENTIAL_SEED = Buffer.from("usage_credential");

// Account shape returned by program.account.usagePlan.fetch()
export interface UsagePlanAccount {
  merchant: PublicKey;
  planId: BN;
  unitName: number[];
  tiers: Array<{ upTo: BN; ratePerUnit: BN; padding: BN }>;
  tierCount: number;
  maxChargePerPeriod: BN;
  settlementFrequency: BN;
  credentialMint: PublicKey;
  status: Record<string, unknown>;
  bump: number;
}

// Account shape returned by program.account.usageReport.fetch()
export interface UsageReportAccount {
  mandate: PublicKey;
  merchant: PublicKey;
  periodStart: BN;
  periodEnd: BN;
  encryptedUsage: number[][];
  nonce: BN;
  pubKey: number[];
  settled: boolean;
  createdAt: BN;
  bump: number;
}
