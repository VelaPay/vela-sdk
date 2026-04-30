import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { Hono } from "hono";
import { instructionDiscriminator } from "../../src/browser/bytes";
import { PROGRAM_ID } from "../../src/constants";
import { createNonceCache } from "../../src/x402/nonce-cache";
import {
  createPaymentProof,
  decodePaymentChallenge,
  encodePaymentProof,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  parseRawAmount,
} from "../../src/x402/proof";
import { createX402Middleware } from "../../src/x402/server";

function createPaidTransaction(args: {
  agent: ReturnType<typeof Keypair.generate>["publicKey"];
  authority: ReturnType<typeof Keypair.generate>["publicKey"];
  destination: ReturnType<typeof Keypair.generate>["publicKey"];
  amount: bigint;
}) {
  return {
    transaction: {
      message: {
        accountKeys: [
          args.agent.toBase58(),
          args.authority.toBase58(),
          args.destination.toBase58(),
          PROGRAM_ID.toBase58(),
        ],
        instructions: [
          {
            programIdIndex: 3,
            accounts: [0, 1, 2],
            data: Array.from(instructionDiscriminator("agent_pull")),
          },
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
          uiTokenAmount: { amount: args.amount.toString() },
        },
      ],
    },
  };
}

describe("createX402Middleware", () => {
  test("returns 402 with PAYMENT-REQUIRED header fields", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        network: "solana:devnet",
        connection: {
          getTransaction: async () => null,
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const response = await app.request("http://vela.test/");
    expect(response.status).toBe(402);

    const challenge = decodePaymentChallenge(
      response.headers.get(PAYMENT_REQUIRED_HEADER)!,
    );
    expect(challenge.amount).toBe("500000");
    expect(challenge.network).toBe("solana:devnet");
    expect(challenge.address).toBe(agent.toBase58());
    expect(challenge.destination).toBe(destination.toBase58());
    expect(challenge.nonce).toBeTruthy();
    expect(challenge.expires).toBeGreaterThan(Date.now());
  });

  test("rejects replayed nonces through the TTL cache", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const cache = createNonceCache();
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        cache,
        connection: {
          getTransaction: async () =>
            createPaidTransaction({
              agent,
              authority,
              destination,
              amount: 500_000n,
            }),
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const challengeHeader = (
      await app.request("http://vela.test/")
    ).headers.get(PAYMENT_REQUIRED_HEADER)!;
    const challenge = decodePaymentChallenge(challengeHeader);
    const proofHeader = encodePaymentProof(
      createPaymentProof(challenge, "tx-paid"),
    );

    const first = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: proofHeader,
        "x-vela-nonce": challenge.nonce,
        "x-vela-expires": String(challenge.expires),
      },
    });
    expect(first.status).toBe(200);

    const replay = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: proofHeader,
        "x-vela-nonce": challenge.nonce,
        "x-vela-expires": String(challenge.expires),
      },
    });
    expect(replay.status).toBe(402);
  });

  test("invalid proofs do not burn a nonce before verification succeeds", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async (signature: string) =>
            signature === "tx-valid"
              ? createPaidTransaction({
                  agent,
                  authority,
                  destination,
                  amount: 500_000n,
                })
              : {
                  transaction: {
                    message: {
                      accountKeys: [
                        agent.toBase58(),
                        authority.toBase58(),
                        destination.toBase58(),
                        PROGRAM_ID.toBase58(),
                      ],
                      instructions: [
                        {
                          programIdIndex: 3,
                          accounts: [0, 1, 2],
                          data: Array.from(
                            instructionDiscriminator("agent_pull"),
                          ),
                        },
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
                        uiTokenAmount: { amount: "10" },
                      },
                    ],
                  },
                },
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const challengeHeader = (
      await app.request("http://vela.test/")
    ).headers.get(PAYMENT_REQUIRED_HEADER)!;
    const challenge = decodePaymentChallenge(challengeHeader);

    const invalid = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(challenge, "tx-invalid"),
        ),
        "x-vela-nonce": challenge.nonce,
        "x-vela-expires": String(challenge.expires),
      },
    });
    expect(invalid.status).toBe(402);

    const valid = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(challenge, "tx-valid"),
        ),
        "x-vela-nonce": challenge.nonce,
        "x-vela-expires": String(challenge.expires),
      },
    });
    expect(valid.status).toBe(200);
  });

  test("verifies tx signature, amount, destination, nonce, and expiry before continuing", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const calls: string[] = [];
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async (signature: string) => {
            calls.push(signature);
            return createPaidTransaction({
              agent,
              authority,
              destination,
              amount: 500_000n,
            });
          },
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const challenge = decodePaymentChallenge(
      (await app.request("http://vela.test/")).headers.get(
        PAYMENT_REQUIRED_HEADER,
      )!,
    );
    const response = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(challenge, "tx-proof"),
        ),
        "x-vela-nonce": challenge.nonce,
        "x-vela-expires": String(challenge.expires),
      },
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual(["tx-proof"]);
  });

  test("rejects self-issued proofs that skip the original 402 challenge", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async () =>
            createPaidTransaction({
              agent,
              authority,
              destination,
              amount: 500_000n,
            }),
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const forgedChallenge = {
      version: "vela-x402-1" as const,
      amount: "500000",
      network: "solana:devnet",
      address: agent.toBase58(),
      authority: authority.toBase58(),
      destination: destination.toBase58(),
      nonce: "forged-nonce",
      expires: Date.now() + 60_000,
    };
    const response = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(forgedChallenge, "tx-forged"),
        ),
      },
    });

    expect(response.status).toBe(402);
  });

  test("treats malformed proofs as invalid payment attempts instead of a server error", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async () => null,
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const response = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: "not-base64",
      },
    });

    expect(response.status).toBe(402);
  });

  test("rejects transactions when AgentPull logs are unavailable", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async () => {
            const transaction = createPaidTransaction({
              agent,
              authority,
              destination,
              amount: 500_000n,
            });
            return {
              ...transaction,
              meta: {
                ...transaction.meta,
                logMessages: null,
              },
            };
          },
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const challenge = decodePaymentChallenge(
      (await app.request("http://vela.test/")).headers.get(
        PAYMENT_REQUIRED_HEADER,
      )!,
    );
    const response = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(challenge, "tx-without-logs"),
        ),
      },
    });

    expect(response.status).toBe(402);
    expect(await response.text()).toContain("agent_pull");
  });

  test("rejects transactions without the expected Vela agent_pull instruction", async () => {
    const agent = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const destination = Keypair.generate().publicKey;
    const app = new Hono();
    app.use(
      "*",
      createX402Middleware({
        amount: 500_000n,
        agent,
        authority,
        destination,
        connection: {
          getTransaction: async () => {
            const transaction = createPaidTransaction({
              agent,
              authority,
              destination,
              amount: 500_000n,
            });
            return {
              ...transaction,
              transaction: {
                message: {
                  ...transaction.transaction.message,
                  instructions: [],
                },
              },
            };
          },
        } as any,
      }),
    );
    app.get("/", (c) => c.text("paid"));

    const challenge = decodePaymentChallenge(
      (await app.request("http://vela.test/")).headers.get(
        PAYMENT_REQUIRED_HEADER,
      )!,
    );
    const response = await app.request("http://vela.test/", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentProof(
          createPaymentProof(challenge, "tx-without-instruction"),
        ),
      },
    });

    expect(response.status).toBe(402);
    expect(await response.text()).toContain("agent_pull instruction");
  });
});

describe("parseRawAmount", () => {
  test("rejects unsafe, fractional, and negative raw amounts", () => {
    expect(() => parseRawAmount(-1n)).toThrow("Raw amount");
    expect(() => parseRawAmount(-1)).toThrow("Raw amount");
    expect(() => parseRawAmount(1.5)).toThrow("Raw amount");
    expect(() => parseRawAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "Raw amount",
    );
    expect(() => parseRawAmount("-1")).toThrow("Raw amount");
  });

  test("accepts integer base-unit amounts", () => {
    expect(parseRawAmount(0n)).toBe(0n);
    expect(parseRawAmount(500_000)).toBe(500_000n);
    expect(parseRawAmount("500000")).toBe(500_000n);
  });
});
