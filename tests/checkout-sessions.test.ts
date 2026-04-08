import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Connection, Keypair } from "@solana/web3.js";
import { createVelaClient } from "../src/client";

const originalFetch = globalThis.fetch;
const connection = new Connection("http://127.0.0.1:8899");
const wallet = {
  publicKey: Keypair.generate().publicKey,
  async signTransaction<T extends { serialize(): Buffer }>(tx: T): Promise<T> {
    return tx;
  },
};

const defaultParams = {
  planId: "plan_123",
  successUrl: "https://merchant.example/success",
  cancelUrl: "https://merchant.example/cancel",
  ttlMinutes: 60,
  metadata: {
    source: "sdk-test",
  },
};

const defaultSession = {
  id: "cs_test_123",
  url: "https://pay.velapay.com/session/cs_test_123",
  status: "created" as const,
  planId: defaultParams.planId,
  successUrl: defaultParams.successUrl,
  cancelUrl: defaultParams.cancelUrl,
  expiresAt: "2026-04-09T00:00:00Z",
  createdAt: "2026-04-08T00:00:00Z",
};

let mockFetch: ReturnType<typeof mock>;

function getFetchCall(fn: ReturnType<typeof mock>): [string, RequestInit] {
  const call = fn.mock.calls[0];
  expect(call).toBeDefined();
  return call as unknown as [string, RequestInit];
}

function createClient(
  overrides: Partial<Parameters<typeof createVelaClient>[0]> = {},
) {
  return createVelaClient({
    connection,
    wallet,
    dashboardApiUrl: "https://dashboard.velapay.com/",
    apiKey: "sk_test_123",
    ...overrides,
  });
}

beforeEach(() => {
  mockFetch = mock(async () =>
    new Response(JSON.stringify(defaultSession), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }),
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("checkoutSessions", () => {
  test("create() calls POST /api/checkout-sessions with auth header and JSON body", async () => {
    const client = createClient();

    const session = await client.checkoutSessions.create(defaultParams);

    expect(session).toEqual(defaultSession);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = getFetchCall(mockFetch);
    expect(url).toBe("https://dashboard.velapay.com/api/checkout-sessions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer sk_test_123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual(defaultParams);
  });

  test("create() throws when dashboardApiUrl is not configured", async () => {
    const client = createClient({ dashboardApiUrl: undefined });

    await expect(client.checkoutSessions.create(defaultParams)).rejects.toThrow(
      "dashboardApiUrl required for checkout sessions",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("get() calls GET /api/checkout-sessions/{id} with auth header", async () => {
    const client = createClient();

    const session = await client.checkoutSessions.get("cs_test_123");

    expect(session.id).toBe("cs_test_123");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = getFetchCall(mockFetch);
    expect(url).toBe(
      "https://dashboard.velapay.com/api/checkout-sessions/cs_test_123",
    );
    expect(init.headers).toEqual({
      Authorization: "Bearer sk_test_123",
    });
  });

  test("expire() calls POST /api/checkout-sessions/{id}/expire with auth header", async () => {
    const expireFetch = mock(async () => new Response(null, { status: 204 }));
    globalThis.fetch = expireFetch as unknown as typeof fetch;

    const client = createClient();

    await client.checkoutSessions.expire("cs_test_123");

    expect(expireFetch).toHaveBeenCalledTimes(1);
    const [url, init] = getFetchCall(expireFetch);
    expect(url).toBe(
      "https://dashboard.velapay.com/api/checkout-sessions/cs_test_123/expire",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer sk_test_123",
    });
  });

  test("create() throws API error payloads on non-200 responses", async () => {
    const failingFetch = mock(async () =>
      new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    globalThis.fetch = failingFetch as unknown as typeof fetch;

    const client = createClient();

    await expect(client.checkoutSessions.create(defaultParams)).rejects.toThrow(
      "Plan not found",
    );
  });
});
