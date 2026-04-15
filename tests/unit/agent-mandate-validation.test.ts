import { describe, expect, mock, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  createVelaClient,
  validateAgentPull,
  type ValidateAgentPullParams,
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
    lifetimeCap: new BN(overrides.lifetimeCap ?? 8_000_000),
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
    bump: 111,
  };
}

function buildMockContext(args: {
  authority: PublicKey;
  agent: PublicKey;
  service: PublicKey;
  mandate: ReturnType<typeof createMockAgentMandateRaw>;
  wrappedUsdcMint: PublicKey;
  tokenBalance: string;
  paused?: boolean;
}) {
  const connection = {
    getParsedAccountInfo: mock(async () => ({
      value: {
        data: {
          parsed: {
            info: {
              owner: args.service.toBase58(),
            },
          },
        },
      },
    })),
    getTokenAccountBalance: mock(async () => ({
      value: { amount: args.tokenBalance },
    })),
  } as any;

  const program = {
    programId: new PublicKey("BhgXzh4E6e9xsgNrsPf9q1JqXKxETxjc9LBqx3D8cAKC"),
    account: {
      agentMandate: { fetch: mock(async () => args.mandate) },
      protocolConfig: {
        fetch: mock(async () => ({
          wrappedUsdcMint: args.wrappedUsdcMint,
          paused: args.paused ?? false,
        })),
      },
    },
  } as any;

  return { program, connection };
}

describe("validateAgentPull", () => {
  test("reports failures in the same stage order as agent_pull.rs", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const service = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const now = Math.floor(Date.now() / 1000);
    const mandate = createMockAgentMandateRaw({
      authority,
      agent,
      status: { paused: {} },
      dailyLimit: 1_200_000,
      dailySpent: 1_100_000,
      lifetimeCap: 2_050_000,
      totalSpent: 2_000_000,
      minPullAmount: 200_000,
      minPullInterval: 120,
      lastPullAt: now - 10,
      services: [
        {
          service,
          dailyLimit: 600_000,
          dailySpent: 550_000,
        },
      ],
    });
    const { program, connection } = buildMockContext({
      authority,
      agent,
      service,
      mandate,
      wrappedUsdcMint,
      tokenBalance: "100000",
      paused: true,
    });

    const result = await validateAgentPull(program, connection, {
      authority,
      agent,
      serviceWrappedAccount: Keypair.generate().publicKey,
      amount: 150_000n,
      wrappedUsdcMint,
      now,
    });

    expect(result.canPull).toBe(false);
    expect(result.reasons).toEqual([
      "Mandate is paused",
      "Protocol is paused",
      "Service daily limit would be exceeded",
      "Daily limit would be exceeded",
      "Lifetime cap would be exceeded",
      "Pull amount is below the mandate minimum",
      "Pull cooldown is still active",
      "Mandate balance is insufficient",
    ]);
  });

  test("returns a structured success result with remaining budgets and no reasons", async () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const service = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const now = Math.floor(Date.now() / 1000);
    const mandate = createMockAgentMandateRaw({
      authority,
      agent,
      dailyLimit: 5_000_000,
      dailySpent: 1_000_000,
      lifetimeCap: 20_000_000,
      totalSpent: 3_000_000,
      minPullAmount: 100_000,
      minPullInterval: 60,
      lastPullAt: now - 120,
      services: [
        {
          service,
          dailyLimit: 2_000_000,
          dailySpent: 300_000,
        },
      ],
    });
    const { program, connection } = buildMockContext({
      authority,
      agent,
      service,
      mandate,
      wrappedUsdcMint,
      tokenBalance: "5000000",
    });

    const result = await validateAgentPull(program, connection, {
      authority,
      agent,
      serviceWrappedAccount: Keypair.generate().publicKey,
      amount: 700_000n,
      wrappedUsdcMint,
      now,
    });

    expect(result.canPull).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.globalRemaining).toBe(3_300_000n);
    expect(result.serviceRemaining).toBe(1_000_000n);
    expect(result.funded).toBe(true);
  });

  test("client.validate.agentPull() and client.validateAgentPull() call the same implementation", async () => {
    const authority = Keypair.generate();
    const client = createVelaClient({
      connection: {
        getParsedAccountInfo: mock(async () => ({
          value: {
            data: {
              parsed: { info: { owner: authority.publicKey.toBase58() } },
            },
          },
        })),
        getTokenAccountBalance: mock(async () => ({
          value: { amount: "1000000" },
        })),
      } as any,
      wallet: {
        publicKey: authority.publicKey,
        signTransaction: async (tx) => tx,
      },
    });
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const mandate = createMockAgentMandateRaw({
      authority: authority.publicKey,
      agent: authority.publicKey,
      services: [{ service: authority.publicKey, dailyLimit: 2_000_000 }],
    });
    (client.program as any).account = {
      ...((client.program as any).account ?? {}),
      agentMandate: {
        fetch: mock(async () => mandate),
      },
      protocolConfig: {
        fetch: mock(async () => ({
          wrappedUsdcMint,
          paused: false,
        })),
      },
    };
    const params: ValidateAgentPullParams = {
      authority: authority.publicKey,
      agent: authority.publicKey,
      serviceWrappedAccount: Keypair.generate().publicKey,
      amount: 200_000n,
      wrappedUsdcMint,
    };

    const fromTopLevel = await client.validateAgentPull(params);
    const fromNested = await client.validate.agentPull(params);

    expect(fromTopLevel).toEqual(fromNested);
  });
});
