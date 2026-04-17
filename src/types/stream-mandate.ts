import type { PublicKey } from "@solana/web3.js";

export type StreamStatus = "active" | "paused" | "cancelled";

export interface StreamMandate {
  address: PublicKey;
  version: number;
  subscriber: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  ratePerSecond: bigint;
  authorizedMaxRate: bigint;
  lastSettledTs: bigint;
  totalStreamed: bigint;
  maxStreamed: bigint | null;
  pausedAt: bigint | null;
  minSettleInterval: number;
  status: StreamStatus;
  mandateIndex: bigint;
  bump: number;
  pendingNewRatePerSecond: bigint;
  pendingNewAuthorizedMaxRate: bigint;
  pendingEffectiveAt: bigint;
  pendingChangeType: number;
  pendingNonceShort: number[];
}
