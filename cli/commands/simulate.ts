import type { Command } from "commander";
import { BN, Program, Wallet } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getAssociatedTokenAddressSync,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { join } from "node:path";
import { existsSync } from "node:fs";
import idl from "../../idl/vela_protocol.json";
import { PROGRAM_ID } from "../../src/constants";
import { formatDuration, formatLamports } from "../utils/formatting";

const DECIMALS = 6;

/**
 * Registers the `vela simulate` command (CLI-05, D-07).
 *
 * Spins up an in-process LiteSVM, deploys the vela-protocol program, and runs
 * a full billing cycle: create plan -> subscribe -> pull x N -> cancel.
 *
 * No external validator needed. Deterministic and fast.
 */
export function registerSimulate(parent: Command): void {
  parent
    .command("simulate")
    .description("Run a full billing cycle simulation on embedded LiteSVM")
    .option("--pulls <count>", "Number of pull payments to simulate", "3")
    .option("--amount <usdc>", "Plan amount in USDC", "25")
    .option("--frequency <seconds>", "Billing frequency in seconds", "2592000")
    .action(async (opts) => {
      const numPulls = parseInt(opts.pulls);
      const amount = BigInt(Math.round(parseFloat(opts.amount) * 1_000_000));
      const frequency = BigInt(opts.frequency);

      console.log("\n--- VelaPay Billing Simulation ---\n");
      console.log(`Amount: ${opts.amount} USDC per period`);
      console.log(`Frequency: ${formatDuration(frequency)}`);
      console.log(`Pulls to simulate: ${numPulls}\n`);

      // 1. Initialize LiteSVM
      const programSoPath = findProgramBinary();
      console.log(`Program binary: ${programSoPath}\n`);

      const svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
      svm.addProgramFromFile(PROGRAM_ID, programSoPath);

      const merchant = Keypair.generate();
      const subscriber = Keypair.generate();
      svm.airdrop(merchant.publicKey, 10n * BigInt(LAMPORTS_PER_SOL));
      svm.airdrop(subscriber.publicKey, 10n * BigInt(LAMPORTS_PER_SOL));

      // Create provider with merchant as default signer
      const merchantProvider = new LiteSVMProvider(svm, new Wallet(merchant));
      const program = new Program(idl as never, merchantProvider) as Program<any>;

      // 2. Setup USDC mock mint
      console.log("Step 1: Setting up USDC mint...");
      const usdcMint = await createMockUsdcMint(merchantProvider);
      const subscriberTokenAccount = await createTokenAccount(
        merchantProvider,
        subscriber.publicKey,
        usdcMint,
      );
      const merchantTokenAccount = await createTokenAccount(
        merchantProvider,
        merchant.publicKey,
        usdcMint,
      );
      const fundAmount = amount * BigInt(numPulls + 1);
      await mintTokens(
        merchantProvider,
        usdcMint,
        subscriberTokenAccount,
        fundAmount,
      );
      console.log(`  USDC Mint: ${usdcMint.toBase58()}`);
      console.log(`  Subscriber funded: ${formatLamports(fundAmount)}\n`);

      // 3. Create plan
      console.log("Step 2: Creating subscription plan...");
      const planId = 0n;
      const maxPulls = BigInt(numPulls);
      const trialPeriod = 0n;

      const planAddresses = derivePlanAddresses(
        merchant.publicKey,
        planId,
      );

      svm.expireBlockhash();
      await (program as any).methods
        .createPlan(
          new BN(amount.toString()),
          new BN(frequency.toString()),
          new BN(trialPeriod.toString()),
          new BN(maxPulls.toString()),
        )
        .accounts({
          merchant: merchant.publicKey,
          merchantState: planAddresses.merchantState,
          plan: planAddresses.plan,
          credentialMint: planAddresses.credentialMint,
          systemProgram: SystemProgram.programId,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log(`  Plan: ${planAddresses.plan.toBase58()}`);
      console.log(`  Amount: ${formatLamports(amount)}`);
      console.log(`  Frequency: ${formatDuration(frequency)}`);
      console.log(`  Max Pulls: ${maxPulls.toString()}\n`);

      // 4. Subscribe
      console.log("Step 3: Subscribing...");
      const mandate = deriveMandateAddress(
        subscriber.publicKey,
        planAddresses.plan,
      );
      const credentialAta = getAssociatedTokenAddressSync(
        planAddresses.credentialMint,
        subscriber.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Switch to subscriber signer
      const subscriberProvider = new LiteSVMProvider(
        svm,
        new Wallet(subscriber),
      );
      const subscriberProgram = new Program(
        idl as never,
        subscriberProvider,
      ) as Program<any>;

      svm.expireBlockhash();
      await (subscriberProgram as any).methods
        .subscribe()
        .accounts({
          subscriber: subscriber.publicKey,
          merchant: merchant.publicKey,
          plan: planAddresses.plan,
          mandate,
          subscriberTokenAccount,
          usdcMint,
          credentialMint: planAddresses.credentialMint,
          subscriberCredentialAccount: credentialAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log(`  Mandate: ${mandate.toBase58()}`);
      console.log(`  Subscriber: ${subscriber.publicKey.toBase58()}\n`);

      // 5. Pull payments with time advancement
      // Get the mandate's start time from the clock
      const baseTimestamp = Number(svm.getClock().unixTimestamp);

      for (let i = 1; i <= numPulls; i++) {
        console.log(`Step ${3 + i}: Pull payment ${i}/${numPulls}...`);

        // Advance clock to the next payment period
        const nextTime = BigInt(baseTimestamp) + frequency * BigInt(i);
        advanceClock(svm, nextTime);

        // CRITICAL: expire blockhash before each transaction after clock manipulation
        svm.expireBlockhash();

        // Use merchant provider for pull (permissionless -- any payer works)
        const pullProgram = new Program(
          idl as never,
          merchantProvider,
        ) as Program<any>;

        await (pullProgram as any).methods
          .executePull()
          .accounts({
            payer: merchant.publicKey,
            subscriber: subscriber.publicKey,
            merchant: merchant.publicKey,
            plan: planAddresses.plan,
            mandate,
            subscriberTokenAccount,
            merchantTokenAccount,
            usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        // Fetch updated mandate to show pulls_executed
        const mandateAccount = await (pullProgram.account as any).velaMandate.fetch(mandate);
        const pullsExecuted = Number(mandateAccount.pullsExecuted.toString());
        console.log(
          `  Pulled: ${formatLamports(amount)} (${pullsExecuted}/${numPulls} total)`,
        );
        console.log(
          `  Clock: ${new Date(Number(nextTime) * 1000).toISOString()}\n`,
        );
      }

      // 6. Cancel (only if mandate is still active -- all pulls exhausted means it's already done)
      console.log(`Step ${4 + numPulls}: Cancelling subscription...`);

      // Check if mandate is still active before attempting cancel
      const finalMandate = await (program.account as any).velaMandate.fetch(mandate);
      const isActive = finalMandate.status.active !== undefined;

      if (isActive) {
        svm.expireBlockhash();
        await (subscriberProgram as any).methods
          .cancel()
          .accounts({
            authority: subscriber.publicKey,
            subscriber: subscriber.publicKey,
            plan: planAddresses.plan,
            mandate,
            subscriberCredentialAccount: credentialAta,
            credentialMint: planAddresses.credentialMint,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            subscriberTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        console.log("  Subscription cancelled.\n");
      } else {
        console.log("  All pulls exhausted -- mandate already complete (skipping cancel).\n");
      }

      console.log("--- Simulation Complete ---\n");
      console.log(
        `Total pulled: ${formatLamports(amount * BigInt(numPulls))} over ${numPulls} periods`,
      );
      console.log(`Merchant: ${merchant.publicKey.toBase58()}`);
      console.log(`Subscriber: ${subscriber.publicKey.toBase58()}`);
      console.log("");
    });
}

// ── Helper functions ──────────────────────────────────────────────────

/**
 * Finds the vela_protocol.so binary at known paths.
 * Throws a clear error if not found.
 */
function findProgramBinary(): string {
  const candidates = [
    // From vela-sdk directory
    join(process.cwd(), "..", "vela-protocol", "target", "deploy", "vela_protocol.so"),
    // From workspace root
    join(process.cwd(), "vela-protocol", "target", "deploy", "vela_protocol.so"),
    // Absolute fallback for common locations
    join(process.cwd(), "target", "deploy", "vela_protocol.so"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "Program binary not found. Build vela-protocol first:\n  cd vela-protocol && anchor build\n\n" +
      `Searched paths:\n${candidates.map((p) => `  - ${p}`).join("\n")}`,
  );
}

/**
 * Derives all PDA addresses for a plan.
 */
function derivePlanAddresses(
  merchant: PublicKey,
  planId: bigint,
): { merchantState: PublicKey; plan: PublicKey; credentialMint: PublicKey } {
  const planIdSeed = new BN(planId.toString()).toArrayLike(Buffer, "le", 8);
  const [merchantState] = PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), merchant.toBuffer()],
    PROGRAM_ID,
  );
  const [plan] = PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), merchant.toBuffer(), planIdSeed],
    PROGRAM_ID,
  );
  const [credentialMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), merchant.toBuffer(), planIdSeed],
    PROGRAM_ID,
  );
  return { merchantState, plan, credentialMint };
}

/**
 * Derives the mandate PDA address.
 */
function deriveMandateAddress(
  subscriber: PublicKey,
  plan: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mandate"), subscriber.toBuffer(), plan.toBuffer()],
    PROGRAM_ID,
  )[0];
}

/**
 * Advances the LiteSVM clock to a specific unix timestamp.
 */
function advanceClock(svm: LiteSVM, unixTimestamp: bigint): void {
  const clock = svm.getClock();
  clock.unixTimestamp = unixTimestamp;
  svm.setClock(clock);
}

/**
 * Sends instructions via LiteSVMProvider with blockhash expiration.
 */
async function sendInstructions(
  provider: LiteSVMProvider,
  instructions: Parameters<Transaction["add"]>,
  signers: Keypair[] = [],
): Promise<string> {
  provider.client.expireBlockhash();
  const tx = new Transaction().add(...instructions);
  return provider.sendAndConfirm!(tx, signers);
}

/**
 * Creates a mock USDC mint (SPL Token, 6 decimals).
 */
async function createMockUsdcMint(
  provider: LiteSVMProvider,
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
        provider.wallet.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    ],
    [mint],
  );

  return mint.publicKey;
}

/**
 * Creates an associated token account for the given owner and mint.
 */
async function createTokenAccount(
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

/**
 * Mints tokens to a destination account.
 */
async function mintTokens(
  provider: LiteSVMProvider,
  mint: PublicKey,
  destination: PublicKey,
  tokenAmount: bigint,
): Promise<void> {
  await sendInstructions(provider, [
    createMintToInstruction(
      mint,
      destination,
      provider.wallet.publicKey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ]);
}
