import { beforeAll, describe, expect, test } from "bun:test";
import { BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  Transaction,
} from "@solana/web3.js";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import { velaProgramIdl } from "../../src/idl";
import {
  buildAdminCancelInstruction,
  buildCreatePlanInstruction,
  buildExecutePullInstruction,
  buildPauseProtocolInstruction,
  buildUnpauseProtocolInstruction,
  buildWrapAndSubscribeInstructions,
  deserializeMandate,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../../src/index";
import {
  hasProtocolBuildArtifacts,
  requireProtocolProgramSo,
} from "../helpers/protocol-artifacts";
import {
  bootstrapMerchantCredential,
  bootstrapTokenConfig,
  createToken2022Ata,
  findHookSo,
  sendInstructions as helperSendInstructions,
  insertPullApproval,
  installPhase7AdminState,
} from "./phase7-helpers";

// ── Test helpers ──────────────────────────────────────────────────────────────

const DECIMALS = 6;

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

// ── Emergency Instructions Integration Tests ──────────────────────────────────

describe.skipIf(!hasProtocolBuildArtifacts())("emergency instructions", () => {
  let svm: LiteSVM;

  // Admin (protocol admin) keypair -- must match the admin in installPhase7AdminState
  let admin: Keypair;

  // Subscriber and plan setup
  let planAddress: PublicKey;
  let credentialMintAddress: PublicKey;
  let mandateAddress: PublicKey;

  // Wrapped USDC infrastructure
  let wrappedUsdcMint: PublicKey;
  let wrappingVault: PublicKey;

  // Programs/providers for each actor
  let adminProvider: LiteSVMProvider;
  let adminProgram: Program;
  let subscriberProvider: LiteSVMProvider;
  let subscriberProgram: Program;

  const PLAN_AMOUNT = 10_000_000n; // 10 USDC
  const PLAN_FREQUENCY = 3_600n; // 1 hour
  const PLAN_MAX_PULLS = 5n;

  beforeAll(async () => {
    const soPath = requireProtocolProgramSo();
    const hookSoPath = findHookSo();
    svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
    svm.addProgramFromFile(PROGRAM_ID, soPath);
    svm.addProgramFromFile(TRANSFER_HOOK_PROGRAM_ID, hookSoPath);

    admin = Keypair.generate();
    const subscriber = Keypair.generate();

    airdropSol(svm, admin.publicKey, 10n * BigInt(LAMPORTS_PER_SOL));
    airdropSol(svm, subscriber.publicKey, 5n * BigInt(LAMPORTS_PER_SOL));

    adminProvider = new LiteSVMProvider(svm, new Wallet(admin));
    adminProgram = new Program(velaProgramIdl as any, adminProvider);

    subscriberProvider = new LiteSVMProvider(svm, new Wallet(subscriber));
    subscriberProgram = new Program(velaProgramIdl as any, subscriberProvider);

    // Create a minimal SPL USDC mint for wrapping infrastructure
    const {
      createMintToInstruction,
      createInitializeMint2Instruction,
      MINT_SIZE,
    } = await import("@solana/spl-token");
    const { SystemProgram } = await import("@solana/web3.js");

    const splUsdcMintKp = Keypair.generate();
    const lamports =
      await adminProvider.connection.getMinimumBalanceForRentExemption(
        MINT_SIZE,
      );

    await sendInstructions(
      adminProvider,
      [
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: splUsdcMintKp.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(
          splUsdcMintKp.publicKey,
          DECIMALS,
          admin.publicKey,
          null,
          TOKEN_PROGRAM_ID,
        ),
      ],
      [splUsdcMintKp],
    );

    const splUsdcMint = splUsdcMintKp.publicKey;

    // Install Phase 7 admin state (ProtocolConfig + KeeperConfig + wrapped mint)
    // Admin is used as the keeper authority as well in the test setup
    const adminState = await installPhase7AdminState({
      provider: adminProvider,
      svm,
      admin,
      splUsdcMint,
    });
    wrappedUsdcMint = adminState.wrappedUsdcMint;
    wrappingVault = adminState.wrappingVault;

    const merchantBootstrap = await bootstrapMerchantCredential(
      adminProvider,
      adminProgram,
      admin,
    );
    credentialMintAddress = merchantBootstrap.credentialMintAddress;

    await bootstrapTokenConfig(
      adminProvider,
      adminProgram,
      admin,
      wrappedUsdcMint,
      "hook",
      DECIMALS,
    );

    // Create subscriber's SPL USDC account and mint tokens
    const subscriberSplAccount = getAssociatedTokenAddressSync(
      splUsdcMint,
      subscriber.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );
    await sendInstructions(adminProvider, [
      createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        subscriberSplAccount,
        subscriber.publicKey,
        splUsdcMint,
        TOKEN_PROGRAM_ID,
      ),
    ]);
    await sendInstructions(adminProvider, [
      createMintToInstruction(
        splUsdcMint,
        subscriberSplAccount,
        admin.publicKey,
        PLAN_AMOUNT * (PLAN_MAX_PULLS + 2n),
        [],
        TOKEN_PROGRAM_ID,
      ),
    ]);

    // Create merchant ATA for wrapped USDC (to receive pull payments)
    await createToken2022Ata(adminProvider, admin.publicKey, wrappedUsdcMint);

    // Create plan
    const createResult = await buildCreatePlanInstruction(adminProgram, {
      merchant: admin.publicKey,
      planId: 0n,
      amount: PLAN_AMOUNT,
      frequency: PLAN_FREQUENCY,
      maxPulls: PLAN_MAX_PULLS,
      trialPeriod: 0n,
    });
    adminProvider.client.expireBlockhash();
    const createTx = new Transaction().add(createResult.instruction);
    await adminProvider.sendAndConfirm!(createTx, []);

    planAddress = createResult.planAddress;

    // Wrap USDC and subscribe
    const subResult = await buildWrapAndSubscribeInstructions(
      subscriberProgram,
      {
        subscriber: subscriber.publicKey,
        planAddress,
        merchantAddress: admin.publicKey,
        splUsdcMint,
        wrappedUsdcMint,
        wrappingVault,
        amount: PLAN_AMOUNT * (PLAN_MAX_PULLS + 2n),
        credentialMintAddress,
      },
    );
    await helperSendInstructions(subscriberProvider, subResult.instructions);
    mandateAddress = subResult.mandateAddress;
  });

  // ── pause/unpause protocol ──────────────────────────────────────────────────

  describe("pause/unpause protocol", () => {
    test("pause_protocol sets paused=true on ProtocolConfig", async () => {
      const { instruction } = await buildPauseProtocolInstruction(
        adminProgram,
        {
          authority: admin.publicKey,
        },
      );
      await sendInstructions(adminProvider, [instruction]);

      // Fetch ProtocolConfig and verify paused=true
      const raw = await (adminProgram.account as any).protocolConfig.fetch(
        (await import("../../src/accounts")).deriveConfigAddress(PROGRAM_ID)[0],
      );
      expect(raw.paused).toBe(true);
      // LiteSVM clock may start at 0; paused_at is set to unix_timestamp which can be 0
      expect(Number(raw.pausedAt)).toBeGreaterThanOrEqual(0);
    });

    test("execute_pull fails with ProtocolPaused when paused", async () => {
      // Protocol is already paused from previous test
      const rawMandate = await (adminProgram.account as any).velaMandate.fetch(
        mandateAddress,
      );
      const mandate = deserializeMandate(mandateAddress, rawMandate);

      advanceClock(svm, mandate.nextPaymentDue);
      insertPullApproval({
        svm,
        mandate: mandateAddress,
        periodStart: mandate.nextPaymentDue - mandate.frequency,
        periodEnd: mandate.nextPaymentDue,
        validUntil: mandate.nextPaymentDue,
        approvedAmount: PLAN_AMOUNT,
      });

      const pullResult = await buildExecutePullInstruction(
        adminProgram,
        adminProvider.connection,
        {
          payer: admin.publicKey,
          subscriberAddress: mandate.subscriber,
          merchantAddress: mandate.merchant,
          planAddress,
          wrappedUsdcMint,
          wrappingVault,
          mandateAddress,
        },
      );

      let threw = false;
      try {
        await sendInstructions(adminProvider, [pullResult.instruction]);
      } catch (err) {
        threw = true;
        const msg = String(err);
        // Custom error code 6044 = ProtocolPaused
        expect(
          msg.includes("ProtocolPaused") ||
            msg.includes("6044") ||
            msg.includes("0x17AC"),
        ).toBe(true);
      }
      expect(threw).toBe(true);
    });

    test("unpause_protocol sets paused=false on ProtocolConfig", async () => {
      const { instruction } = await buildUnpauseProtocolInstruction(
        adminProgram,
        {
          authority: admin.publicKey,
        },
      );
      await sendInstructions(adminProvider, [instruction]);

      const raw = await (adminProgram.account as any).protocolConfig.fetch(
        (await import("../../src/accounts")).deriveConfigAddress(PROGRAM_ID)[0],
      );
      expect(raw.paused).toBe(false);
      expect(Number(raw.pausedAt)).toBe(0);
    });

    test("execute_pull succeeds after unpause", async () => {
      // Protocol is unpaused -- pull should succeed
      const rawMandate = await (adminProgram.account as any).velaMandate.fetch(
        mandateAddress,
      );
      const mandate = deserializeMandate(mandateAddress, rawMandate);

      // Advance clock and insert approval
      advanceClock(svm, mandate.nextPaymentDue);
      insertPullApproval({
        svm,
        mandate: mandateAddress,
        periodStart: mandate.nextPaymentDue - mandate.frequency,
        periodEnd: mandate.nextPaymentDue,
        validUntil: mandate.nextPaymentDue,
        approvedAmount: PLAN_AMOUNT,
      });

      const pullResult = await buildExecutePullInstruction(
        adminProgram,
        adminProvider.connection,
        {
          payer: admin.publicKey,
          subscriberAddress: mandate.subscriber,
          merchantAddress: mandate.merchant,
          planAddress,
          wrappedUsdcMint,
          wrappingVault,
          mandateAddress,
        },
      );

      // Should not throw
      const sig = await sendInstructions(adminProvider, [
        pullResult.instruction,
      ]);
      expect(typeof sig).toBe("string");
      expect(sig.length).toBeGreaterThan(0);
    });

    test("non-admin cannot pause protocol", async () => {
      // subscriber is not the admin
      const nonAdminProgram = subscriberProgram;
      const { instruction } = await buildPauseProtocolInstruction(
        nonAdminProgram,
        {
          authority: subscriberProgram.provider.publicKey!,
        },
      );

      let threw = false;
      try {
        await sendInstructions(subscriberProvider, [instruction]);
      } catch (err) {
        threw = true;
        const msg = String(err);
        expect(
          msg.includes("UnauthorizedAdmin") ||
            msg.includes("6016") ||
            msg.includes("0x1790"),
        ).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });

  // ── admin cancel ────────────────────────────────────────────────────────────

  describe("admin cancel", () => {
    // Each sub-test needs its own mandate since cancellation is final.
    // We reuse the shared mandate for the first test, and create a fresh one for others.

    let freshSubscriber: Keypair;
    let freshMandateAddress: PublicKey;

    beforeAll(async () => {
      // Create a fresh subscriber + mandate for the subsequent tests
      const { createMintToInstruction } = await import("@solana/spl-token");
      const { SystemProgram } = await import("@solana/web3.js");

      // Get SPL USDC mint from wrapping vault's owner
      // We'll create another subscriber
      freshSubscriber = Keypair.generate();
      airdropSol(svm, freshSubscriber.publicKey, 5n * BigInt(LAMPORTS_PER_SOL));

      const freshSubscriberProvider = new LiteSVMProvider(
        svm,
        new Wallet(freshSubscriber),
      );
      const freshSubscriberProgram = new Program(
        velaProgramIdl as any,
        freshSubscriberProvider,
      );

      // We need SPL USDC mint -- get it from the vault's token account
      // Derive it from the wrapping vault mint authority pattern
      // Instead, create a second plan with the same wrapped USDC to avoid fetching SPL mint
      // Re-use the existing plan (planAddress). We need fresh subscriber to subscribe.
      const { createInitializeMint2Instruction, MINT_SIZE } = await import(
        "@solana/spl-token"
      );

      // For simplicity, mint SPL USDC directly to fresh subscriber using admin as authority
      // We need to find the SPL USDC mint -- look at vault's token account
      // Actually the simplest approach: get it from the existing subscribed mandate
      // Get the SPL USDC mint by reading the wrapping vault token account's mint field
      // SPL token account layout: first 32 bytes = mint pubkey
      const vaultInfo =
        await adminProvider.connection.getAccountInfo(wrappingVault);
      if (!vaultInfo) throw new Error("wrapping vault not found");
      const splUsdcMint = new (await import("@solana/web3.js")).PublicKey(
        vaultInfo.data.slice(0, 32),
      );

      const freshSubscriberSplAccount = getAssociatedTokenAddressSync(
        splUsdcMint,
        freshSubscriber.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );
      await sendInstructions(adminProvider, [
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          freshSubscriberSplAccount,
          freshSubscriber.publicKey,
          splUsdcMint,
          TOKEN_PROGRAM_ID,
        ),
      ]);
      await sendInstructions(adminProvider, [
        createMintToInstruction(
          splUsdcMint,
          freshSubscriberSplAccount,
          admin.publicKey,
          PLAN_AMOUNT * (PLAN_MAX_PULLS + 2n),
          [],
          TOKEN_PROGRAM_ID,
        ),
      ]);

      // Subscribe fresh subscriber to the same plan
      const freshSubResult = await buildWrapAndSubscribeInstructions(
        freshSubscriberProgram,
        {
          subscriber: freshSubscriber.publicKey,
          planAddress,
          merchantAddress: admin.publicKey,
          splUsdcMint,
          wrappedUsdcMint,
          wrappingVault,
          amount: PLAN_AMOUNT * (PLAN_MAX_PULLS + 2n),
          credentialMintAddress,
        },
      );
      await helperSendInstructions(
        freshSubscriberProvider,
        freshSubResult.instructions,
      );
      freshMandateAddress = freshSubResult.mandateAddress;
    });

    test("admin can cancel active mandate", async () => {
      // Admin cancels the fresh mandate
      const { instruction } = await buildAdminCancelInstruction(adminProgram, {
        authority: admin.publicKey,
        mandateAddress: freshMandateAddress,
        subscriberAddress: freshSubscriber.publicKey,
        planAddress,
        credentialMintAddress,
      });

      await sendInstructions(adminProvider, [instruction]);

      // Verify mandate is now cancelled
      const raw = await (adminProgram.account as any).velaMandate.fetch(
        freshMandateAddress,
      );
      const mandate = deserializeMandate(freshMandateAddress, raw);
      expect(mandate.status).toBe("cancelled");

      // Verify credential token was burned (balance = 0)
      const credentialAta = getAssociatedTokenAddressSync(
        credentialMintAddress,
        freshSubscriber.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const { getAccount } = await import("@solana/spl-token");
      const credAccount = await getAccount(
        adminProvider.connection,
        credentialAta,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );
      expect(credAccount.amount).toBe(0n);
    });

    test("non-admin cannot admin-cancel mandate", async () => {
      // Non-admin (subscriber) tries to admin-cancel the main mandate
      const { instruction } = await buildAdminCancelInstruction(
        subscriberProgram,
        {
          authority: subscriberProgram.provider.publicKey!,
          mandateAddress,
          subscriberAddress: subscriberProgram.provider.publicKey!,
          planAddress,
          credentialMintAddress,
        },
      );

      let threw = false;
      try {
        await sendInstructions(subscriberProvider, [instruction]);
      } catch (err) {
        threw = true;
        const msg = String(err);
        expect(
          msg.includes("UnauthorizedAdmin") ||
            msg.includes("6016") ||
            msg.includes("0x1790"),
        ).toBe(true);
      }
      expect(threw).toBe(true);
    });

    test("admin cancel on already-cancelled mandate fails", async () => {
      // freshMandateAddress was already cancelled in the first admin cancel test.
      // Attempting again should fail with MandateNotActive.
      const { instruction } = await buildAdminCancelInstruction(adminProgram, {
        authority: admin.publicKey,
        mandateAddress: freshMandateAddress,
        subscriberAddress: freshSubscriber.publicKey,
        planAddress,
        credentialMintAddress,
      });

      let threw = false;
      try {
        await sendInstructions(adminProvider, [instruction]);
      } catch (err) {
        threw = true;
        const msg = String(err);
        // MandateNotActive = 6001
        expect(
          msg.includes("MandateNotActive") ||
            msg.includes("6001") ||
            msg.includes("0x1771"),
        ).toBe(true);
      }
      expect(threw).toBe(true);
    });
  });
});
