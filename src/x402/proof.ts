import { randomUUID } from "node:crypto";
import {
  InvalidPaymentHeaderError,
  InvalidRawAmountError,
} from "../errors/sdk-errors";

export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const DEFAULT_X402_NETWORK = "solana:devnet";
export const DEFAULT_CHALLENGE_TTL_MS = 60_000;

export interface VelaPaymentChallenge {
  version: "vela-x402-1";
  amount: string;
  network: string;
  address: string;
  authority: string;
  destination: string;
  nonce: string;
  expires: number;
  service?: string;
  wrappedUsdcMint?: string;
  protocolProgram?: string;
}

export interface VelaPaymentProof extends VelaPaymentChallenge {
  txSignature: string;
  paidAt: number;
}

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64Json<T>(value: string, label: string): T {
  try {
    return JSON.parse(
      Buffer.from(value.trim(), "base64url").toString("utf8"),
    ) as T;
  } catch {
    throw new InvalidPaymentHeaderError(label);
  }
}

export function parseRawAmount(value: bigint | number | string): bigint {
  let amount: bigint;
  if (typeof value === "bigint") {
    amount = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new InvalidRawAmountError(value);
    }
    amount = BigInt(value);
  } else if (/^\d+$/.test(value)) {
    amount = BigInt(value);
  } else {
    throw new InvalidRawAmountError(value);
  }
  if (amount < 0n) {
    throw new InvalidRawAmountError(value);
  }
  return amount;
}

export function createPaymentChallenge(params: {
  amount: bigint | number | string;
  address: string;
  authority: string;
  destination: string;
  network?: string;
  service?: string;
  wrappedUsdcMint?: string;
  protocolProgram?: string;
  nonce?: string;
  expires?: number;
  ttlMs?: number;
  now?: number;
}): VelaPaymentChallenge {
  const now = params.now ?? Date.now();
  const ttlMs = params.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS;

  return {
    version: "vela-x402-1",
    amount: parseRawAmount(params.amount).toString(),
    network: params.network ?? DEFAULT_X402_NETWORK,
    address: params.address,
    authority: params.authority,
    destination: params.destination,
    nonce: params.nonce ?? randomUUID(),
    expires: params.expires ?? now + ttlMs,
    service: params.service,
    wrappedUsdcMint: params.wrappedUsdcMint,
    protocolProgram: params.protocolProgram,
  };
}

export function encodePaymentChallenge(
  challenge: VelaPaymentChallenge,
): string {
  return encodeBase64Json(challenge);
}

export function decodePaymentChallenge(value: string): VelaPaymentChallenge {
  return decodeBase64Json<VelaPaymentChallenge>(value, PAYMENT_REQUIRED_HEADER);
}

export function createPaymentProof(
  challenge: VelaPaymentChallenge,
  txSignature: string,
  paidAt = Date.now(),
): VelaPaymentProof {
  return {
    ...challenge,
    txSignature,
    paidAt,
  };
}

export function encodePaymentProof(proof: VelaPaymentProof): string {
  return encodeBase64Json(proof);
}

export function decodePaymentProof(value: string): VelaPaymentProof {
  return decodeBase64Json<VelaPaymentProof>(value, PAYMENT_SIGNATURE_HEADER);
}

export function isExpired(
  challengeOrProof: Pick<VelaPaymentChallenge, "expires">,
  now = Date.now(),
): boolean {
  return challengeOrProof.expires <= now;
}
