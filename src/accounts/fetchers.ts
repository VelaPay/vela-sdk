import type { Program } from "@coral-xyz/anchor";
import { type Connection, PublicKey } from "@solana/web3.js";
import {
  asBytes,
  type BufferLike,
  readI64LE,
  readU8,
  readU32LE,
  readU64LE,
  sliceEquals,
} from "../browser/bytes";
import type {
  AgentBudgetSummary,
  AgentMandate,
  AgentMandateVerificationResult,
  CheckAgentBudgetParams,
  MerchantState,
  VelaMandate,
  VelaPlan,
  VerifyAgentMandateParams,
} from "../types";
import {
  deserializeAgentMandate,
  deserializeMandate,
  deserializeMerchantState,
  deserializePlan,
} from "./deserialize";
import {
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  deriveConfigAddress,
  deriveMerchantStateAddress,
} from "./pda";

const AGENT_DAILY_RESET_WINDOW_SECONDS = 86_400n;
const AGENT_MANDATE_DISCRIMINATOR = Uint8Array.from([
  31, 231, 224, 237, 201, 149, 38, 235,
]);
const AGENT_MANDATE_RESERVED_BYTES = 64;
const AGENT_MANDATE_AUTHORITY_OFFSET = 8;
const AGENT_MANDATE_AGENT_OFFSET = AGENT_MANDATE_AUTHORITY_OFFSET + 32;
type AnchorAgentMandateAccount = Parameters<typeof deserializeAgentMandate>[1];

function mapAgentMandateStatus(status: number): AgentMandate["status"] {
  switch (status) {
    case 0:
      return "active";
    case 1:
      return "paused";
    case 2:
      return "revoked";
    default:
      throw new Error(`Unknown AgentMandate status discriminator: ${status}`);
  }
}

function readAgentMandateAccount(
  address: PublicKey,
  raw: BufferLike,
): AgentMandate {
  const data = asBytes(raw);
  if (data.length < 170) {
    throw new Error(`AgentMandate account ${address.toBase58()} is truncated`);
  }
  if (!sliceEquals(data, AGENT_MANDATE_DISCRIMINATOR)) {
    throw new Error(
      `Account ${address.toBase58()} does not contain an AgentMandate`,
    );
  }

  let offset = 8;
  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const agent = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const dailyLimit = readU64LE(data, offset);
  offset += 8;
  const dailySpent = readU64LE(data, offset);
  offset += 8;
  const dailyLastReset = readI64LE(data, offset);
  offset += 8;
  const lifetimeCap = readU64LE(data, offset);
  offset += 8;
  const totalSpent = readU64LE(data, offset);
  offset += 8;
  const minPullAmount = readU64LE(data, offset);
  offset += 8;
  const minPullInterval = readI64LE(data, offset);
  offset += 8;
  const lastPullAt = readI64LE(data, offset);
  offset += 8;
  const status = mapAgentMandateStatus(readU8(data, offset));
  offset += 1;

  const servicesLen = readU32LE(data, offset);
  offset += 4;
  const services = Array.from({ length: servicesLen }, () => {
    const service = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const dailyLimit = readU64LE(data, offset);
    offset += 8;
    const dailySpent = readU64LE(data, offset);
    offset += 8;
    const lastReset = readI64LE(data, offset);
    offset += 8;
    return { service, dailyLimit, dailySpent, lastReset };
  });

  const bump = readU8(data, offset);
  offset += 1;
  const version = readU8(data, offset);
  offset += 1;
  const reserved = Array.from(
    data.subarray(offset, offset + AGENT_MANDATE_RESERVED_BYTES),
  );

  return {
    address,
    authority,
    agent,
    dailyLimit,
    dailySpent,
    dailyLastReset,
    lifetimeCap,
    totalSpent,
    minPullAmount,
    minPullInterval,
    lastPullAt,
    status,
    services,
    bump,
    version,
    _reserved: reserved,
  };
}

function getProgramConnection(program: Program): Connection | undefined {
  return (program.provider as { connection?: Connection } | undefined)
    ?.connection;
}

function getLegacyAgentMandateFetcher(program: Program): {
  fetch: (address: PublicKey) => Promise<AnchorAgentMandateAccount>;
} | null {
  const client = (program.account as any).agentMandate;
  if (client && typeof client.fetch === "function") {
    return client;
  }
  return null;
}

function getLegacyAgentMandateLister(program: Program): {
  all: (
    filters?: Array<{ memcmp: { offset: number; bytes: string } }>,
  ) => Promise<
    Array<{ publicKey: PublicKey; account: AnchorAgentMandateAccount }>
  >;
} | null {
  const client = (program.account as any).agentMandate;
  if (client && typeof client.all === "function") {
    return client;
  }
  return null;
}

function resolveNow(now?: bigint | number): bigint {
  return now == null ? BigInt(Math.floor(Date.now() / 1000)) : BigInt(now);
}

function computeResetWindow(
  spent: bigint,
  lastReset: bigint,
  now: bigint,
): { spent: bigint; nextResetAt: bigint } {
  if (now - lastReset >= AGENT_DAILY_RESET_WINDOW_SECONDS) {
    return {
      spent: 0n,
      nextResetAt: now + AGENT_DAILY_RESET_WINDOW_SECONDS,
    };
  }

  return {
    spent,
    nextResetAt: lastReset + AGENT_DAILY_RESET_WINDOW_SECONDS,
  };
}

function clampRemaining(limit: bigint, spent: bigint): bigint {
  return limit > spent ? limit - spent : 0n;
}

async function resolveWrappedUsdcMint(
  program: Program,
  wrappedUsdcMint?: PublicKey,
): Promise<PublicKey> {
  if (wrappedUsdcMint) {
    return wrappedUsdcMint;
  }

  const [configAddress] = deriveConfigAddress(program.programId);
  const raw = await (program.account as any).protocolConfig.fetch(
    configAddress,
  );
  return raw.wrappedUsdcMint;
}

async function getMandateBalance(
  connection: Connection,
  mandateWrappedAccount: PublicKey,
): Promise<bigint> {
  const balance = await connection.getTokenAccountBalance(
    mandateWrappedAccount,
  );
  return BigInt(balance.value.amount);
}

export async function fetchAgentMandate(
  connection: Connection,
  address: PublicKey,
  program?: Program,
): Promise<AgentMandate> {
  if (typeof connection.getAccountInfo === "function") {
    const account = await connection.getAccountInfo(address);
    if (!account) {
      throw new Error(`AgentMandate account not found: ${address.toBase58()}`);
    }
    return readAgentMandateAccount(address, account.data);
  }

  const legacyFetcher = program ? getLegacyAgentMandateFetcher(program) : null;
  if (legacyFetcher) {
    const raw = await legacyFetcher.fetch(address);
    return deserializeAgentMandate(address, raw);
  }

  throw new Error("Connection does not expose getAccountInfo");
}

async function getAgentMandateAccount(
  program: Program,
  connection: Connection,
  authority: PublicKey,
  agent: PublicKey,
): Promise<AgentMandate> {
  const [address] = deriveAgentMandateAddress(
    authority,
    agent,
    program.programId,
  );
  return fetchAgentMandate(connection, address, program);
}

export async function listAgentMandates(
  program: Program,
  authority: PublicKey,
): Promise<AgentMandate[]> {
  const connection = getProgramConnection(program);
  if (connection && typeof connection.getProgramAccounts === "function") {
    const accounts = await connection.getProgramAccounts(program.programId);

    return accounts
      .filter(({ account }) => {
        const data = account.data;
        return (
          data.length >= AGENT_MANDATE_AGENT_OFFSET + 32 &&
          sliceEquals(data, AGENT_MANDATE_DISCRIMINATOR) &&
          authority.equals(
            new PublicKey(
              data.subarray(
                AGENT_MANDATE_AUTHORITY_OFFSET,
                AGENT_MANDATE_AUTHORITY_OFFSET + 32,
              ),
            ),
          )
        );
      })
      .map(({ pubkey, account }) =>
        readAgentMandateAccount(pubkey, account.data),
      );
  }

  const legacyLister = getLegacyAgentMandateLister(program);
  if (legacyLister) {
    const accounts = await legacyLister.all([
      { memcmp: { offset: 8, bytes: authority.toBase58() } },
    ]);
    return accounts.map((acc) =>
      deserializeAgentMandate(acc.publicKey, acc.account),
    );
  }

  throw new Error("Program provider does not expose a connection");
}

export async function getAgentMandate(
  program: Program,
  authority: PublicKey,
  agent: PublicKey,
): Promise<AgentMandate> {
  return getAgentMandateAccount(
    program,
    getProgramConnection(program) ?? ({} as Connection),
    authority,
    agent,
  );
}

export async function checkAgentBudget(
  program: Program,
  connection: Connection,
  params: CheckAgentBudgetParams,
): Promise<AgentBudgetSummary> {
  const now = resolveNow(params.now);
  const mandate = await getAgentMandateAccount(
    program,
    connection,
    params.authority,
    params.agent,
  );
  const wrappedUsdcMint = await resolveWrappedUsdcMint(
    program,
    params.wrappedUsdcMint,
  );
  const mandateWrappedAccount = deriveAgentMandateWrappedAta(
    mandate.address,
    wrappedUsdcMint,
  );
  const mandateBalance = await getMandateBalance(
    connection,
    mandateWrappedAccount,
  );
  const dailyWindow = computeResetWindow(
    mandate.dailySpent,
    mandate.dailyLastReset,
    now,
  );
  const serviceLimit =
    params.service == null
      ? null
      : (mandate.services.find((entry) =>
          entry.service.equals(params.service!),
        ) ?? null);
  const serviceWindow =
    serviceLimit == null
      ? null
      : computeResetWindow(
          serviceLimit.dailySpent,
          serviceLimit.lastReset,
          now,
        );

  return {
    mandate,
    status: mandate.status,
    mandateBalance,
    globalRemaining: clampRemaining(mandate.dailyLimit, dailyWindow.spent),
    serviceRemaining:
      serviceLimit == null
        ? null
        : clampRemaining(serviceLimit.dailyLimit, serviceWindow!.spent),
    dailyResetAt: dailyWindow.nextResetAt,
    serviceResetAt: serviceWindow?.nextResetAt ?? null,
    serviceAuthorized: serviceLimit != null,
    funded: mandateBalance > 0n,
  };
}

export async function verifyAgentMandate(
  program: Program,
  connection: Connection,
  params: VerifyAgentMandateParams,
): Promise<AgentMandateVerificationResult> {
  const budget = await checkAgentBudget(program, connection, params);
  const [configAddress] = deriveConfigAddress(program.programId);
  const protocolConfig = await (program.account as any).protocolConfig.fetch(
    configAddress,
  );
  const reasons: string[] = [];

  if (budget.status !== "active") {
    reasons.push(`Mandate is ${budget.status}`);
  }
  if (protocolConfig.paused) {
    reasons.push("Protocol is paused");
  }
  if (params.service && !budget.serviceAuthorized) {
    reasons.push("Service is not authorized for this mandate");
  }
  if (!budget.funded) {
    reasons.push("Mandate has no wrapped balance");
  }

  return {
    ...budget,
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Fetches active subscriptions (mandates) filtered by subscriber or merchant.
 *
 * Uses Anchor's `program.account.velaMandate.all()` with memcmp filters:
 * - subscriber: offset 8 (8-byte discriminator), 32-byte pubkey
 * - merchant:   offset 72 (8 + 32 subscriber + 32 plan), 32-byte pubkey
 */
export async function getActiveSubscriptions(
  program: Program,
  filter: { subscriber?: PublicKey; merchant?: PublicKey },
): Promise<VelaMandate[]> {
  const filters: Array<{ memcmp: { offset: number; bytes: string } }> = [];

  if (filter.subscriber) {
    filters.push({
      memcmp: { offset: 8, bytes: filter.subscriber.toBase58() },
    });
  }

  if (filter.merchant) {
    filters.push({
      memcmp: { offset: 72, bytes: filter.merchant.toBase58() },
    });
  }

  const accounts = await (program.account as any).velaMandate.all(filters);

  return accounts.map((acc: any) =>
    deserializeMandate(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a single VelaPlan by its address.
 */
export async function getPlanDetails(
  program: Program,
  planAddress: PublicKey,
): Promise<VelaPlan> {
  const raw = await (program.account as any).velaPlan.fetch(planAddress);
  return deserializePlan(planAddress, raw);
}

/**
 * Fetches all plans owned by a merchant.
 *
 * Uses memcmp filter at offset 8 (8-byte discriminator) for the merchant pubkey field.
 */
export async function getMerchantPlans(
  program: Program,
  merchant: PublicKey,
): Promise<VelaPlan[]> {
  const accounts = await (program.account as any).velaPlan.all([
    { memcmp: { offset: 8, bytes: merchant.toBase58() } },
  ]);

  return accounts.map((acc: any) =>
    deserializePlan(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a merchant's state account.
 */
export async function getMerchantState(
  program: Program,
  merchant: PublicKey,
): Promise<MerchantState> {
  const [merchantStateAddress] = deriveMerchantStateAddress(
    merchant,
    program.programId,
  );
  const raw = await (program.account as any).merchantState.fetch(
    merchantStateAddress,
  );
  return deserializeMerchantState(merchantStateAddress, raw);
}
