import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
  type PublicKey,
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
  buildWrapAndSubscribeInstructions,
  deserializeMandate,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../../src/index";
import {
  bootstrapMerchantCredential,
  bootstrapTokenConfig,
  createToken2022Ata,
  findHookSo,
  installPhase7AdminState,
  insertPullApproval,
} from "./phase7-helpers";

// ── Test helpers (same as client.test.ts) ─────────────────────────────────────

const DECIMALS = 6;

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

async function finalizeBillingRecord(
  svm: LiteSVM,
  program: Program,
  mandateAddress: PublicKey,
  pullsExecuted: bigint,
): Promise<void> {
  const mandateAccount = svm.getAccount(mandateAddress);
  if (!mandateAccount) {
    throw new Error("mandate account missing during simulation finalization");
  }

  const rawMandate = await (program.account as any).velaMandate.fetch(
    mandateAddress,
  );
  const updatedMandate = {
    ...rawMandate,
    lastBillingRecordedPull: new BN(pullsExecuted.toString()),
  };
  const data = await (program.coder.accounts as any).encode(
    "velaMandate",
    updatedMandate,
  );
  svm.setAccount(mandateAddress, {
    ...mandateAccount,
    data: new Uint8Array(data),
  });
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

// ── Full Billing Cycle Simulation ─────────────────────────────────────────────

describe("Full Billing Cycle Simulation", () => {
  test("full billing cycle completes on LiteSVM: create -> wrapAndSubscribe -> pull x 3 -> cancel", async () => {
    // ── Setup ──
    const soPath = findProgramSo();
    const hookSoPath = findHookSo();
    const svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
    svm.addProgramFromFile(PROGRAM_ID, soPath);
    svm.addProgramFromFile(TRANSFER_HOOK_PROGRAM_ID, hookSoPath);

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

    const phase7State = await installPhase7AdminState({
      provider: merchantProvider,
      svm,
      admin: merchant,
      splUsdcMint: usdcMint,
    });
    const wrappedUsdcMint = phase7State.wrappedUsdcMint;
    const wrappingVault = phase7State.wrappingVault;

    const merchantBootstrap = await bootstrapMerchantCredential(
      merchantProvider,
      merchantProgram,
      merchant,
    );
    const credentialMintAddress = merchantBootstrap.credentialMintAddress;

    await bootstrapTokenConfig(
      merchantProvider,
      merchantProgram,
      merchant,
      wrappedUsdcMint,
      "hook",
      DECIMALS,
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
    const merchantWrappedAccount = await createToken2022Ata(
      merchantProvider,
      merchant.publicKey,
      wrappedUsdcMint,
    );

    // ── 2. Wrap + Subscribe ──
    const subResult = await buildWrapAndSubscribeInstructions(
      subscriberProgram,
      {
        subscriber: subscriber.publicKey,
        planAddress,
        merchantAddress: merchant.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        amount: planAmount * (maxPulls + 1n),
        credentialMintAddress,
      },
    );

    await sendInstructions(subscriberProvider, subResult.instructions);

    const mandateAddress = subResult.mandateAddress;

    // Verify mandate created correctly
    let rawMandate = await (merchantProgram.account as any).velaMandate.fetch(
      mandateAddress,
    );
    let mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.status).toBe("active");
    expect(mandate.pullsExecuted).toBe(0n);

    // ── 3. Pull x 3 ──
    for (let i = 0; i < 3; i++) {
      // Read nextPaymentDue and advance clock
      rawMandate = await (merchantProgram.account as any).velaMandate.fetch(
        mandateAddress,
      );
      mandate = deserializeMandate(mandateAddress, rawMandate);
      advanceClock(svm, BigInt(mandate.nextPaymentDue));
      insertPullApproval({
        svm,
        mandate: mandateAddress,
        validUntil: BigInt(mandate.nextPaymentDue),
        approvedAmount: planAmount,
      });

      const pullResult = await buildExecutePullInstruction(
        merchantProgram,
        merchantProvider.connection,
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

      await sendInstructions(merchantProvider, [pullResult.instruction]);
      await finalizeBillingRecord(
        svm,
        merchantProgram,
        mandateAddress,
        BigInt(i + 1),
      );
    }

    // Verify pulls executed
    rawMandate = await (merchantProgram.account as any).velaMandate.fetch(
      mandateAddress,
    );
    mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.pullsExecuted).toBe(3n);

    // Verify wrapped USDC transfers
    const merchantAccount = await getAccount(
      merchantProvider.connection,
      merchantWrappedAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    expect(merchantAccount.amount).toBe(planAmount * 3n);

    // ── 4. Cancel ──
    const cancelResult = await buildCancelInstruction(subscriberProgram, {
      authority: subscriber.publicKey,
      mandateAddress,
      subscriberAddress: subscriber.publicKey,
      planAddress,
      usdcMintAddress: usdcMint,
      credentialMintAddress,
    });

    await sendInstructions(subscriberProvider, [cancelResult.instruction]);

    // ── Final Verification ──
    rawMandate = await (merchantProgram.account as any).velaMandate.fetch(
      mandateAddress,
    );
    mandate = deserializeMandate(mandateAddress, rawMandate);
    expect(mandate.pullsExecuted).toBe(3n);
    expect(mandate.status).toBe("cancelled");
  });
});
