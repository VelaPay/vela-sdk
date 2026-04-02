import { describe, expect, test } from "bun:test";
import {
  postUsageReportBridge,
  type UsageReportBridgePayload,
} from "../../src/internal/usage-bridge";

const payload: UsageReportBridgePayload = {
  mandateAddress: "AbCdEfGhJkMnPqRsTuVwXy123456789abcdefgh",
  merchantAddress: "MerchantAddressXyZ123456789abcdefghijk",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-02-01T00:00:00.000Z",
  usageUnits: 42,
  txSignature: "5J8wWx3nQbN7mKtVpLzR9uHcFdAeYsGiMrOqPvXjTk2",
};

describe("postUsageReportBridge", () => {
  test("succeeds on first attempt", async () => {
    let calls = 0;
    const result = await postUsageReportBridge("https://keeper.example.com/", payload, "secret", {
      fetchImpl: async (input, init) => {
        calls += 1;
        expect(String(input)).toBe("https://keeper.example.com/api/keeper/usage-report");
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
        return new Response(JSON.stringify({ id: "abc" }), { status: 201 });
      },
      sleep: async () => {},
    });

    expect(calls).toBe(1);
    expect(result).toEqual({ ok: true, attempts: 1, status: 201 });
  });

  test("retries transient network failures and eventually succeeds", async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await postUsageReportBridge("https://keeper.example.com", payload, undefined, {
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error(`network-${calls}`);
        }
        return new Response(JSON.stringify({ id: "abc" }), { status: 201 });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      initialDelayMs: 100,
    });

    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
    expect(result).toEqual({ ok: true, attempts: 3, status: 201 });
  });

  test("does not retry non-retryable client errors", async () => {
    let calls = 0;
    const result = await postUsageReportBridge("https://keeper.example.com", payload, undefined, {
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
      },
      sleep: async () => {
        throw new Error("sleep should not be called");
      },
    });

    expect(calls).toBe(1);
    expect(result).toEqual({
      ok: false,
      attempts: 1,
      status: 400,
      error: "bad request",
    });
  });

  test("returns failure after exhausting retryable server errors", async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await postUsageReportBridge("https://keeper.example.com", payload, undefined, {
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      initialDelayMs: 50,
      maxAttempts: 3,
    });

    expect(calls).toBe(3);
    expect(sleeps).toEqual([50, 100]);
    expect(result).toEqual({
      ok: false,
      attempts: 3,
      status: 503,
      error: "temporary",
    });
  });
});
