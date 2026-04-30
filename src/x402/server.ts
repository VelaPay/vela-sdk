import type { Connection } from "@solana/web3.js";
import type { MiddlewareHandler } from "hono";
import { instructionDiscriminator, sliceEquals } from "../browser/bytes";
import { PROGRAM_ID } from "../constants";
import {
  PaymentProofExpiredError,
  PaymentProofMismatchError,
  PaymentTransactionVerificationError,
} from "../errors/sdk-errors";
import { createNonceCache, type NonceCache } from "./nonce-cache";
import {
  createPaymentChallenge,
  decodePaymentProof,
  encodePaymentChallenge,
  isExpired,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  parseRawAmount,
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
type InstructionLike = {
  programId?: AccountKeyLike;
  programIdIndex?: number;
  accounts?: number[];
  accountKeyIndexes?: number[];
  data?: string | number[] | Uint8Array;
};
type TransactionLike = {
  transaction?: {
    message?: {
      accountKeys?: AccountKeyLike[];
      instructions?: InstructionLike[];
      compiledInstructions?: InstructionLike[];
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

const AGENT_PULL_DISCRIMINATOR = instructionDiscriminator("agent_pull");
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
  if (
    "pubkey" in entry &&
    entry.pubkey &&
    typeof entry.pubkey.toBase58 === "function"
  ) {
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

function decodeBase58(value: string): Uint8Array | null {
  const digits = [0];
  for (const char of value) {
    const carryStart = BASE58_ALPHABET.indexOf(char);
    if (carryStart < 0) {
      return null;
    }
    let carry = carryStart;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index] * 58 + carry;
      digits[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== "1") {
      break;
    }
    digits.push(0);
  }

  return Uint8Array.from(digits.reverse());
}

function decodeInstructionData(
  data: InstructionLike["data"],
): Uint8Array | null {
  if (data == null) {
    return null;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }
  return decodeBase58(data);
}

function extractInstructions(
  transaction: TransactionLike | null,
): InstructionLike[] {
  const message = transaction?.transaction?.message;
  return message?.instructions ?? message?.compiledInstructions ?? [];
}

function instructionProgramId(
  instruction: InstructionLike,
  accountKeys: string[],
): string | null {
  if (instruction.programId != null) {
    return normalizeAccountKey(instruction.programId);
  }
  if (instruction.programIdIndex != null) {
    return accountKeys[instruction.programIdIndex] ?? null;
  }
  return null;
}

function instructionAccounts(
  instruction: InstructionLike,
  accountKeys: string[],
): string[] {
  const indexes = instruction.accounts ?? instruction.accountKeyIndexes ?? [];
  return indexes.flatMap((index) =>
    accountKeys[index] == null ? [] : [accountKeys[index]],
  );
}

function hasExpectedAgentPullInstruction(params: {
  transaction: TransactionLike | null;
  accountKeys: string[];
  expected: VelaPaymentChallenge;
}): boolean {
  const expectedProgram =
    params.expected.protocolProgram ?? PROGRAM_ID.toBase58();
  return extractInstructions(params.transaction).some((instruction) => {
    if (
      instructionProgramId(instruction, params.accountKeys) !== expectedProgram
    ) {
      return false;
    }

    const accounts = instructionAccounts(instruction, params.accountKeys);
    if (
      !accounts.includes(params.expected.address) ||
      !accounts.includes(params.expected.authority) ||
      !accounts.includes(params.expected.destination)
    ) {
      return false;
    }

    const data = decodeInstructionData(instruction.data);
    return data != null && sliceEquals(data, AGENT_PULL_DISCRIMINATOR);
  });
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
    throw new PaymentProofExpiredError();
  }
  if (params.proof.network !== params.expected.network) {
    throw new PaymentProofMismatchError("network");
  }
  if (params.proof.amount !== params.expected.amount) {
    throw new PaymentProofMismatchError("amount");
  }
  if (params.proof.address !== params.expected.address) {
    throw new PaymentProofMismatchError("address");
  }
  if (params.proof.authority !== params.expected.authority) {
    throw new PaymentProofMismatchError("authority");
  }
  if (params.proof.destination !== params.expected.destination) {
    throw new PaymentProofMismatchError("destination");
  }
  if (params.proof.service !== params.expected.service) {
    throw new PaymentProofMismatchError("service");
  }
  if (params.proof.wrappedUsdcMint !== params.expected.wrappedUsdcMint) {
    throw new PaymentProofMismatchError("mint");
  }
  if (params.proof.protocolProgram !== params.expected.protocolProgram) {
    throw new PaymentProofMismatchError("protocol program");
  }
  if (params.proof.nonce !== params.expected.nonce) {
    throw new PaymentProofMismatchError("nonce");
  }
  if (params.proof.expires !== params.expected.expires) {
    throw new PaymentProofMismatchError("expiry");
  }

  const transaction = await params.connection.getTransaction(
    params.proof.txSignature,
    {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    } as any,
  );
  if (transaction == null) {
    throw new PaymentTransactionVerificationError("transaction not found");
  }
  if (transaction.meta?.err != null) {
    throw new PaymentTransactionVerificationError("transaction failed");
  }

  const accountKeys = extractAccountKeys(transaction as TransactionLike | null);
  if (!accountKeys.includes(params.expected.destination)) {
    throw new PaymentTransactionVerificationError("destination mismatch");
  }
  if (!accountKeys.includes(params.expected.address)) {
    throw new PaymentTransactionVerificationError("agent mismatch");
  }
  if (!accountKeys.includes(params.expected.authority)) {
    throw new PaymentTransactionVerificationError("authority mismatch");
  }
  if (
    !hasExpectedAgentPullInstruction({
      transaction: transaction as TransactionLike | null,
      accountKeys,
      expected: params.expected,
    })
  ) {
    throw new PaymentTransactionVerificationError(
      "missing expected agent_pull instruction",
    );
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
    throw new PaymentTransactionVerificationError("token balances unavailable");
  }

  const amountDelta =
    parseBalanceAmount(postBalance) - parseBalanceAmount(preBalance);
  if (amountDelta < parseRawAmount(params.expected.amount)) {
    throw new PaymentTransactionVerificationError("amount mismatch");
  }

  const logMessages = transaction.meta?.logMessages ?? [];
  if (
    !logMessages.some((message) => message.includes("Instruction: AgentPull"))
  ) {
    throw new PaymentTransactionVerificationError(
      "missing agent_pull execution",
    );
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
  protocolProgram?: string | { toBase58(): string };
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
      protocolProgram: options.protocolProgram
        ? ensureString(options.protocolProgram)
        : PROGRAM_ID.toBase58(),
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
