import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { VelaPaymentHandler } from "../../src/x402/client";
import {
  encodePaymentChallenge,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type VelaPaymentChallenge,
} from "../../src/x402/proof";

function createChallenge(): VelaPaymentChallenge {
  return {
    version: "vela-x402-1",
    amount: "500000",
    network: "solana:devnet",
    address: Keypair.generate().publicKey.toBase58(),
    authority: Keypair.generate().publicKey.toBase58(),
    destination: Keypair.generate().publicKey.toBase58(),
    service: Keypair.generate().publicKey.toBase58(),
    nonce: "nonce-1",
    expires: Date.now() + 60_000,
  };
}

describe("VelaPaymentHandler", () => {
  test("@vela/sdk/x402 stays on a separate subpath", async () => {
    const root = await import("../../src/index");
    const x402 = await import("../../src/x402/index");

    expect("VelaPaymentHandler" in root).toBe(false);
    expect(typeof x402.VelaPaymentHandler).toBe("function");
  });

  test("fetch() parses PAYMENT-REQUIRED, pays via agentPull, and retries with PAYMENT-SIGNATURE", async () => {
    const challenge = createChallenge();
    const calls: Array<{ headers?: HeadersInit }> = [];
    const paymentClient = {
      verifyAgentMandate: async () => ({
        valid: true,
        reasons: [],
      } as any),
      checkAgentBudget: async () => ({
        globalRemaining: 1_000_000n,
        serviceRemaining: 1_000_000n,
        mandateBalance: 1_000_000n,
      } as any),
      agentPull: async () => ({ signature: "tx-paid" }),
    };
    const handler = new VelaPaymentHandler({
      client: paymentClient,
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push({ headers: request.headers });
        if (calls.length === 1) {
          return new Response("pay first", {
            status: 402,
            headers: {
              [PAYMENT_REQUIRED_HEADER]: encodePaymentChallenge(challenge),
            },
          });
        }
        return new Response("ok", { status: 200 });
      },
    });

    const response = await handler.fetch("https://vela.test/paywall");
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);

    const retryHeaders = new Headers(calls[1]?.headers);
    expect(retryHeaders.get(PAYMENT_SIGNATURE_HEADER)).toBeTruthy();
  });

  test("canAfford() composes verifyAgentMandate() and checkAgentBudget()", async () => {
    const challenge = createChallenge();
    const calls: string[] = [];
    const handler = new VelaPaymentHandler({
      client: {
        verifyAgentMandate: async () => {
          calls.push("verify");
          return {
            valid: true,
            reasons: [],
          } as any;
        },
        checkAgentBudget: async () => {
          calls.push("budget");
          return {
            globalRemaining: 1_000_000n,
            serviceRemaining: 1_000_000n,
            mandateBalance: 1_000_000n,
          } as any;
        },
        agentPull: async () => {
          calls.push("agentPull");
          return { signature: "tx-paid" };
        },
      },
    });

    const affordability = await handler.canAfford(challenge);
    expect(affordability.affordable).toBe(true);
    expect(calls).toEqual(["verify", "budget"]);
  });

  test("fetch() preserves request bodies when retrying a paid POST", async () => {
    const challenge = createChallenge();
    const seenBodies: string[] = [];
    const handler = new VelaPaymentHandler({
      client: {
        verifyAgentMandate: async () =>
          ({
            valid: true,
            reasons: [],
          }) as any,
        checkAgentBudget: async () =>
          ({
            globalRemaining: 1_000_000n,
            serviceRemaining: 1_000_000n,
            mandateBalance: 1_000_000n,
          }) as any,
        agentPull: async () => ({ signature: "tx-paid" }),
      },
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        seenBodies.push(await request.text());
        if (seenBodies.length === 1) {
          return new Response("pay first", {
            status: 402,
            headers: {
              [PAYMENT_REQUIRED_HEADER]: encodePaymentChallenge(challenge),
            },
          });
        }
        return new Response("ok", { status: 200 });
      },
    });

    const response = await handler.fetch(
      new Request("https://vela.test/paywall", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ hello: "vela" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(seenBodies).toEqual([
      JSON.stringify({ hello: "vela" }),
      JSON.stringify({ hello: "vela" }),
    ]);
  });
});
