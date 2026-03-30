import { describe, test, expect, beforeAll } from "bun:test";
import { BN, Program, Wallet } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  buildCreatePlanInstruction,
  buildSubscribeInstruction,
  buildExecutePullInstruction,
  buildCancelInstruction,
  deserializeMandate,
  deserializePlan,
  derivePlanAddress,
  deriveMandateAddress,
  deriveMerchantStateAddress,
  deriveCredentialMintAddress,
  translateError,
  PullTooEarlyError,
  MandateNotActiveError,
  validatePullPayment,
  validateCancel,
  PROGRAM_ID,
} from "../../src/index";

import type { VelaMandate, VelaPlan } from "../../src/types";

import idl from "../../idl/vela_protocol.json";

// ── Test helpers ──────────────────────────────────────────────────────────────

const DECIMALS = 6;

// Locate the program .so file (try relative path from project root, then absolute)
function findProgramSo(): string {
  const candidates = [
    resolve(__dirname, "../../../../vela-protocol/target/deploy/vela_protocol.so"),
    "/Users/laitsky/Developments/vela-labs/vela-protocol/target/deploy/vela_protocol.so",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    `vela_protocol.so not found. Tried: ${candidates.join(", ")}`,
  );
}

function airdropSol(svm: LiteSVM, pubkey: PublicKey, lamports = BigInt(LAMPORTS_PER_SOL)): void {
  svm.airdrop(pubkey, lamports);
}

function advanceClock(svm: LiteSVM, unixTimestamp: bigint): void {
  const clock = svm.getClock();
  clock.unixTimestamp = unixTimestamp;
  svm.setClock(clock);
}

async function sendInstructions(
  provider: LiteSVMProvider,
  instructions: Parameters<Transaction["add"]>,
  signers: Keypair[] = [],
): Promise<string> {
  provider.client.expireBlockhash();
  const tx = new Transaction().add(...instructions);
  return provider.sendAndConfirm!(tx, signers);
}

async function createUsdcMint(
  provider: LiteSVMProvider,
  mintAuthority = provider.wallet.publicKey,
): Promise<PublicKey> {
  const mint = Keypair.generate();
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  await sendInstructions(
    provider,
    [
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mint.publicKey,
        DECIMALS,
        mintAuthority,
        null,
        TOKEN_PROGRAM_ID,
      ),
    ],
    [mint],
  );

  return mint.publicKey;
}

async function createSplTokenAccount(
  provider: LiteSVMProvider,
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  await sendInstructions(provider, [
    createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
    ),
  ]);
  return ata;
}

async function mintUsdc(
  provider: LiteSVMProvider,
  mint: PublicKey,
  destination: PublicKey,
  amount: bigint,
): Promise<string> {
  return sendInstructions(provider, [
    createMintToInstruction(
      mint,
      destination,
      provider.wallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ]);
}

// ── Integration Tests ─────────────────────────────────────────────────────────

describe("SDK Client Integration", () => {
  let svm: LiteSVM;
  let provider: LiteSVMProvider;
  let program: Program;
  let merchant: Keypair;
  let subscriber: Keypair;
  let usdcMint: PublicKey;
  let subscriberTokenAccount: PublicKey;
  let merchantTokenAccount: PublicKey;

  // Plan + mandate addresses
  let planAddress: PublicKey;
  let credentialMintAddress: PublicKey;
  let mandateAddress: PublicKey;

  const PLAN_AMOUNT = 25_000_000n; // 25 USDC
  const PLAN_FREQUENCY = 3_600n; // 1 hour
  const PLAN_MAX_PULLS = 4n;
  const PLAN_ID = 0n;

  beforeAll(async () => {
    // Setup LiteSVM
    const soPath = findProgramSo();
    svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
    svm.addProgramFromFile(PROGRAM_ID, soPath);

    // Create keypairs
    merchant = Keypair.generate();
    subscriber = Keypair.generate();

    // Airdrop SOL
    airdropSol(svm, merchant.publicKey, 10n * BigInt(LAMPORTS_PER_SOL));
    airdropSol(svm, subscriber.publicKey, 5n * BigInt(LAMPORTS_PER_SOL));

    // Create provider and program (merchant as signer)
    provider = new LiteSVMProvider(svm, new Wallet(merchant));
    program = new Program(idl as any, provider);

    // Create USDC mint and token accounts
    usdcMint = await createUsdcMint(provider);
    subscriberTokenAccount = await createSplTokenAccount(provider, subscriber.publicKey, usdcMint);
    merchantTokenAccount = await createSplTokenAccount(provider, merchant.publicKey, usdcMint);

    // Mint USDC to subscriber (enough for all pulls + extra)
    await mintUsdc(
      provider,
      usdcMint,
      subscriberTokenAccount,
      PLAN_AMOUNT * (PLAN_MAX_PULLS + 1n),
    );
  });

  test("createPlan returns VelaPlan with correct fields and bigint types", async () => {
    // Build create_plan instruction via SDK instruction builder
    const result = await buildCreatePlanInstruction(program, {
      merchant: merchant.publicKey,
      planId: PLAN_ID,
      amount: PLAN_AMOUNT,
      frequency: PLAN_FREQUENCY,
      maxPulls: PLAN_MAX_PULLS,
      trialPeriod: 0n,
    });

    planAddress = result.planAddress;
    credentialMintAddress = result.credentialMintAddress;

    // Send the instruction via LiteSVM
    svm.expireBlockhash();
    const tx = new Transaction().add(result.instruction);
    await provider.sendAndConfirm!(tx, []);

    // Fetch and deserialize the plan using SDK helpers
    const rawPlan = await (program.account as any).velaPlan.fetch(planAddress);
    const plan = deserializePlan(planAddress, rawPlan);

    // Verify correct fields
    expect(plan.amount).toBe(PLAN_AMOUNT);
    expect(plan.frequency).toBe(PLAN_FREQUENCY);
    expect(plan.maxPulls).toBe(PLAN_MAX_PULLS);
    expect(plan.merchant.equals(merchant.publicKey)).toBe(true);
    expect(plan.status).toBe("active");
    expect(plan.planId).toBe(PLAN_ID);
    expect(plan.address.equals(planAddress)).toBe(true);

    // Verify all numeric fields are bigint (not BN)
    expect(typeof plan.amount).toBe("bigint");
    expect(typeof plan.frequency).toBe("bigint");
    expect(typeof plan.maxPulls).toBe("bigint");
    expect(typeof plan.planId).toBe("bigint");
    expect(typeof plan.trialPeriod).toBe("bigint");
  });

  test("createSubscription creates mandate with correct fields", async () => {
    // Build subscribe instruction (as subscriber)
    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const result = await buildSubscribeInstruction(subscriberProgram, {
      subscriber: subscriber.publicKey,
      planAddress,
      merchantAddress: merchant.publicKey,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    mandateAddress = result.mandateAddress;

    // Send via LiteSVM
    svm.expireBlockhash();
    const tx = new Transaction().add(result.instruction);
    await subscriberProvider.sendAndConfirm!(tx, []);

    // Fetch and deserialize mandate
    const rawMandate = await (program.account as any).velaMandate.fetch(mandateAddress);
    const mandate = deserializeMandate(mandateAddress, rawMandate);

    // Verify correct fields
    expect(mandate.status).toBe("active");
    expect(mandate.pullsExecuted).toBe(0n);
    expect(mandate.amount).toBe(PLAN_AMOUNT);
    expect(mandate.frequency).toBe(PLAN_FREQUENCY);
    expect(mandate.maxPulls).toBe(PLAN_MAX_PULLS);
    expect(mandate.subscriber.equals(subscriber.publicKey)).toBe(true);
    expect(mandate.merchant.equals(merchant.publicKey)).toBe(true);
    expect(mandate.plan.equals(planAddress)).toBe(true);
    expect(mandate.address.equals(mandateAddress)).toBe(true);
  });

  test("pullPayment succeeds when timing is valid and transfers USDC", async () => {
    // Read mandate to get nextPaymentDue
    const rawBefore = await (program.account as any).velaMandate.fetch(mandateAddress);
    const mandateBefore = deserializeMandate(mandateAddress, rawBefore);

    // Advance clock past nextPaymentDue
    advanceClock(svm, mandateBefore.nextPaymentDue);

    // Get subscriber balance before
    const subAccountBefore = await getAccount(provider.connection, subscriberTokenAccount);
    const subBalanceBefore = subAccountBefore.amount;

    // Build and send execute_pull instruction
    const pullResult = await buildExecutePullInstruction(program, {
      payer: merchant.publicKey,
      subscriberAddress: subscriber.publicKey,
      merchantAddress: merchant.publicKey,
      planAddress,
      usdcMintAddress: usdcMint,
      mandateAddress,
    });

    svm.expireBlockhash();
    const tx = new Transaction().add(pullResult.instruction);
    await provider.sendAndConfirm!(tx, []);

    // Verify mandate.pullsExecuted incremented
    const rawAfter = await (program.account as any).velaMandate.fetch(mandateAddress);
    const mandateAfter = deserializeMandate(mandateAddress, rawAfter);
    expect(mandateAfter.pullsExecuted).toBe(1n);

    // Verify subscriber balance decreased
    const subAccountAfter = await getAccount(provider.connection, subscriberTokenAccount);
    expect(subBalanceBefore - subAccountAfter.amount).toBe(PLAN_AMOUNT);

    // Verify merchant received funds
    const merchantAccount = await getAccount(provider.connection, merchantTokenAccount);
    expect(merchantAccount.amount).toBe(PLAN_AMOUNT);
  });

  test("pullPayment throws PullTooEarlyError when called before next_payment_due", async () => {
    // Do NOT advance clock -- try to pull immediately after previous pull
    const pullResult = await buildExecutePullInstruction(program, {
      payer: merchant.publicKey,
      subscriberAddress: subscriber.publicKey,
      merchantAddress: merchant.publicKey,
      planAddress,
      usdcMintAddress: usdcMint,
      mandateAddress,
    });

    svm.expireBlockhash();
    const tx = new Transaction().add(pullResult.instruction);

    try {
      await provider.sendAndConfirm!(tx, []);
      throw new Error("Should have thrown PullTooEarlyError");
    } catch (e: any) {
      // If it's our sentinel error, that means the tx didn't fail
      if (e.message === "Should have thrown PullTooEarlyError") {
        throw e;
      }
      // Verify translateError produces PullTooEarlyError
      const velaError = translateError(e);
      expect(velaError).toBeInstanceOf(PullTooEarlyError);
      expect(velaError.code).toBe(6000);
    }
  });

  test("cancelSubscription sets mandate to cancelled", async () => {
    // Cancel as subscriber
    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const cancelResult = await buildCancelInstruction(subscriberProgram, {
      authority: subscriber.publicKey,
      mandateAddress,
      subscriberAddress: subscriber.publicKey,
      planAddress,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    svm.expireBlockhash();
    const tx = new Transaction().add(cancelResult.instruction);
    await subscriberProvider.sendAndConfirm!(tx, []);

    // Fetch mandate and verify cancelled
    const rawMandate = await (program.account as any).velaMandate.fetch(mandateAddress);
    const mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.status).toBe("cancelled");
  });

  test("multiple subscriptions can be fetched individually by address", async () => {
    // Create a second plan + subscription for the same subscriber so we have data
    const result2 = await buildCreatePlanInstruction(program, {
      merchant: merchant.publicKey,
      planId: 1n,
      amount: 50_000_000n,
      frequency: 7_200n,
      maxPulls: 2n,
      trialPeriod: 0n,
    });

    svm.expireBlockhash();
    const createTx = new Transaction().add(result2.instruction);
    await provider.sendAndConfirm!(createTx, []);

    const plan2Address = result2.planAddress;
    const credMint2 = result2.credentialMintAddress;

    // Subscribe as subscriber
    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const subResult = await buildSubscribeInstruction(subscriberProgram, {
      subscriber: subscriber.publicKey,
      planAddress: plan2Address,
      merchantAddress: merchant.publicKey,
      usdcMintAddress: usdcMint,
      credentialMintAddress: credMint2,
    });

    svm.expireBlockhash();
    const subTx = new Transaction().add(subResult.instruction);
    await subscriberProvider.sendAndConfirm!(subTx, []);

    // Fetch both mandates individually using derived addresses
    // (LiteSVM does not support getProgramAccounts, so we fetch by known PDA)
    const mandate2Address = subResult.mandateAddress;

    const rawMandate1 = await (program.account as any).velaMandate.fetch(mandateAddress);
    const mandate1 = deserializeMandate(mandateAddress, rawMandate1);

    const rawMandate2 = await (program.account as any).velaMandate.fetch(mandate2Address);
    const mandate2 = deserializeMandate(mandate2Address, rawMandate2);

    // Both belong to the same subscriber
    expect(mandate1.subscriber.equals(subscriber.publicKey)).toBe(true);
    expect(mandate2.subscriber.equals(subscriber.publicKey)).toBe(true);

    // Verify one is cancelled (from earlier test) and one is active
    const statuses = [mandate1.status, mandate2.status].sort();
    expect(statuses).toEqual(["active", "cancelled"]);
  });

  test("validate.pullPayment returns canPull:false for cancelled mandate", async () => {
    // Use the mandate from earlier tests that was cancelled
    const result = await validatePullPayment(program, provider.connection, mandateAddress);

    expect(result.canPull).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("cancelled"))).toBe(true);
  });

  test("validate.cancel returns canCancel:false for cancelled mandate", async () => {
    const result = await validateCancel(program, mandateAddress, subscriber.publicKey);

    expect(result.canCancel).toBe(false);
    expect(result.reasons.some((r) => r.includes("cancelled"))).toBe(true);
  });

  test("all returned numeric fields are bigint", async () => {
    // Fetch the second mandate (active one)
    const [mandate2Address] = deriveMandateAddress(
      subscriber.publicKey,
      derivePlanAddress(merchant.publicKey, 1n, program.programId)[0],
      program.programId,
    );
    const rawMandate = await (program.account as any).velaMandate.fetch(mandate2Address);
    const mandate = deserializeMandate(mandate2Address, rawMandate);

    // Check every numeric field is bigint
    expect(typeof mandate.amount).toBe("bigint");
    expect(typeof mandate.frequency).toBe("bigint");
    expect(typeof mandate.startDate).toBe("bigint");
    expect(typeof mandate.expiry).toBe("bigint");
    expect(typeof mandate.maxPulls).toBe("bigint");
    expect(typeof mandate.pullsExecuted).toBe("bigint");
    expect(typeof mandate.nextPaymentDue).toBe("bigint");

    // Fetch plan and check
    const plan2Address = derivePlanAddress(merchant.publicKey, 1n, program.programId)[0];
    const rawPlan = await (program.account as any).velaPlan.fetch(plan2Address);
    const plan = deserializePlan(plan2Address, rawPlan);

    expect(typeof plan.amount).toBe("bigint");
    expect(typeof plan.frequency).toBe("bigint");
    expect(typeof plan.trialPeriod).toBe("bigint");
    expect(typeof plan.maxPulls).toBe("bigint");
    expect(typeof plan.planId).toBe("bigint");
  });
});
