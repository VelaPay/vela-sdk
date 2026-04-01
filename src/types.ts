import type { Commitment, Connection, PublicKey } from "@solana/web3.js";

export interface VelaClientConfig {
  connection: Connection;
  wallet: VelaWallet;
  heliusApiKey?: string;
  commitment?: Commitment;
  programId?: PublicKey;
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
}

export interface VelaPlan {
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
  mandateAddress: PublicKey;
  subscriberAddress: PublicKey;
  merchantAddress: PublicKey;
  planAddress: PublicKey;
  /** The Token-2022 wrapped USDC mint used for transfer_checked */
  wrappedUsdcMint: PublicKey;
  /** The protocol's SPL USDC vault (used for PDA resolution) */
  wrappingVault?: PublicKey;
}

export interface VelaCancelParams {
  mandateAddress: PublicKey;
  subscriberAddress: PublicKey;
  planAddress: PublicKey;
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

export interface ValidationResult {
  canPull: boolean;
  mandate: VelaMandate;
  reasons: string[];
}

export interface SubscribeValidationResult {
  canSubscribe: boolean;
  plan: VelaPlan;
  reasons: string[];
}

export interface CancelValidationResult {
  canCancel: boolean;
  mandate: VelaMandate;
  reasons: string[];
}
