import { describe, expect, mock, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// We test the validators by mocking the Anchor program account fetches.
// The validators use program.account.velaMandate.fetch() and program.account.velaPlan.fetch().

/**
 * Helper to create a mock mandate in Anchor's deserialized format (BN fields, enum objects).
 */
function createMockMandate(
  overrides: {
    status?: { active?: {} } | { cancelled?: {} } | { expired?: {} };
    nextPaymentDue?: number;
    pullsExecuted?: number;
    maxPulls?: number;
    expiry?: number;
    subscriber?: PublicKey;
  } = {},
) {
  const subscriber = overrides.subscriber ?? Keypair.generate().publicKey;
  return {
    subscriber,
    plan: Keypair.generate().publicKey,
    merchant: Keypair.generate().publicKey,
    amount: new BN(10_000_000),
    frequency: new BN(2_592_000), // 30 days
    startDate: new BN(Math.floor(Date.now() / 1000) - 86400), // started yesterday
    expiry: new BN(overrides.expiry ?? 0),
    maxPulls: new BN(overrides.maxPulls ?? 12),
    pullsExecuted: new BN(overrides.pullsExecuted ?? 0),
    nextPaymentDue: new BN(
      overrides.nextPaymentDue ?? Math.floor(Date.now() / 1000) - 3600, // 1 hour ago by default (ready to pull)
    ),
    status: overrides.status ?? { active: {} },
    bump: 255,
  };
}

/**
 * Helper to create a mock plan in Anchor's deserialized format.
 */
function createMockPlan(
  overrides: { status?: { active?: {} } | { inactive?: {} } } = {},
) {
  return {
    merchant: Keypair.generate().publicKey,
    planId: new BN(0),
    amount: new BN(10_000_000),
    frequency: new BN(2_592_000),
    trialPeriod: new BN(0),
    maxPulls: new BN(12),
    status: overrides.status ?? { active: {} },
    credentialMint: Keypair.generate().publicKey,
    bump: 254,
  };
}

/**
 * Creates a mock Anchor Program with controllable account fetches.
 */
function createMockProgram(
  opts: {
    mandate?: ReturnType<typeof createMockMandate> | Error;
    plan?: ReturnType<typeof createMockPlan> | Error;
  } = {},
) {
  return {
    programId: new PublicKey("BhgXzh4E6e9xsgNrsPf9q1JqXKxETxjc9LBqx3D8cAKC"),
    account: {
      velaMandate: {
        fetch: mock(async () => {
          if (opts.mandate instanceof Error) throw opts.mandate;
          return opts.mandate ?? createMockMandate();
        }),
      },
      velaPlan: {
        fetch: mock(async () => {
          if (opts.plan instanceof Error) throw opts.plan;
          return opts.plan ?? createMockPlan();
        }),
      },
    },
  } as any;
}

// Dynamically import to use mocked program
const { validatePullPayment, validateSubscribe, validateCancel } = await import(
  "../../src/validators/preflight"
);

const mockConnection = {} as any;

describe("validatePullPayment", () => {
  test("active mandate with valid timing returns canPull: true", async () => {
    const mandate = createMockMandate();
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.mandate).toBeDefined();
    expect(result.mandate.status).toBe("active");
  });

  test("cancelled mandate returns canPull: false", async () => {
    const mandate = createMockMandate({ status: { cancelled: {} } });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons).toContain("Mandate is cancelled");
  });

  test("mandate with future nextPaymentDue returns canPull: false", async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 86400; // 1 day in the future
    const mandate = createMockMandate({ nextPaymentDue: futureTime });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toMatch(/Next payment not due until/);
  });

  test("mandate where pullsExecuted >= maxPulls returns canPull: false", async () => {
    const mandate = createMockMandate({ pullsExecuted: 12, maxPulls: 12 });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons).toContain("All 12 pulls exhausted");
  });

  test("expired mandate returns canPull: false", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 86400; // expired yesterday
    const mandate = createMockMandate({ expiry: pastExpiry });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons).toContain("Mandate has expired");
  });

  test("multiple failure reasons accumulate", async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 86400;
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600;
    const mandate = createMockMandate({
      status: { cancelled: {} },
      nextPaymentDue: futureTime,
      pullsExecuted: 12,
      maxPulls: 12,
      expiry: pastExpiry,
    });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    // Should have at least 4 reasons: cancelled + timing + pulls + expiry
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  test("mandate with maxPulls=0 fails pull validation", async () => {
    const mandate = createMockMandate({ pullsExecuted: 100, maxPulls: 0 });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons).toContain("All 0 pulls exhausted");
  });

  test("deserialized mandate has bigint fields", async () => {
    const mandate = createMockMandate();
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validatePullPayment(
      program,
      mockConnection,
      mandateAddress,
    );

    expect(typeof result.mandate.amount).toBe("bigint");
    expect(typeof result.mandate.frequency).toBe("bigint");
    expect(typeof result.mandate.nextPaymentDue).toBe("bigint");
    expect(typeof result.mandate.pullsExecuted).toBe("bigint");
    expect(typeof result.mandate.maxPulls).toBe("bigint");
  });
});

describe("validateSubscribe", () => {
  test("active plan with no existing mandate returns canSubscribe: true", async () => {
    const plan = createMockPlan();
    const program = createMockProgram({
      plan,
      mandate: new Error("Account does not exist"),
    });
    const planAddress = Keypair.generate().publicKey;
    const subscriber = Keypair.generate().publicKey;

    const result = await validateSubscribe(program, planAddress, subscriber);

    expect(result.canSubscribe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("inactive plan returns canSubscribe: false", async () => {
    const plan = createMockPlan({ status: { inactive: {} } });
    const program = createMockProgram({
      plan,
      mandate: new Error("Account does not exist"),
    });
    const planAddress = Keypair.generate().publicKey;
    const subscriber = Keypair.generate().publicKey;

    const result = await validateSubscribe(program, planAddress, subscriber);

    expect(result.canSubscribe).toBe(false);
    expect(result.reasons).toContain("Plan is inactive");
  });

  test("existing mandate returns canSubscribe: false", async () => {
    const plan = createMockPlan();
    const mandate = createMockMandate();
    const program = createMockProgram({ plan, mandate });
    const planAddress = Keypair.generate().publicKey;
    const subscriber = Keypair.generate().publicKey;

    const result = await validateSubscribe(program, planAddress, subscriber);

    expect(result.canSubscribe).toBe(false);
    expect(result.reasons).toContain(
      "Subscription already exists for this subscriber and plan",
    );
  });
});

describe("validateCancel", () => {
  test("active mandate with matching authority returns canCancel: true", async () => {
    const subscriber = Keypair.generate().publicKey;
    const mandate = createMockMandate({ subscriber });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validateCancel(program, mandateAddress, subscriber);

    expect(result.canCancel).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("non-subscriber authority returns canCancel: false", async () => {
    const subscriber = Keypair.generate().publicKey;
    const wrongAuthority = Keypair.generate().publicKey;
    const mandate = createMockMandate({ subscriber });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validateCancel(
      program,
      mandateAddress,
      wrongAuthority,
    );

    expect(result.canCancel).toBe(false);
    expect(result.reasons).toContain(
      "Only the subscriber can cancel their mandate",
    );
  });

  test("cancelled mandate returns canCancel: false", async () => {
    const subscriber = Keypair.generate().publicKey;
    const mandate = createMockMandate({
      subscriber,
      status: { cancelled: {} },
    });
    const program = createMockProgram({ mandate });
    const mandateAddress = Keypair.generate().publicKey;

    const result = await validateCancel(program, mandateAddress, subscriber);

    expect(result.canCancel).toBe(false);
    expect(result.reasons).toContain("Mandate is cancelled");
  });
});
