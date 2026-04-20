import { describe, expect, mock, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  listAgentMandates,
  verifyAgentMandate,
} from "../../src/index";

function createMockAgentMandateRaw(
  overrides: {
    authority?: PublicKey;
    agent?: PublicKey;
    dailyLimit?: number;
    dailySpent?: number;
    dailyLastReset?: number;
    lifetimeCap?: number;
    totalSpent?: number;
    minPullAmount?: number;
    minPullInterval?: number;
    lastPullAt?: number;
    status?: { active?: {} } | { paused?: {} } | { revoked?: {} };
    services?: Array<{
      service: PublicKey;
      dailyLimit: number;
      dailySpent?: number;
      lastReset?: number;
    }>;
  } = {},
) {
  const authority = overrides.authority ?? Keypair.generate().publicKey;
  const agent = overrides.agent ?? Keypair.generate().publicKey;
  const now = Math.floor(Date.now() / 1000);

  return {
    authority,
    agent,
    dailyLimit: new BN(overrides.dailyLimit ?? 5_000_000),
    dailySpent: new BN(overrides.dailySpent ?? 1_000_000),
    dailyLastReset: new BN(overrides.dailyLastReset ?? now - 300),
    lifetimeCap: new BN(overrides.lifetimeCap ?? 20_000_000),
    totalSpent: new BN(overrides.totalSpent ?? 2_000_000),
    minPullAmount: new BN(overrides.minPullAmount ?? 100_000),
    minPullInterval: new BN(overrides.minPullInterval ?? 60),
    lastPullAt: new BN(overrides.lastPullAt ?? now - 120),
    status: overrides.status ?? { active: {} },
    services: (overrides.services ?? []).map((service) => ({
      service: service.service,
      dailyLimit: new BN(service.dailyLimit),
      dailySpent: new BN(service.dailySpent ?? 0),
      lastReset: new BN(service.lastReset ?? now - 300),
    })),
    bump: 200,
  };
}

describe("agent mandate fetchers", () => {
  test("listAgentMandates uses the authority memcmp filter and returns typed mandates", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const all = mock(async (filters: Array<{ memcmp: { offset: number; bytes: string } }>) => {
      expect(filters).toEqual([
        { memcmp: { offset: 8, bytes: authority.toBase58() } },
      ]);
      return [
        {
          publicKey: Keypair.generate().publicKey,
          account: createMockAgentMandateRaw({
            authority,
            agent,
          }),
        },
      ];
    });

    const program = {
      programId: new PublicKey("CVM6UqbwKgHckZzm8R2qbN3BWhCTdk1PsSeEQLchkwKT"),
      account: {
        agentMandate: { all },
        protocolConfig: {
          fetch: mock(async () => ({ wrappedUsdcMint, paused: false })),
        },
      },
    } as any;

    const mandates = await listAgentMandates(program, authority);

    expect(mandates).toHaveLength(1);
    expect(mandates[0]!.authority.equals(authority)).toBe(true);
    expect(typeof mandates[0]!.dailyLimit).toBe("bigint");
  });

  test("verifyAgentMandate reports validity, reasons, serviceAuthorized, and funded", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const service = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const rawMandate = createMockAgentMandateRaw({
      authority,
      agent,
      status: { paused: {} },
      services: [],
    });
    const program = {
      programId: new PublicKey("CVM6UqbwKgHckZzm8R2qbN3BWhCTdk1PsSeEQLchkwKT"),
      account: {
        agentMandate: { fetch: mock(async () => rawMandate) },
        protocolConfig: {
          fetch: mock(async () => ({
            wrappedUsdcMint,
            paused: true,
          })),
        },
      },
    } as any;
    const connection = {
      getTokenAccountBalance: mock(async () => ({
        value: { amount: "0" },
      })),
    } as any;

    const result = await verifyAgentMandate(program, connection, {
      authority,
      agent,
      service,
      wrappedUsdcMint,
    });

    expect(result.valid).toBe(false);
    expect(result.serviceAuthorized).toBe(false);
    expect(result.funded).toBe(false);
    expect(result.reasons).toEqual([
      "Mandate is paused",
      "Protocol is paused",
      "Service is not authorized for this mandate",
      "Mandate has no wrapped balance",
    ]);
  });
});
