import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import type {
  VelaClientConfig,
  VelaCreatePlanParams,
  VelaSubscribeParams,
  VelaPullParams,
  VelaCancelParams,
  VelaMethodResult,
  VelaMandate,
  VelaPlan,
  ValidationResult,
  SubscribeValidationResult,
  CancelValidationResult,
} from "./types";
import {
  buildCreatePlanInstruction,
  buildSubscribeInstruction,
  buildExecutePullInstruction,
  buildCancelInstruction,
} from "./instructions";
import {
  getActiveSubscriptions,
  getPlanDetails,
  getMerchantState,
  deserializeMandate,
  deserializePlan,
} from "./accounts";
import { translateError } from "./errors";
import { ALTManager } from "./alt/lookup-table";
import {
  validatePullPayment,
  validateSubscribe,
  validateCancel,
} from "./validators";
import { createHeliusConnection } from "./helius/provider";
import idl from "../idl/vela_protocol.json";

/**
 * The VelaClient interface returned by createVelaClient.
 *
 * Three API layers:
 * 1. Convenience methods (top-level): sign, send, confirm, return enriched result
 * 2. Raw instruction builders (instructions.*): return TransactionInstruction
 * 3. Pre-flight validators (validate.*): read-only checks, no transaction
 */
export interface VelaClient {
  // Convenience layer -- signs, sends, confirms, returns enriched result
  createPlan: (params: VelaCreatePlanParams) => Promise<VelaMethodResult<VelaPlan>>;
  createSubscription: (params: VelaSubscribeParams) => Promise<VelaMethodResult<VelaMandate>>;
  pullPayment: (params: VelaPullParams) => Promise<VelaMethodResult<VelaMandate>>;
  cancelSubscription: (params: VelaCancelParams & { usdcMintAddress: PublicKey }) => Promise<VelaMethodResult<VelaMandate>>;
  getActiveSubscriptions: (filter: { subscriber?: PublicKey; merchant?: PublicKey }) => Promise<VelaMandate[]>;
  getPlanDetails: (planAddress: PublicKey) => Promise<VelaPlan>;

  // Raw instruction layer
  instructions: {
    createPlan: (params: VelaCreatePlanParams & { planId: bigint }) => ReturnType<typeof buildCreatePlanInstruction>;
    subscribe: (params: VelaSubscribeParams & { credentialMintAddress?: PublicKey }) => ReturnType<typeof buildSubscribeInstruction>;
    executePull: (params: VelaPullParams) => ReturnType<typeof buildExecutePullInstruction>;
    cancel: (params: VelaCancelParams & { usdcMintAddress: PublicKey; credentialMintAddress?: PublicKey }) => ReturnType<typeof buildCancelInstruction>;
  };

  // Validation layer
  validate: {
    pullPayment: (mandateAddress: PublicKey) => Promise<ValidationResult>;
    subscribe: (planAddress: PublicKey) => Promise<SubscribeValidationResult>;
    cancel: (mandateAddress: PublicKey) => Promise<CancelValidationResult>;
  };

  // Exposed internals for advanced use
  program: Program;
  connection: Connection;
}

/**
 * Creates a VelaClient with Stripe-like ergonomics.
 *
 * Usage:
 * ```ts
 * const vela = createVelaClient({
 *   connection,
 *   wallet,
 *   commitment: "confirmed",
 * });
 *
 * // Convenience: sign + send + confirm
 * const { signature, address } = await vela.createPlan({ amount: 10_000_000n, frequency: 2_592_000n, maxPulls: 12n });
 *
 * // Raw: get instruction for composability
 * const { instruction } = await vela.instructions.createPlan({ amount: 10_000_000n, frequency: 2_592_000n, maxPulls: 12n, planId: 0n });
 *
 * // Validate: pre-flight check without transaction
 * const { canPull, reasons } = await vela.validate.pullPayment(mandateAddress);
 * ```
 */
export function createVelaClient(config: VelaClientConfig): VelaClient {
  const {
    wallet,
    commitment = "confirmed",
    programId = PROGRAM_ID,
  } = config;

  let { connection } = config;

  // Lazy Helius connection upgrade
  let heliusConnectionPromise: Promise<Connection> | null = null;
  if (config.heliusApiKey) {
    heliusConnectionPromise = createHeliusConnection(config.heliusApiKey).then(
      (conn) => {
        connection = conn;
        return conn;
      },
    );
  }

  // Create Anchor provider and program
  const provider = new AnchorProvider(connection, wallet as any, { commitment });
  const program = new Program(idl as any, provider);

  // ALT manager for Versioned Transactions
  const altManager = new ALTManager();

  /**
   * Signs and sends a V0 transaction with ALT, returning the signature.
   */
  async function sendV0Transaction(
    instructions: import("@solana/web3.js").TransactionInstruction[],
  ): Promise<string> {
    // Wait for Helius connection if initializing
    if (heliusConnectionPromise) {
      await heliusConnectionPromise;
    }

    const signAndSend = async (tx: VersionedTransaction): Promise<string> => {
      const signed = await wallet.signTransaction(tx as any);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, commitment);
      return sig;
    };

    const alt = await altManager.getOrCreateALT(connection, wallet.publicKey, signAndSend);
    const { blockhash } = await connection.getLatestBlockhash(commitment);
    const tx = altManager.buildV0Transaction(
      wallet.publicKey,
      instructions,
      blockhash,
      [alt],
    );

    return signAndSend(tx);
  }

  /**
   * Wraps an async function with error translation.
   */
  async function wrapWithErrorTranslation<T>(
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw translateError(err, context);
    }
  }

  const client: VelaClient = {
    // ── Convenience Layer ──────────────────────────────────────────────
    createPlan: (params: VelaCreatePlanParams) =>
      wrapWithErrorTranslation(async () => {
        // Fetch merchant state to get current plan_count (= next planId)
        let planId: bigint;
        try {
          const state = await getMerchantState(program, wallet.publicKey);
          planId = state.planCount;
        } catch {
          // MerchantState doesn't exist yet -- this is the first plan (planId = 0)
          planId = 0n;
        }

        const { instruction, planAddress } = await buildCreatePlanInstruction(
          program,
          { ...params, merchant: wallet.publicKey, planId },
        );

        const signature = await sendV0Transaction([instruction]);

        // Fetch created plan for enriched result
        const plan = await getPlanDetails(program, planAddress);

        return { signature, address: planAddress, data: plan };
      }, { method: "createPlan" }),

    createSubscription: (params: VelaSubscribeParams) =>
      wrapWithErrorTranslation(async () => {
        const { instruction, mandateAddress } = await buildSubscribeInstruction(
          program,
          { ...params, subscriber: wallet.publicKey },
        );

        const signature = await sendV0Transaction([instruction]);

        // Fetch created mandate
        const raw = await (program.account as any).velaMandate.fetch(mandateAddress);
        const mandate = deserializeMandate(mandateAddress, raw);

        return { signature, address: mandateAddress, data: mandate };
      }, { method: "createSubscription" }),

    pullPayment: (params: VelaPullParams) =>
      wrapWithErrorTranslation(async () => {
        const { instruction, mandateAddress } = await buildExecutePullInstruction(
          program,
          { ...params, payer: wallet.publicKey },
        );

        const signature = await sendV0Transaction([instruction]);

        // Fetch updated mandate
        const raw = await (program.account as any).velaMandate.fetch(mandateAddress);
        const mandate = deserializeMandate(mandateAddress, raw);

        return { signature, address: mandateAddress, data: mandate };
      }, { method: "pullPayment" }),

    cancelSubscription: (params: VelaCancelParams & { usdcMintAddress: PublicKey }) =>
      wrapWithErrorTranslation(async () => {
        const { instruction, mandateAddress } = await buildCancelInstruction(
          program,
          { ...params, authority: wallet.publicKey },
        );

        const signature = await sendV0Transaction([instruction]);

        // Fetch updated mandate
        const raw = await (program.account as any).velaMandate.fetch(mandateAddress);
        const mandate = deserializeMandate(mandateAddress, raw);

        return { signature, address: mandateAddress, data: mandate };
      }, { method: "cancelSubscription" }),

    getActiveSubscriptions: (filter) =>
      getActiveSubscriptions(program, filter),

    getPlanDetails: (planAddress) =>
      getPlanDetails(program, planAddress),

    // ── Raw Instruction Layer ──────────────────────────────────────────
    instructions: {
      createPlan: (params) =>
        buildCreatePlanInstruction(program, {
          ...params,
          merchant: wallet.publicKey,
        }),
      subscribe: (params) =>
        buildSubscribeInstruction(program, {
          ...params,
          subscriber: wallet.publicKey,
        }),
      executePull: (params) =>
        buildExecutePullInstruction(program, {
          ...params,
          payer: wallet.publicKey,
        }),
      cancel: (params) =>
        buildCancelInstruction(program, {
          ...params,
          authority: wallet.publicKey,
        }),
    },

    // ── Validation Layer ───────────────────────────────────────────────
    validate: {
      pullPayment: (mandateAddress) =>
        validatePullPayment(program, connection, mandateAddress),
      subscribe: (planAddress) =>
        validateSubscribe(program, planAddress, wallet.publicKey),
      cancel: (mandateAddress) =>
        validateCancel(program, mandateAddress, wallet.publicKey),
    },

    // ── Exposed Internals ──────────────────────────────────────────────
    program,
    connection,
  };

  return client;
}
