import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import idl from "../../idl/vela_protocol.json";
import {
  buildCancelInstruction,
  buildCreatePlanInstruction,
  buildExecutePullInstruction,
  buildSubscribeInstruction,
  buildWrapAndSubscribeInstructions,
  deriveMerchantStateAddress,
  deserializeMandate,
  deserializePlan,
  PROGRAM_ID,
  PullTooEarlyError,
  TRANSFER_HOOK_PROGRAM_ID,
  translateError,
  validateCancel,
  validatePullPayment,
} from "../../src/index";
import type { VelaMandate, VelaPlan } from "../../src/types";
import {
  bootstrapMerchantCredential,
  bootstrapTokenConfig,
  createToken2022Ata,
  findHookSo,
  installPhase7AdminState,
  insertPullApproval,
} from "./phase7-helpers";

// ── Test helpers ──────────────────────────────────────────────────────────────

const DECIMALS = 6;

// Locate the program .so file (try relative path from project root, then absolute)
function findProgramSo(): string {
  const candidates = [
    resolve(
      __dirname,
      "../../../../vela-protocol/target/deploy/vela_protocol.so",
    ),
    "/Users/laitsky/Developments/vela-labs/vela-protocol/target/deploy/vela_protocol.so",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    `vela_protocol.so not found. Tried: ${candidates.join(", ")}`,
  );
}

function airdropSol(
  svm: LiteSVM,
  pubkey: PublicKey,
  lamports = BigInt(LAMPORTS_PER_SOL),
): void {
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
  const lamports =
    await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

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
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
  );
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
  let wrappedUsdcMint: PublicKey;
  let wrappingVault: PublicKey;

  // Plan + mandate addresses
  let planAddress: PublicKey;
  let credentialMintAddress: PublicKey;
  let mandateAddress: PublicKey;
  let secondaryPlanAddress: PublicKey;
  let secondaryMandateAddress: PublicKey;

  const PLAN_AMOUNT = 25_000_000n; // 25 USDC
  const PLAN_FREQUENCY = 3_600n; // 1 hour
  const PLAN_MAX_PULLS = 4n;
  const PLAN_ID = 0n;

  beforeAll(async () => {
    // Setup LiteSVM
    const soPath = findProgramSo();
    const hookSoPath = findHookSo();
    svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
    svm.addProgramFromFile(PROGRAM_ID, soPath);
    svm.addProgramFromFile(TRANSFER_HOOK_PROGRAM_ID, hookSoPath);

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
    subscriberTokenAccount = await createSplTokenAccount(
      provider,
      subscriber.publicKey,
      usdcMint,
    );
    merchantTokenAccount = await createSplTokenAccount(
      provider,
      merchant.publicKey,
      usdcMint,
    );

    const phase7State = await installPhase7AdminState({
      provider,
      svm,
      admin: merchant,
      splUsdcMint: usdcMint,
    });
    wrappedUsdcMint = phase7State.wrappedUsdcMint;
    wrappingVault = phase7State.wrappingVault;

    const merchantBootstrap = await bootstrapMerchantCredential(
      provider,
      program,
      merchant,
    );
    credentialMintAddress = merchantBootstrap.credentialMintAddress;

    await bootstrapTokenConfig(
      provider,
      program,
      merchant,
      wrappedUsdcMint,
      "hook",
      DECIMALS,
    );

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
    expect(plan.credentialMint.equals(credentialMintAddress)).toBe(true);
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
    const rawMandate = await (program.account as any).velaMandate.fetch(
      mandateAddress,
    );
    const mandate = deserializeMandate(mandateAddress, rawMandate);

    // Verify correct fields
    expect(mandate.status).toBe("active");
    expect(mandate.pullsExecuted).toBe(0n);
    expect(mandate.amount).toBe(PLAN_AMOUNT);
    expect(mandate.frequency).toBe(PLAN_FREQUENCY);
    expect(mandate.maxPulls).toBe(PLAN_MAX_PULLS);
    expect(mandate.subscriber.equals(subscriber.publicKey)).toBe(true);
    expect(mandate.merchant.equals(merchant.publicKey)).toBe(true);
    const mandatePlan = mandate.plan;
    expect(mandatePlan).toBeDefined();
    if (!mandatePlan) {
      throw new Error("Expected subscribe flow to persist a plan reference");
    }
    expect(mandatePlan.equals(planAddress)).toBe(true);
    expect(mandate.address.equals(mandateAddress)).toBe(true);
  });

  // NOTE: pullPayment tests require a fully-initialized Token-2022 protocol
  // (init_wrapped_mint, init_extra_account_meta_list, wrap, PullApproval via Arcium).
  // The end-to-end billing flow is tested in vela-protocol's Rust LiteSVM test suite
  // (test_execute_pull.rs, test_transfer_hook.rs). The SDK builder signature is verified here.

  test("buildExecutePullInstruction builds with new Token-2022 signature", async () => {
    // Verify the builder accepts the new wrapped USDC params without throwing
    // (cannot execute on-chain without full T22 protocol setup in this test env)
    const wrappedUsdcMint = Keypair.generate().publicKey; // placeholder
    const wrappingVault = Keypair.generate().publicKey;

    const pullResult = await buildExecutePullInstruction(
      program,
      provider.connection,
      {
        payer: merchant.publicKey,
        subscriberAddress: subscriber.publicKey,
        merchantAddress: merchant.publicKey,
        planAddress,
        wrappedUsdcMint,
        wrappingVault,
        mandateAddress,
      },
    );

    // Verify the instruction was built (not null/undefined)
    expect(pullResult.instruction).toBeTruthy();
    expect(pullResult.mandateAddress.equals(mandateAddress)).toBe(true);
    const expectedSubscriberWrappedAccount = getAssociatedTokenAddressSync(
      wrappedUsdcMint,
      mandateAddress,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const hasMandateWrappedSource = pullResult.instruction.keys.some((k) =>
      k.pubkey.equals(expectedSubscriberWrappedAccount),
    );
    expect(hasMandateWrappedSource).toBe(true);
    const hasProtocolProgram = pullResult.instruction.keys.some((k) =>
      k.pubkey.equals(PROGRAM_ID),
    );
    expect(hasProtocolProgram).toBe(true);
    const hasHookProgram = pullResult.instruction.keys.some((k) =>
      k.pubkey.equals(TRANSFER_HOOK_PROGRAM_ID),
    );
    expect(hasHookProgram).toBe(true);
    // Verify it references Token-2022 program in the accounts
    const t22ProgramKey = TOKEN_2022_PROGRAM_ID.toBase58();
    const hasT22 = pullResult.instruction.keys.some(
      (k) => k.pubkey.toBase58() === t22ProgramKey,
    );
    expect(hasT22).toBe(true);
  });

  test("buildWrapAndSubscribeInstructions uses a mandate-owned wrapped ATA", async () => {
    const wrappedUsdcMint = Keypair.generate().publicKey;
    const wrappingVault = Keypair.generate().publicKey;

    const result = await buildWrapAndSubscribeInstructions(program, {
      subscriber: subscriber.publicKey,
      planAddress,
      merchantAddress: merchant.publicKey,
      splUsdcMint: usdcMint,
      wrappedUsdcMint,
      wrappingVault,
      amount: PLAN_AMOUNT,
      credentialMintAddress,
    });

    expect(result.instructions).toHaveLength(3);

    const expectedBillingAta = getAssociatedTokenAddressSync(
      wrappedUsdcMint,
      result.mandateAddress,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const ataInstruction = result.instructions[1];
    const wrapInstruction = result.instructions[2];

    expect(
      ataInstruction.keys.some((k) => k.pubkey.equals(expectedBillingAta)),
    ).toBe(true);
    expect(
      wrapInstruction.keys.some((k) => k.pubkey.equals(expectedBillingAta)),
    ).toBe(true);
    expect(
      wrapInstruction.keys.some((k) => k.pubkey.equals(result.mandateAddress)),
    ).toBe(true);
  });

  test("pullPayment succeeds when timing is valid and transfers wrapped USDC", async () => {
    const merchantWrappedAccount = await createToken2022Ata(
      provider,
      merchant.publicKey,
      wrappedUsdcMint,
    );

    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const [merchantStateAddress] = deriveMerchantStateAddress(
      merchant.publicKey,
    );
    const rawMerchantState = await (program.account as any).merchantState.fetch(
      merchantStateAddress,
    );
    const wrappedPlanId = BigInt(rawMerchantState.planCount.toString());
    const wrappedPlan = await buildCreatePlanInstruction(program, {
      merchant: merchant.publicKey,
      planId: wrappedPlanId,
      amount: PLAN_AMOUNT,
      frequency: PLAN_FREQUENCY,
      maxPulls: PLAN_MAX_PULLS,
      trialPeriod: 0n,
    });
    await sendInstructions(provider, [wrappedPlan.instruction]);

    const wrapAndSubscribe = await buildWrapAndSubscribeInstructions(
      subscriberProgram,
      {
        subscriber: subscriber.publicKey,
        planAddress: wrappedPlan.planAddress,
        merchantAddress: merchant.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        amount: PLAN_AMOUNT * 2n,
        credentialMintAddress,
      },
    );
    await sendInstructions(subscriberProvider, wrapAndSubscribe.instructions);

    const wrappedMandateAddress = wrapAndSubscribe.mandateAddress;
    const wrappedMandateRaw = await (program.account as any).velaMandate.fetch(
      wrappedMandateAddress,
    );
    const wrappedMandate = deserializeMandate(
      wrappedMandateAddress,
      wrappedMandateRaw,
    );
    insertPullApproval({
      svm,
      mandate: wrappedMandateAddress,
      validUntil: BigInt(wrappedMandate.nextPaymentDue),
      approvedAmount: PLAN_AMOUNT,
    });
    advanceClock(svm, BigInt(wrappedMandate.nextPaymentDue));

    const result = await buildExecutePullInstruction(
      program,
      provider.connection,
      {
        payer: merchant.publicKey,
        subscriberAddress: subscriber.publicKey,
        merchantAddress: merchant.publicKey,
        planAddress: wrappedPlan.planAddress,
        wrappedUsdcMint,
        wrappingVault,
        mandateAddress: wrappedMandateAddress,
      },
    );
    await sendInstructions(provider, [result.instruction]);

    const pulledMandateRaw = await (program.account as any).velaMandate.fetch(
      wrappedMandateAddress,
    );
    const pulledMandate = deserializeMandate(
      wrappedMandateAddress,
      pulledMandateRaw,
    );

    expect(result.mandateAddress.equals(wrappedMandateAddress)).toBe(true);
    expect(pulledMandate.pullsExecuted).toBe(1n);

    const merchantWrapped = await getAccount(
      provider.connection,
      merchantWrappedAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    expect(merchantWrapped.amount).toBe(PLAN_AMOUNT);
  });

  test("pullPayment throws PullTooEarlyError when called before next_payment_due", async () => {
    await createToken2022Ata(provider, merchant.publicKey, wrappedUsdcMint);

    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const [merchantStateAddress] = deriveMerchantStateAddress(
      merchant.publicKey,
    );
    const rawMerchantState = await (program.account as any).merchantState.fetch(
      merchantStateAddress,
    );
    const wrappedPlanId = BigInt(rawMerchantState.planCount.toString());
    const wrappedPlan = await buildCreatePlanInstruction(program, {
      merchant: merchant.publicKey,
      planId: wrappedPlanId,
      amount: PLAN_AMOUNT,
      frequency: PLAN_FREQUENCY,
      maxPulls: PLAN_MAX_PULLS,
      trialPeriod: 0n,
    });
    await sendInstructions(provider, [wrappedPlan.instruction]);

    const wrapAndSubscribe = await buildWrapAndSubscribeInstructions(
      subscriberProgram,
      {
        subscriber: subscriber.publicKey,
        planAddress: wrappedPlan.planAddress,
        merchantAddress: merchant.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        amount: PLAN_AMOUNT * 2n,
        credentialMintAddress,
      },
    );
    await sendInstructions(subscriberProvider, wrapAndSubscribe.instructions);

    const wrappedMandateAddress = wrapAndSubscribe.mandateAddress;
    const wrappedMandateRaw = await (program.account as any).velaMandate.fetch(
      wrappedMandateAddress,
    );
    const wrappedMandate = deserializeMandate(
      wrappedMandateAddress,
      wrappedMandateRaw,
    );
    insertPullApproval({
      svm,
      mandate: wrappedMandateAddress,
      validUntil: BigInt(wrappedMandate.nextPaymentDue),
      approvedAmount: PLAN_AMOUNT,
    });
    advanceClock(svm, BigInt(wrappedMandate.nextPaymentDue) - 1n);

    const pull = await buildExecutePullInstruction(
      program,
      provider.connection,
      {
        payer: merchant.publicKey,
        subscriberAddress: subscriber.publicKey,
        merchantAddress: merchant.publicKey,
        planAddress: wrappedPlan.planAddress,
        wrappedUsdcMint,
        wrappingVault,
        mandateAddress: wrappedMandateAddress,
      },
    );

    try {
      await sendInstructions(provider, [pull.instruction]);
      throw new Error("expected execute_pull to fail before next_payment_due");
    } catch (error) {
      const translated = translateError(error, { method: "pullPayment" });
      expect(translated).toBeInstanceOf(PullTooEarlyError);
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
    const rawMandate = await (program.account as any).velaMandate.fetch(
      mandateAddress,
    );
    const mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.status).toBe("cancelled");
  });

  test("multiple subscriptions can be fetched individually by address", async () => {
    // Create a second plan + subscription for the same subscriber so we have data
    const [merchantStateAddress] = deriveMerchantStateAddress(
      merchant.publicKey,
    );
    const rawMerchantState = await (program.account as any).merchantState.fetch(
      merchantStateAddress,
    );
    const nextPlanId = BigInt(rawMerchantState.planCount.toString());
    const result2 = await buildCreatePlanInstruction(program, {
      merchant: merchant.publicKey,
      planId: nextPlanId,
      amount: 50_000_000n,
      frequency: 7_200n,
      maxPulls: 2n,
      trialPeriod: 0n,
    });

    svm.expireBlockhash();
    const createTx = new Transaction().add(result2.instruction);
    await provider.sendAndConfirm!(createTx, []);

    secondaryPlanAddress = result2.planAddress;

    // Subscribe as subscriber
    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    const subResult = await buildSubscribeInstruction(subscriberProgram, {
      subscriber: subscriber.publicKey,
      planAddress: secondaryPlanAddress,
      merchantAddress: merchant.publicKey,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    svm.expireBlockhash();
    const subTx = new Transaction().add(subResult.instruction);
    await subscriberProvider.sendAndConfirm!(subTx, []);

    // Fetch both mandates individually using derived addresses
    // (LiteSVM does not support getProgramAccounts, so we fetch by known PDA)
    secondaryMandateAddress = subResult.mandateAddress;

    const rawMandate1 = await (program.account as any).velaMandate.fetch(
      mandateAddress,
    );
    const mandate1 = deserializeMandate(mandateAddress, rawMandate1);

    const rawMandate2 = await (program.account as any).velaMandate.fetch(
      secondaryMandateAddress,
    );
    const mandate2 = deserializeMandate(secondaryMandateAddress, rawMandate2);

    // Both belong to the same subscriber
    expect(mandate1.subscriber.equals(subscriber.publicKey)).toBe(true);
    expect(mandate2.subscriber.equals(subscriber.publicKey)).toBe(true);

    // Verify one is cancelled (from earlier test) and one is active
    const statuses = [mandate1.status, mandate2.status].sort();
    expect(statuses).toEqual(["active", "cancelled"]);
  });

  test("validate.pullPayment returns canPull:false for cancelled mandate", async () => {
    // Use the mandate from earlier tests that was cancelled
    const result = await validatePullPayment(
      program,
      provider.connection,
      mandateAddress,
    );

    expect(result.canPull).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("cancelled"))).toBe(true);
  });

  test("validate.cancel returns canCancel:false for cancelled mandate", async () => {
    const result = await validateCancel(
      program,
      mandateAddress,
      subscriber.publicKey,
    );

    expect(result.canCancel).toBe(false);
    expect(result.reasons.some((r) => r.includes("cancelled"))).toBe(true);
  });

  test("all returned numeric fields are bigint", async () => {
    // Fetch the second mandate (active one)
    const rawMandate = await (program.account as any).velaMandate.fetch(
      secondaryMandateAddress,
    );
    const mandate = deserializeMandate(secondaryMandateAddress, rawMandate);

    // Check every numeric field is bigint
    expect(typeof mandate.amount).toBe("bigint");
    expect(typeof mandate.frequency).toBe("bigint");
    expect(typeof mandate.startDate).toBe("bigint");
    expect(typeof mandate.expiry).toBe("bigint");
    expect(typeof mandate.maxPulls).toBe("bigint");
    expect(typeof mandate.pullsExecuted).toBe("bigint");
    expect(typeof mandate.nextPaymentDue).toBe("bigint");

    // Fetch plan and check
    const rawPlan = await (program.account as any).velaPlan.fetch(
      secondaryPlanAddress,
    );
    const plan = deserializePlan(secondaryPlanAddress, rawPlan);

    expect(typeof plan.amount).toBe("bigint");
    expect(typeof plan.frequency).toBe("bigint");
    expect(typeof plan.trialPeriod).toBe("bigint");
    expect(typeof plan.maxPulls).toBe("bigint");
    expect(typeof plan.planId).toBe("bigint");
  });
});
