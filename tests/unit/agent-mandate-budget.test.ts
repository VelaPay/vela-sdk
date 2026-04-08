import { describe, expect, mock, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { checkAgentBudget, deriveAgentMandateAddress } from "../../src/index";

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
    dailySpent: new BN(overrides.dailySpent ?? 1_200_000),
    dailyLastReset: new BN(overrides.dailyLastReset ?? now - 600),
    lifetimeCap: new BN(overrides.lifetimeCap ?? 20_000_000),
    totalSpent: new BN(overrides.totalSpent ?? 1_500_000),
    minPullAmount: new BN(overrides.minPullAmount ?? 100_000),
    minPullInterval: new BN(overrides.minPullInterval ?? 60),
    lastPullAt: new BN(overrides.lastPullAt ?? now - 120),
    status: overrides.status ?? { active: {} },
    services: (overrides.services ?? []).map((service) => ({
      service: service.service,
      dailyLimit: new BN(service.dailyLimit),
      dailySpent: new BN(service.dailySpent ?? 0),
      lastReset: new BN(service.lastReset ?? now - 600),
    })),
    bump: 255,
  };
}

function createMockProgram(args: {
  mandate: ReturnType<typeof createMockAgentMandateRaw>;
  wrappedUsdcMint: PublicKey;
}) {
  const fetch = mock(async (address: PublicKey) => {
    const [expected] = deriveAgentMandateAddress(
      args.mandate.authority,
      args.mandate.agent,
    );
    expect(address.toBase58()).toBe(expected.toBase58());
    return args.mandate;
  });

  return {
    programId: new PublicKey("BhgXzh4E6e9xsgNrsPf9q1JqXKxETxjc9LBqx3D8cAKC"),
    account: {
      agentMandate: { fetch },
      protocolConfig: {
        fetch: mock(async () => ({
          wrappedUsdcMint: args.wrappedUsdcMint,
          paused: false,
        })),
      },
    },
  } as any;
}

describe("checkAgentBudget", () => {
  test("returns remaining global/service budget, reset timestamps, mandate balance, and status", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const service = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const mandate = createMockAgentMandateRaw({
      authority,
      agent,
      dailyLimit: 5_000_000,
      dailySpent: 1_200_000,
      dailyLastReset: 1_000,
      services: [
        {
          service,
          dailyLimit: 2_000_000,
          dailySpent: 300_000,
          lastReset: 1_050,
        },
      ],
    });
    const program = createMockProgram({ mandate, wrappedUsdcMint });
    const connection = {
      getTokenAccountBalance: mock(async () => ({
        value: { amount: "1700000" },
      })),
    } as any;

    const result = await checkAgentBudget(program, connection, {
      authority,
      agent,
      service,
      wrappedUsdcMint,
      now: 1_500,
    });

    expect(result.status).toBe("active");
    expect(result.mandateBalance).toBe(1_700_000n);
    expect(result.globalRemaining).toBe(3_800_000n);
    expect(result.serviceRemaining).toBe(1_700_000n);
    expect(result.dailyResetAt).toBe(87_400n);
    expect(result.serviceResetAt).toBe(87_450n);
    expect(result.serviceAuthorized).toBe(true);
    expect(result.funded).toBe(true);
  });

  test("resets elapsed daily windows before computing remaining budget", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const mandate = createMockAgentMandateRaw({
      authority,
      agent,
      dailyLimit: 4_000_000,
      dailySpent: 2_500_000,
      dailyLastReset: 100,
      status: { paused: {} },
    });
    const program = createMockProgram({ mandate, wrappedUsdcMint });
    const connection = {
      getTokenAccountBalance: mock(async () => ({
        value: { amount: "0" },
      })),
    } as any;

    const result = await checkAgentBudget(program, connection, {
      authority,
      agent,
      wrappedUsdcMint,
      now: 90_000,
    });

    expect(result.status).toBe("paused");
    expect(result.globalRemaining).toBe(4_000_000n);
    expect(result.dailyResetAt).toBe(176_400n);
    expect(result.funded).toBe(false);
  });
});
