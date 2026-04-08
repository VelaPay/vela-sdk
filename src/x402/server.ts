import type { Connection } from "@solana/web3.js";
import type { MiddlewareHandler } from "hono";
import { createNonceCache, type NonceCache } from "./nonce-cache";
import {
  createPaymentChallenge,
  decodePaymentProof,
  encodePaymentChallenge,
  isExpired,
  parseRawAmount,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type VelaPaymentChallenge,
  type VelaPaymentProof,
} from "./proof";

type TransactionGetter = Pick<Connection, "getTransaction">;
type Base58Like = { toBase58(): string };
type AccountKeyLike = string | Base58Like | { pubkey?: Base58Like };
type TokenBalanceLike = {
  accountIndex?: number;
  mint?: string;
  uiTokenAmount?: { amount?: string };
};
type TransactionLike = {
  transaction?: {
    message?: {
      accountKeys?: AccountKeyLike[];
    };
  };
  meta?: {
    err?: unknown;
    logMessages?: string[] | null;
    loadedAddresses?: {
      writable: string[];
      readonly: string[];
    };
    preTokenBalances?: TokenBalanceLike[] | null;
    postTokenBalances?: TokenBalanceLike[] | null;
  };
};

function ensureString(value: string | { toBase58(): string }): string {
  return typeof value === "string" ? value : value.toBase58();
}

function normalizeAccountKey(entry: AccountKeyLike): string {
  if (typeof entry === "string") {
    return entry;
  }
  if ("toBase58" in entry && typeof entry.toBase58 === "function") {
    return entry.toBase58();
  }
  if ("pubkey" in entry && entry.pubkey && typeof entry.pubkey.toBase58 === "function") {
    return entry.pubkey.toBase58();
  }
  return String(entry);
}

function extractAccountKeys(transaction: TransactionLike | null): string[] {
  const accountKeys = transaction?.transaction?.message?.accountKeys;
  const loadedAddresses = transaction?.meta?.loadedAddresses;

  if (!Array.isArray(accountKeys)) {
    return [
      ...(loadedAddresses?.writable ?? []),
      ...(loadedAddresses?.readonly ?? []),
    ];
  }

  return [
    ...accountKeys.map(normalizeAccountKey),
    ...(loadedAddresses?.writable ?? []),
    ...(loadedAddresses?.readonly ?? []),
  ];
}

function parseBalanceAmount(entry?: TokenBalanceLike): bigint {
  return BigInt(entry?.uiTokenAmount?.amount ?? "0");
}

function findTokenBalance(
  entries: TokenBalanceLike[] | null | undefined,
  accountIndex: number,
  mint?: string,
): TokenBalanceLike | undefined {
  return entries?.find(
    (entry) =>
      entry.accountIndex === accountIndex &&
      (mint == null || entry.mint === mint),
  );
}

export async function verifyPaymentProof(params: {
  connection: TransactionGetter;
  proof: VelaPaymentProof;
  expected: VelaPaymentChallenge;
  now?: number;
}): Promise<void> {
  const now = params.now ?? Date.now();
  if (isExpired(params.proof, now)) {
    throw new Error("Payment proof expired");
  }
  if (params.proof.network !== params.expected.network) {
    throw new Error("Payment proof network mismatch");
  }
  if (params.proof.amount !== params.expected.amount) {
    throw new Error("Payment proof amount mismatch");
  }
  if (params.proof.address !== params.expected.address) {
    throw new Error("Payment proof address mismatch");
  }
  if (params.proof.authority !== params.expected.authority) {
    throw new Error("Payment proof authority mismatch");
  }
  if (params.proof.destination !== params.expected.destination) {
    throw new Error("Payment proof destination mismatch");
  }
  if (params.proof.nonce !== params.expected.nonce) {
    throw new Error("Payment proof nonce mismatch");
  }
  if (params.proof.expires !== params.expected.expires) {
    throw new Error("Payment proof expiry mismatch");
  }

  const transaction = await params.connection.getTransaction(
    params.proof.txSignature,
    {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    } as any,
  );
  if (transaction == null) {
    throw new Error("Payment transaction not found");
  }
  if (transaction.meta?.err != null) {
    throw new Error("Payment transaction failed");
  }

  const accountKeys = extractAccountKeys(transaction as TransactionLike | null);
  if (!accountKeys.includes(params.expected.destination)) {
    throw new Error("Payment transaction destination mismatch");
  }
  if (!accountKeys.includes(params.expected.address)) {
    throw new Error("Payment transaction agent mismatch");
  }
  if (!accountKeys.includes(params.expected.authority)) {
    throw new Error("Payment transaction authority mismatch");
  }

  const destinationIndex = accountKeys.indexOf(params.expected.destination);
  const preBalance = findTokenBalance(
    transaction.meta?.preTokenBalances,
    destinationIndex,
    params.expected.wrappedUsdcMint,
  );
  const postBalance = findTokenBalance(
    transaction.meta?.postTokenBalances,
    destinationIndex,
    params.expected.wrappedUsdcMint,
  );

  if (preBalance == null && postBalance == null) {
    throw new Error("Payment transaction token balances unavailable");
  }

  const amountDelta = parseBalanceAmount(postBalance) - parseBalanceAmount(preBalance);
  if (amountDelta < parseRawAmount(params.expected.amount)) {
    throw new Error("Payment transaction amount mismatch");
  }

  const logMessages = transaction.meta?.logMessages ?? [];
  if (
    logMessages.length > 0 &&
    !logMessages.some((message) => message.includes("Instruction: AgentPull"))
  ) {
    throw new Error("Payment transaction missing agent_pull execution");
  }
}

/**
 * Creates Hono middleware that challenges unpaid requests and verifies Vela
 * payment proofs. The built-in nonce cache is process-local; multi-instance
 * deployments need an external shared store to block replay across instances.
 */
export function createX402Middleware(options: {
  amount: bigint | number | string;
  agent: string | { toBase58(): string };
  authority: string | { toBase58(): string };
  destination: string | { toBase58(): string };
  service?: string | { toBase58(): string };
  wrappedUsdcMint?: string | { toBase58(): string };
  network?: string;
  challengeTtlMs?: number;
  connection: TransactionGetter;
  cache?: NonceCache;
  now?: () => number;
}): MiddlewareHandler {
  const cache = options.cache ?? createNonceCache();
  const now = options.now ?? (() => Date.now());

  return async (c, next) => {
    const proofHeader = c.req.header(PAYMENT_SIGNATURE_HEADER);
    const baseChallenge = createPaymentChallenge({
      amount: parseRawAmount(options.amount),
      address: ensureString(options.agent),
      authority: ensureString(options.authority),
      destination: ensureString(options.destination),
      service: options.service ? ensureString(options.service) : undefined,
      wrappedUsdcMint: options.wrappedUsdcMint
        ? ensureString(options.wrappedUsdcMint)
        : undefined,
      network: options.network,
      ttlMs: options.challengeTtlMs,
      now: now(),
    });

    if (proofHeader == null) {
      cache.issueNonce(baseChallenge.nonce, baseChallenge.expires, now());
      const response = new Response("Payment required", { status: 402 });
      response.headers.set(
        PAYMENT_REQUIRED_HEADER,
        encodePaymentChallenge(baseChallenge),
      );
      response.headers.set("x-vela-nonce", baseChallenge.nonce);
      response.headers.set("x-vela-expires", String(baseChallenge.expires));
      return response;
    }

    try {
      const proof = decodePaymentProof(proofHeader);
      const issuedExpires = cache.getIssuedNonceExpiry(proof.nonce, now());
      if (issuedExpires == null) {
        throw new Error("Payment challenge not found or expired");
      }
      await verifyPaymentProof({
        connection: options.connection,
        proof,
        expected: {
          ...baseChallenge,
          nonce: proof.nonce,
          expires: issuedExpires,
        },
        now: now(),
      });
      if (!cache.consumeNonce(proof.nonce, issuedExpires, now())) {
        return c.text("Payment nonce already used", 409);
      }
    } catch (err) {
      return c.text(
        err instanceof Error ? err.message : "Invalid payment proof",
        402,
      );
    }

    await next();
  };
}
