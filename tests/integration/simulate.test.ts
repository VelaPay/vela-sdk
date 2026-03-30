import { describe, test, expect } from "bun:test";
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
import { resolve } from "node:path";

import {
  buildCreatePlanInstruction,
  buildSubscribeInstruction,
  buildExecutePullInstruction,
  buildCancelInstruction,
  deserializeMandate,
  PROGRAM_ID,
} from "../../src/index";

import idl from "../../idl/vela_protocol.json";

// ── Test helpers (same as client.test.ts) ─────────────────────────────────────

const DECIMALS = 6;

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

// ── Full Billing Cycle Simulation ─────────────────────────────────────────────

describe("Full Billing Cycle Simulation", () => {
  test("full billing cycle completes on LiteSVM: create -> subscribe -> pull x 3 -> cancel", async () => {
    // ── Setup ──
    const soPath = findProgramSo();
    const svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
    svm.addProgramFromFile(PROGRAM_ID, soPath);

    const merchant = Keypair.generate();
    const subscriber = Keypair.generate();

    airdropSol(svm, merchant.publicKey, 10n * BigInt(LAMPORTS_PER_SOL));
    airdropSol(svm, subscriber.publicKey, 5n * BigInt(LAMPORTS_PER_SOL));

    const merchantProvider = new LiteSVMProvider(svm, new Wallet(merchant));
    const merchantProgram = new Program(idl as any, merchantProvider);

    const subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    const subscriberProgram = new Program(idl as any, subscriberProvider);

    // Create USDC
    const usdcMint = await createUsdcMint(merchantProvider);
    const subscriberTokenAccount = await createSplTokenAccount(
      merchantProvider,
      subscriber.publicKey,
      usdcMint,
    );
    const merchantTokenAccount = await createSplTokenAccount(
      merchantProvider,
      merchant.publicKey,
      usdcMint,
    );

    const planAmount = 10_000_000n; // 10 USDC
    const planFrequency = 3_600n; // 1 hour
    const maxPulls = 5n; // 5 max pulls, but we only pull 3 then cancel

    // Mint enough USDC for all pulls + extra
    await mintUsdc(
      merchantProvider,
      usdcMint,
      subscriberTokenAccount,
      planAmount * (maxPulls + 1n),
    );

    // ── 1. Create Plan ──
    const createResult = await buildCreatePlanInstruction(merchantProgram, {
      merchant: merchant.publicKey,
      planId: 0n,
      amount: planAmount,
      frequency: planFrequency,
      maxPulls,
      trialPeriod: 0n,
    });

    svm.expireBlockhash();
    const createTx = new Transaction().add(createResult.instruction);
    await merchantProvider.sendAndConfirm!(createTx, []);

    const planAddress = createResult.planAddress;
    const credentialMintAddress = createResult.credentialMintAddress;

    // ── 2. Subscribe ──
    const subResult = await buildSubscribeInstruction(subscriberProgram, {
      subscriber: subscriber.publicKey,
      planAddress,
      merchantAddress: merchant.publicKey,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    svm.expireBlockhash();
    const subTx = new Transaction().add(subResult.instruction);
    await subscriberProvider.sendAndConfirm!(subTx, []);

    const mandateAddress = subResult.mandateAddress;

    // Verify mandate created correctly
    let rawMandate = await (merchantProgram.account as any).velaMandate.fetch(mandateAddress);
    let mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.status).toBe("active");
    expect(mandate.pullsExecuted).toBe(0n);

    // ── 3. Pull x 3 ──
    for (let i = 0; i < 3; i++) {
      // Read nextPaymentDue and advance clock
      rawMandate = await (merchantProgram.account as any).velaMandate.fetch(mandateAddress);
      mandate = deserializeMandate(mandateAddress, rawMandate);
      advanceClock(svm, mandate.nextPaymentDue);

      const pullResult = await buildExecutePullInstruction(merchantProgram, {
        payer: merchant.publicKey,
        subscriberAddress: subscriber.publicKey,
        merchantAddress: merchant.publicKey,
        planAddress,
        usdcMintAddress: usdcMint,
        mandateAddress,
      });

      svm.expireBlockhash();
      const pullTx = new Transaction().add(pullResult.instruction);
      await merchantProvider.sendAndConfirm!(pullTx, []);
    }

    // Verify pulls executed
    rawMandate = await (merchantProgram.account as any).velaMandate.fetch(mandateAddress);
    mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.pullsExecuted).toBe(3n);

    // Verify USDC transfers
    const merchantAccount = await getAccount(merchantProvider.connection, merchantTokenAccount);
    expect(merchantAccount.amount).toBe(planAmount * 3n);

    const subscriberAccount = await getAccount(
      merchantProvider.connection,
      subscriberTokenAccount,
    );
    // Minted planAmount * (maxPulls + 1n), pulled 3 times
    expect(subscriberAccount.amount).toBe(planAmount * (maxPulls + 1n) - planAmount * 3n);

    // ── 4. Cancel ──
    const cancelResult = await buildCancelInstruction(subscriberProgram, {
      authority: subscriber.publicKey,
      mandateAddress,
      subscriberAddress: subscriber.publicKey,
      planAddress,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    svm.expireBlockhash();
    const cancelTx = new Transaction().add(cancelResult.instruction);
    await subscriberProvider.sendAndConfirm!(cancelTx, []);

    // ── Final Verification ──
    rawMandate = await (merchantProgram.account as any).velaMandate.fetch(mandateAddress);
    mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.pullsExecuted).toBe(3n);
    expect(mandate.status).toBe("cancelled");
  });
});
