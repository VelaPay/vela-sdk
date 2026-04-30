import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { EventParser } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ALTManager,
  createVelaClient,
  ensureAgentWebhook,
  handleAgentWebhookPayload,
  PROGRAM_ID,
  parseAgentWebhookPayload,
} from "../../src/index";

const heliusState = {
  connection: {} as any,
  webhooks: [] as Array<{
    webhookID: string;
    webhookURL: string;
    accountAddresses: string[];
    transactionTypes: string[];
    webhookType: string;
    authHeader?: string;
  }>,
  createCalls: [] as Array<Record<string, unknown>>,
};

mock.module("helius-sdk", () => ({
  createHelius: mock(() => ({
    connection: heliusState.connection,
    webhooks: {
      getAll: mock(async () => heliusState.webhooks),
      create: mock(async (request: any) => {
        heliusState.createCalls.push(request);
        const created = {
          webhookID: `wh_${heliusState.createCalls.length}`,
          webhookURL: request.webhookURL,
          accountAddresses: request.accountAddresses,
          transactionTypes: request.transactionTypes,
          webhookType: request.webhookType ?? "enhanced",
          authHeader: request.authHeader,
        };
        heliusState.webhooks.push(created);
        return { webhookID: created.webhookID };
      }),
    },
  })),
}));

const originalParseLogs = EventParser.prototype.parseLogs;
const originalGetOrCreateALT = ALTManager.prototype.getOrCreateALT;
const originalBuildV0Transaction = ALTManager.prototype.buildV0Transaction;

beforeEach(() => {
  heliusState.connection = {};
  heliusState.webhooks = [];
  heliusState.createCalls = [];
});

afterAll(() => {
  EventParser.prototype.parseLogs = originalParseLogs;
  ALTManager.prototype.getOrCreateALT = originalGetOrCreateALT;
  ALTManager.prototype.buildV0Transaction = originalBuildV0Transaction;
});

describe("agent mandate helius webhooks", () => {
  test("ensureAgentWebhook reuses an existing matching webhook", async () => {
    heliusState.webhooks.push({
      webhookID: "existing-webhook",
      webhookURL: "https://vela.test/webhooks",
      accountAddresses: [PROGRAM_ID.toBase58()],
      transactionTypes: ["Any"],
      webhookType: "enhanced",
    });

    const result = await ensureAgentWebhook({
      apiKey: "helius-key",
      agentWebhook: {
        url: "https://vela.test/webhooks",
      },
    });

    expect(result).toEqual({
      webhookId: "existing-webhook",
      reused: true,
    });
    expect(heliusState.createCalls).toHaveLength(0);
  });

  test("ensureAgentWebhook creates a webhook when none exists", async () => {
    const result = await ensureAgentWebhook({
      apiKey: "helius-key",
      agentWebhook: {
        url: "https://vela.test/webhooks",
        authHeader: "Bearer secret",
      },
    });

    expect(result).toEqual({
      webhookId: "wh_1",
      reused: false,
    });
    expect(heliusState.createCalls).toEqual([
      {
        webhookURL: "https://vela.test/webhooks",
        accountAddresses: [PROGRAM_ID.toBase58()],
        transactionTypes: ["Any"],
        webhookType: "enhanced",
        authHeader: "Bearer secret",
      },
    ]);
  });

  test("ensureAgentWebhook does not reuse a webhook with mismatched auth or transaction types", async () => {
    heliusState.webhooks.push({
      webhookID: "existing-webhook",
      webhookURL: "https://vela.test/webhooks",
      accountAddresses: [PROGRAM_ID.toBase58()],
      transactionTypes: ["Any"],
      webhookType: "enhanced",
      authHeader: "Bearer old",
    });

    const result = await ensureAgentWebhook({
      apiKey: "helius-key",
      agentWebhook: {
        url: "https://vela.test/webhooks",
        authHeader: "Bearer new",
        transactionTypes: ["Any", "Transfers"],
      },
    });

    expect(result).toEqual({
      webhookId: "wh_1",
      reused: false,
    });
    expect(heliusState.createCalls).toHaveLength(1);
  });

  test("parseAgentWebhookPayload decodes the full agent mandate event set", () => {
    EventParser.prototype.parseLogs = function* parseLogs() {
      yield {
        name: "AgentMandateCreated",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailyLimit: 1_000_000,
          lifetimeCap: 5_000_000,
          serviceCount: 2,
          fundedAmount: 1_000_000,
          remainingBalance: 1_000_000,
        },
      };
      yield {
        name: "AgentMandateAdjusted",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailyLimit: 2_000_000,
          lifetimeCap: 8_000_000,
          minPullAmount: 100_000,
          minPullInterval: 60,
          dailySpent: 100_000,
          totalSpent: 200_000,
          remainingBalance: 900_000,
        },
      };
      yield {
        name: "AgentPullExecuted",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          service: Keypair.generate().publicKey,
          amount: 700_000,
          dailySpent: 700_000,
          totalSpent: 700_000,
          remainingBalance: 1_300_000,
        },
      };
      yield {
        name: "AgentMandateResumed",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailySpent: 410_000,
          totalSpent: 1_120_000,
        },
      };
      yield {
        name: "AgentMandateRevoked",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailySpent: 900_000,
          totalSpent: 1_400_000,
          remainingBalance: 0,
        },
      };
      yield {
        name: "AgentMandatePaused",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailySpent: 400_000,
          totalSpent: 1_100_000,
        },
      };
      yield {
        name: "AgentMandateDrained",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          status: { revoked: {} },
          dailySpent: 400_000,
          totalSpent: 1_100_000,
          remainingBalance: 0,
        },
      };
    } as any;

    const events = parseAgentWebhookPayload({
      transactions: [
        {
          signature: "5g7WebhookSig",
          logs: ["Program data: stub"],
        },
      ],
    });

    expect(events.map((event) => event.type)).toEqual([
      "AgentMandateCreated",
      "AgentMandateAdjusted",
      "AgentPullExecuted",
      "AgentMandateResumed",
      "AgentMandateRevoked",
      "AgentMandatePaused",
      "AgentMandateDrained",
    ]);
    expect(events[0]?.signature).toBe("5g7WebhookSig");
    expect(events[0]?.type).toBe("AgentMandateCreated");
    expect(events[2]?.type).toBe("AgentPullExecuted");
    if (events[2]?.type === "AgentPullExecuted") {
      expect(events[2].amount).toBe(700_000n);
    }
  });

  test("handleAgentWebhookPayload forwards parsed events to the callback", async () => {
    EventParser.prototype.parseLogs = function* parseLogs() {
      yield {
        name: "AgentMandatePaused",
        data: {
          mandate: Keypair.generate().publicKey,
          authority: Keypair.generate().publicKey,
          agent: Keypair.generate().publicKey,
          dailySpent: 1,
          totalSpent: 2,
        },
      };
    } as any;
    const seen: string[] = [];

    const events = await handleAgentWebhookPayload(
      [{ signature: "pause-sig", logs: ["Program data: stub"] }],
      async (event) => {
        seen.push(event.type);
      },
    );

    expect(seen).toEqual(["AgentMandatePaused"]);
    expect(events).toHaveLength(1);
  });

  test("successful createAgentMandate lazily registers a single webhook and reuses the cached ID", async () => {
    ALTManager.prototype.getOrCreateALT = async function mockAlt() {
      return {
        key: PublicKey.default,
        state: {
          deactivationSlot: 0n,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          authority: null,
          addresses: [],
        },
      } as any;
    };
    ALTManager.prototype.buildV0Transaction = function buildWithoutLookupTables(
      payerKey,
      instructions,
      blockhash,
    ) {
      const message = new TransactionMessage({
        payerKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();
      return new VersionedTransaction(message);
    };

    const authority = Keypair.generate();
    const agent = Keypair.generate().publicKey;
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const baseConnection = {
      getLatestBlockhash: async () => ({
        blockhash: "9xQeWvG816bUx9EPfDdKgbk8aUq8w3F1Hj6x7r9mNQ5F",
        lastValidBlockHeight: 0,
      }),
      getSlot: async () => 0,
      getAddressLookupTable: async () => ({
        context: { slot: 0 },
        value: null,
      }),
      sendRawTransaction: async () => "sent-signature",
      confirmTransaction: async () => ({
        context: { slot: 0 },
        value: { err: null },
      }),
    } as any;
    const heliusConnection = {
      ...baseConnection,
    } as any;
    heliusState.connection = heliusConnection;
    const customProgramId = Keypair.generate().publicKey;
    const client = createVelaClient({
      connection: baseConnection,
      wallet: {
        publicKey: authority.publicKey,
        signTransaction: async (tx: any) => {
          if (tx instanceof VersionedTransaction) {
            tx.sign([authority]);
          }
          return tx;
        },
      },
      heliusApiKey: "helius-key",
      heliusCluster: "devnet",
      agentWebhook: {
        url: "https://vela.test/webhooks",
      },
      programId: customProgramId,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    (client.program as any).account = {
      ...((client.program as any).account ?? {}),
      protocolConfig: {
        fetch: mock(async () => ({
          wrappedUsdcMint,
          wrappingVault: Keypair.generate().publicKey,
        })),
      },
      agentMandate: {
        fetch: mock(async () => ({
          authority: authority.publicKey,
          agent,
          dailyLimit: { toString: () => "5000000" },
          dailySpent: { toString: () => "0" },
          dailyLastReset: { toString: () => "1000" },
          lifetimeCap: { toString: () => "20000000" },
          totalSpent: { toString: () => "0" },
          minPullAmount: { toString: () => "100000" },
          minPullInterval: { toString: () => "0" },
          lastPullAt: { toString: () => "0" },
          status: { active: {} },
          services: [],
          bump: 255,
        })),
      },
    };
    (client.program as any).methods = {
      createAgentMandate: () => ({
        accounts: () => ({
          instruction: async () =>
            new TransactionInstruction({
              programId: customProgramId,
              keys: [],
              data: Buffer.from([1]),
            }),
        }),
      }),
    };

    await client.createAgentMandate({
      agent,
      splUsdcMint: Keypair.generate().publicKey,
      wrappedUsdcMint,
      wrappingVault: Keypair.generate().publicKey,
      dailyLimit: 5_000_000n,
      lifetimeCap: 20_000_000n,
      minPullAmount: 100_000n,
      minPullInterval: 0n,
      services: [],
      fundedAmount: 500_000n,
    });
    await client.createAgentMandate({
      agent,
      splUsdcMint: Keypair.generate().publicKey,
      wrappedUsdcMint,
      wrappingVault: Keypair.generate().publicKey,
      dailyLimit: 5_000_000n,
      lifetimeCap: 20_000_000n,
      minPullAmount: 100_000n,
      minPullInterval: 0n,
      services: [],
      fundedAmount: 500_000n,
    });

    expect(heliusState.createCalls).toHaveLength(1);
    expect(client.program.programId.equals(customProgramId)).toBe(true);
    expect(client.connection).toBe(heliusConnection);
  });
});
