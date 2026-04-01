import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type {
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import idl from "../idl/vela_protocol.json";
import {
  deserializeMandate,
  deserializePlan,
  getActiveSubscriptions,
  getMerchantState,
  getPlanDetails,
} from "./accounts";
import { ALTManager } from "./alt/lookup-table";
import { PROGRAM_ID } from "./constants";
import { translateError } from "./errors";
import { createHeliusConnection } from "./helius/provider";
import {
  buildCancelInstruction,
  buildCreatePlanInstruction,
  buildExecutePullInstruction,
  buildInitKeeperConfigInstruction,
  buildSubscribeInstruction,
  buildUnwrapInstruction,
  buildUpdateKeeperConfigInstruction,
  buildWrapAndSubscribeInstructions,
  buildWrapInstruction,
} from "./instructions";
import {
  cancelBillingSchedule,
  fetchKeeperConfig,
  registerBillingSchedule,
} from "./schedule";
import type { KeeperScheduleOptions } from "./schedule";
import type {
  BillingScheduleParams,
  CancelValidationResult,
  InitKeeperConfigParams,
  KeeperConfig,
  VelaCancelParams,
  VelaClientConfig,
  VelaCreatePlanParams,
  VelaMandate,
  VelaMethodResult,
  VelaPlan,
  VelaPullParams,
  VelaSubmitUsageReportParams,
  VelaSubscribeParams,
  SubscribablePlan,
  VelaUnwrapParams,
  VelaUsagePlanParams,
  VelaWrapAndSubscribeParams,
  VelaWrapParams,
  SubscribeValidationResult,
  UpdateKeeperConfigParams,
  UsagePlanAccount,
  UsageReportAccount,
  ValidationResult,
} from "./types";
import {
  createUsagePlan as usageCreateUsagePlan,
  submitUsageReport as usageSubmitUsageReport,
} from "./usage";
import {
  validateCancel,
  validatePullPayment,
  validateSubscribe,
} from "./validators";

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
  createPlan: (
    params: VelaCreatePlanParams,
  ) => Promise<VelaMethodResult<VelaPlan>>;
  createSubscription: (
    params: VelaSubscribeParams,
  ) => Promise<VelaMethodResult<VelaMandate>>;
  pullPayment: (
    params: VelaPullParams,
  ) => Promise<VelaMethodResult<VelaMandate>>;
  cancelSubscription: (
    params: VelaCancelParams & { usdcMintAddress: PublicKey },
  ) => Promise<VelaMethodResult<VelaMandate>>;
  wrap: (params: VelaWrapParams) => Promise<VelaMethodResult<void>>;
  unwrap: (params: VelaUnwrapParams) => Promise<VelaMethodResult<void>>;
  wrapAndSubscribe: (
    params: VelaWrapAndSubscribeParams,
  ) => Promise<VelaMethodResult<VelaMandate>>;
  getActiveSubscriptions: (filter: {
    subscriber?: PublicKey;
    merchant?: PublicKey;
  }) => Promise<VelaMandate[]>;
  getPlanDetails: (planAddress: PublicKey) => Promise<VelaPlan>;
  registerBillingSchedule: (
    params: BillingScheduleParams,
    options?: KeeperScheduleOptions | string,
  ) => Promise<{ success: boolean; scheduleId?: string; error?: string }>;
  cancelBillingSchedule: (
    mandateAddress: PublicKey,
    options?: KeeperScheduleOptions | string,
  ) => Promise<{ success: boolean; error?: string }>;
  initKeeperConfig: (
    params: InitKeeperConfigParams,
  ) => Promise<VelaMethodResult<KeeperConfig>>;
  updateKeeperConfig: (
    params: UpdateKeeperConfigParams,
  ) => Promise<VelaMethodResult<KeeperConfig>>;

  // Usage-based billing
  createUsagePlan: (
    params: VelaUsagePlanParams,
  ) => Promise<{ usagePlanAddress: PublicKey; txSignature: string }>;
  submitUsageReport: (
    params: VelaSubmitUsageReportParams,
  ) => Promise<{ usageReportAddress: PublicKey; txSignature: string }>;
  getUsagePlan: (usagePlanAddress: PublicKey) => Promise<UsagePlanAccount>;
  getUsageReport: (usageReportAddress: PublicKey) => Promise<UsageReportAccount>;

  // Raw instruction layer
  instructions: {
    createPlan: (
      params: VelaCreatePlanParams & { planId: bigint },
    ) => ReturnType<typeof buildCreatePlanInstruction>;
    subscribe: (
      params: VelaSubscribeParams & { credentialMintAddress?: PublicKey },
    ) => ReturnType<typeof buildSubscribeInstruction>;
    executePull: (
      params: VelaPullParams,
    ) => ReturnType<typeof buildExecutePullInstruction>;
    cancel: (
      params: VelaCancelParams & {
        usdcMintAddress: PublicKey;
        credentialMintAddress?: PublicKey;
      },
    ) => ReturnType<typeof buildCancelInstruction>;
    wrap: (params: VelaWrapParams) => ReturnType<typeof buildWrapInstruction>;
    unwrap: (
      params: VelaUnwrapParams,
    ) => ReturnType<typeof buildUnwrapInstruction>;
    wrapAndSubscribe: (
      params: VelaWrapAndSubscribeParams,
    ) => ReturnType<typeof buildWrapAndSubscribeInstructions>;
    initKeeperConfig: (
      params: InitKeeperConfigParams,
    ) => ReturnType<typeof buildInitKeeperConfigInstruction>;
    updateKeeperConfig: (
      params: UpdateKeeperConfigParams,
    ) => ReturnType<typeof buildUpdateKeeperConfigInstruction>;
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
 * // Wrap SPL USDC and subscribe atomically
 * const { signature, address } = await vela.wrapAndSubscribe({
 *   planAddress,
 *   merchantAddress,
 *   splUsdcMint,
 *   wrappedUsdcMint,
 *   wrappingVault,
 *   amount: 10_000_000n,
 * });
 *
 * // Pull payment (Token-2022 transfer_checked validated by the Vela hook program)
 * const { signature } = await vela.pullPayment({
 *   mandateAddress,
 *   subscriberAddress,
 *   merchantAddress,
 *   planAddress,
 *   wrappedUsdcMint,
 * });
 * ```
 */
export function createVelaClient(config: VelaClientConfig): VelaClient {
  const { wallet, commitment = "confirmed", programId = PROGRAM_ID } = config;

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
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment,
  });
  const program = new Program(idl as any, provider);

  // ALT manager for Versioned Transactions
  const altManager = new ALTManager();

  function isMissingMerchantStateError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Account does not exist") ||
      message.includes("has no data")
    );
  }

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

    const alt = await altManager.getOrCreateALT(
      connection,
      wallet.publicKey,
      signAndSend,
    );
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

  function mergeKeeperOptions(
    options?: KeeperScheduleOptions | string,
  ): KeeperScheduleOptions | undefined {
    if (typeof options === "string") {
      return {
        keeperEndpoint: options,
        authToken: config.keeperAuthToken,
      };
    }

    const merged: KeeperScheduleOptions = {};
    if (config.keeperEndpoint) {
      merged.keeperEndpoint = config.keeperEndpoint;
    }
    if (config.keeperAuthToken) {
      merged.authToken = config.keeperAuthToken;
    }
    if (options?.keeperEndpoint) {
      merged.keeperEndpoint = options.keeperEndpoint;
    }
    if (options?.authToken) {
      merged.authToken = options.authToken;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  async function resolveKeeperOptionsForLifecycleSync(): Promise<KeeperScheduleOptions | undefined> {
    const merged = mergeKeeperOptions();
    if (merged?.keeperEndpoint) {
      return merged;
    }

    try {
      const keeperConfig = await fetchKeeperConfig(program);
      return {
        ...merged,
        keeperEndpoint: keeperConfig.keeperEndpoint,
      };
    } catch {
      return undefined;
    }
  }

  async function registerScheduleForMandate(mandate: VelaMandate): Promise<void> {
    const options = await resolveKeeperOptionsForLifecycleSync();
    if (!options?.keeperEndpoint) {
      return;
    }

    const result = await registerBillingSchedule(
      program,
      {
        mandateAddress: mandate.address,
        planAddress: mandate.plan,
        subscriberAddress: mandate.subscriber,
        merchantAddress: mandate.merchant,
        frequency: mandate.frequency,
        nextPaymentDue: mandate.nextPaymentDue,
        billingType: mandate.billingType,
        ...(mandate.billingType === "usage"
          ? { usagePlanAddress: mandate.plan }
          : {}),
      },
      options,
    );

    if (!result.success) {
      throw new Error(
        `Subscription created on-chain, but keeper schedule registration failed for mandate ${mandate.address.toBase58()}: ${result.error ?? "unknown error"}`,
      );
    }
  }

  async function cancelScheduleForMandate(mandateAddress: PublicKey): Promise<void> {
    const options = await resolveKeeperOptionsForLifecycleSync();
    if (!options?.keeperEndpoint) {
      return;
    }

    const result = await cancelBillingSchedule(program, mandateAddress, options);
    if (!result.success) {
      throw new Error(
        `Subscription cancelled on-chain, but keeper schedule cancellation failed for mandate ${mandateAddress.toBase58()}: ${result.error ?? "unknown error"}`,
      );
    }
  }

  const client: VelaClient = {
    // ── Convenience Layer ──────────────────────────────────────────────
    createPlan: (params: VelaCreatePlanParams) =>
      wrapWithErrorTranslation(
        async () => {
          // Fetch merchant state to get current plan_count (= next planId)
          let planId: bigint;
          try {
            const state = await getMerchantState(program, wallet.publicKey);
            planId = state.planCount;
          } catch (error) {
            // MerchantState doesn't exist yet -- this is the first plan (planId = 0)
            if (!isMissingMerchantStateError(error)) {
              throw error;
            }
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
        },
        { method: "createPlan" },
      ),

    createSubscription: (params: VelaSubscribeParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildSubscribeInstruction(program, {
              ...params,
              subscriber: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          // Fetch created mandate
          const raw = await (program.account as any).velaMandate.fetch(
            mandateAddress,
          );
          const mandate = deserializeMandate(mandateAddress, raw);

          await registerScheduleForMandate(mandate);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "createSubscription" },
      ),

    pullPayment: (params: VelaPullParams) =>
      wrapWithErrorTranslation(
        async () => {
          // Now requires connection for extra account meta resolution
          const { instruction, mandateAddress } =
            await buildExecutePullInstruction(program, connection, {
              ...params,
              payer: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          // Fetch updated mandate
          const raw = await (program.account as any).velaMandate.fetch(
            mandateAddress,
          );
          const mandate = deserializeMandate(mandateAddress, raw);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "pullPayment" },
      ),

    cancelSubscription: (
      params: VelaCancelParams & { usdcMintAddress: PublicKey },
    ) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } = await buildCancelInstruction(
            program,
            { ...params, authority: wallet.publicKey },
          );

          const signature = await sendV0Transaction([instruction]);

          // Fetch updated mandate
          const raw = await (program.account as any).velaMandate.fetch(
            mandateAddress,
          );
          const mandate = deserializeMandate(mandateAddress, raw);

          await cancelScheduleForMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "cancelSubscription" },
      ),

    wrap: (params: VelaWrapParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction } = await buildWrapInstruction(program, params);
          const signature = await sendV0Transaction([instruction]);
          return { signature };
        },
        { method: "wrap" },
      ),

    unwrap: (params: VelaUnwrapParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction } = await buildUnwrapInstruction(program, params);
          const signature = await sendV0Transaction([instruction]);
          return { signature };
        },
        { method: "unwrap" },
      ),

    wrapAndSubscribe: (params: VelaWrapAndSubscribeParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instructions, mandateAddress } =
            await buildWrapAndSubscribeInstructions(program, {
              ...params,
              subscriber: wallet.publicKey,
            });

          // All 3 instructions (ATA creation + wrap + subscribe) execute atomically
          const signature = await sendV0Transaction(instructions);

          // Fetch created mandate for enriched result
          const raw = await (program.account as any).velaMandate.fetch(
            mandateAddress,
          );
          const mandate = deserializeMandate(mandateAddress, raw);

          await registerScheduleForMandate(mandate);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "wrapAndSubscribe" },
      ),

    getActiveSubscriptions: (filter) => getActiveSubscriptions(program, filter),

    getPlanDetails: (planAddress) => getPlanDetails(program, planAddress),

    registerBillingSchedule: (params, options) =>
      registerBillingSchedule(program, params, mergeKeeperOptions(options)),

    cancelBillingSchedule: (mandateAddress, options) =>
      cancelBillingSchedule(program, mandateAddress, mergeKeeperOptions(options)),

    initKeeperConfig: (params: InitKeeperConfigParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, keeperConfigAddress } =
            await buildInitKeeperConfigInstruction(program, {
              ...params,
              admin: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          const config = await fetchKeeperConfig(program);

          return { signature, address: keeperConfigAddress, data: config };
        },
        { method: "initKeeperConfig" },
      ),

    updateKeeperConfig: (params: UpdateKeeperConfigParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, keeperConfigAddress } =
            await buildUpdateKeeperConfigInstruction(program, {
              ...params,
              admin: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          const config = await fetchKeeperConfig(program);

          return { signature, address: keeperConfigAddress, data: config };
        },
        { method: "updateKeeperConfig" },
      ),

    // Usage-based billing methods
    createUsagePlan: (params: VelaUsagePlanParams) =>
      usageCreateUsagePlan(program, {
        ...params,
        merchant: wallet.publicKey,
      }),

    submitUsageReport: (params: VelaSubmitUsageReportParams) =>
      usageSubmitUsageReport(
        program,
        { ...params, merchantPublicKey: wallet.publicKey },
        connection,
      ),

    getUsagePlan: async (usagePlanAddress: PublicKey): Promise<UsagePlanAccount> => {
      const raw = await (program.account as any).usagePlan.fetch(usagePlanAddress);
      return raw as UsagePlanAccount;
    },

    getUsageReport: async (usageReportAddress: PublicKey): Promise<UsageReportAccount> => {
      const raw = await (program.account as any).usageReport.fetch(usageReportAddress);
      return raw as UsageReportAccount;
    },

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
        buildExecutePullInstruction(program, connection, {
          ...params,
          payer: wallet.publicKey,
        }),
      cancel: (params) =>
        buildCancelInstruction(program, {
          ...params,
          authority: wallet.publicKey,
        }),
      wrap: (params) => buildWrapInstruction(program, params),
      unwrap: (params) => buildUnwrapInstruction(program, params),
      wrapAndSubscribe: (params) =>
        buildWrapAndSubscribeInstructions(program, {
          ...params,
          subscriber: wallet.publicKey,
        }),
      initKeeperConfig: (params) =>
        buildInitKeeperConfigInstruction(program, {
          ...params,
          admin: wallet.publicKey,
        }),
      updateKeeperConfig: (params) =>
        buildUpdateKeeperConfigInstruction(program, {
          ...params,
          admin: wallet.publicKey,
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
