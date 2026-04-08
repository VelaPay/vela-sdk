import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { Hono } from "hono";
import { VelaPaymentHandler } from "../../src/x402/client";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
} from "../../src/x402/proof";
import { createX402Middleware } from "../../src/x402/server";

describe("x402 flow", () => {
  test("402 challenge -> agentPull -> retry -> 200", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const service = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    let paidSignature: string | null = null;
    let retryHeader: string | null = null;
    const app = new Hono();

    app.use(
      "*",
      createX402Middleware({
        amount: 750_000n,
        agent,
        authority,
        service,
        destination,
        connection: {
          getTransaction: async (signature: string) =>
            signature === paidSignature
              ? {
                  transaction: {
                    message: {
                      accountKeys: [
                        agent.toBase58(),
                        authority.toBase58(),
                        destination.toBase58(),
                      ],
                    },
                  },
                  meta: {
                    err: null,
                    logMessages: ["Program log: Instruction: AgentPull"],
                    preTokenBalances: [
                      {
                        accountIndex: 2,
                        uiTokenAmount: { amount: "0" },
                      },
                    ],
                    postTokenBalances: [
                      {
                        accountIndex: 2,
                        uiTokenAmount: { amount: "750000" },
                      },
                    ],
                  },
                }
              : null,
        } as any,
      }),
    );
    app.get("/protected", (c) => c.json({ ok: true }));

    const first = await app.request("http://vela.test/protected");
    expect(first.status).toBe(402);
    expect(first.headers.get(PAYMENT_REQUIRED_HEADER)).toBeTruthy();

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
        agentPull: async () => {
          paidSignature = "tx-paid";
          return { signature: paidSignature };
        },
      },
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        retryHeader = request.headers.get(
          PAYMENT_SIGNATURE_HEADER,
        );
        return app.request(request);
      },
    });

    const response = await handler.fetch("http://vela.test/protected");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(paidSignature).not.toBeNull();
    expect(paidSignature!).toBe("tx-paid");
    expect(retryHeader).toBeTruthy();
  });
});
