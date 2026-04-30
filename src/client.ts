import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type {
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  checkAgentBudget,
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  deserializeMandate,
  deserializePlan,
  fetchAgentMandate,
  getActiveSubscriptions,
  getMerchantState,
  getPlanDetails,
  listAgentMandates,
  PDAFactory,
  verifyAgentMandate,
} from "./accounts";
import { deserializeProtocolConfig } from "./accounts/deserialize";
import { ALTManager } from "./alt/lookup-table";
import {
  type PreviewPlanChangeResult,
  UpgradeBuilder,
  type UpgradeBuilderArgs,
  type UpgradePlanInput,
} from "./builders";
import { PROGRAM_ID } from "./constants";
import { translateError } from "./errors";
import { createHeliusConnection } from "./helius/provider";
import { ensureAgentWebhook } from "./helius/webhooks";
import { rawVelaIdl, withProgramAddress } from "./idl";
import {
  type ExplainedInstruction,
  type ExplainedTransactionPlan,
  explainInstruction,
  explainInstructions,
} from "./inspection";
import {
  buildAdjustAgentMandateInstruction,
  buildAdminCancelInstruction,
  buildAgentPullInstruction,
  buildCancelInstruction,
  buildCancelPlanChangeInstruction,
  buildCreateAgentMandateInstruction,
  buildCreatePlanInstruction,
  buildDrainAgentMandateInstruction,
  buildExecutePullInstruction,
  buildInitKeeperConfigInstruction,
  buildPauseAgentMandateInstruction,
  buildPauseProtocolInstruction,
  buildResumeAgentMandateInstruction,
  buildRevokeAgentMandateInstruction,
  buildSchedulePlanChangeInstruction,
  buildSubscribeInstruction,
  buildUnpauseProtocolInstruction,
  buildUnwrapInstruction,
  buildUpdateKeeperConfigInstruction,
  buildUpdateMandatePlanInstruction,
  buildWrapAndSubscribeInstructions,
  buildWrapInstruction,
} from "./instructions";
import type {
  CreatePortalSessionParams,
  PortalSession,
  PortalSessionsNamespace,
} from "./portal-sessions";
import { resolveVelaProgramPublicKeys } from "./protocol";
import type { KeeperScheduleOptions } from "./schedule";
import {
  cancelBillingSchedule,
  fetchKeeperConfig,
  registerBillingSchedule,
} from "./schedule";
import { formatAmount } from "./token/format-amount";
import { getEnabledTokens } from "./token/get-enabled-tokens";
import { parseAmount } from "./token/parse-amount";
import { resolveTokenConfig } from "./token/resolve-token-config";
import type {
  AgentBudgetSummary,
  AgentMandate,
  AgentMandateDrainResult,
  AgentMandateMethodResult,
  AgentMandateRevokeResult,
  AgentMandateVerificationResult,
  BillingScheduleParams,
  CancelValidationResult,
  CheckAgentBudgetParams,
  CheckoutSession,
  CheckoutSessionsNamespace,
  CreateCheckoutSessionParams,
  InitKeeperConfigParams,
  KeeperConfig,
  ProtocolConfig,
  SubscribablePlan,
  SubscribeValidationResult,
  TokenConfigAccount,
  UpdateKeeperConfigParams,
  UsagePlanAccount,
  UsageReportAccount,
  ValidateAgentPullParams,
  ValidationResult,
  VelaAdjustAgentMandateParams,
  VelaAdminCancelParams,
  VelaAgentPullParams,
  VelaCancelParams,
  VelaClientConfig,
  VelaCreateAgentMandateParams,
  VelaCreatePlanParams,
  VelaDrainAgentMandateParams,
  VelaMandate,
  VelaMethodResult,
  VelaPauseAgentMandateParams,
  VelaPlan,
  VelaPullParams,
  VelaResumeAgentMandateParams,
  VelaRevokeAgentMandateParams,
  VelaSubmitUsageReportParams,
  VelaSubscribeParams,
  VelaTopUpAgentMandateParams,
  VelaUnwrapParams,
  VelaUsagePlanParams,
  VelaWrapAndSubscribeParams,
  VelaWrapParams,
} from "./types";
import type { StreamMandate } from "./types/stream-mandate";
import {
  validateAgentPull,
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
  createAgentMandate: (
    params: VelaCreateAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  wrapAndCreateAgentMandate: (
    params: VelaCreateAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  topUpAgentMandate: (
    params: VelaTopUpAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  agentPull: (params: VelaAgentPullParams) => Promise<AgentMandateMethodResult>;
  adjustAgentMandate: (
    params: VelaAdjustAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  pauseAgentMandate: (
    params: VelaPauseAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  resumeAgentMandate: (
    params: VelaResumeAgentMandateParams,
  ) => Promise<AgentMandateMethodResult>;
  revokeAgentMandate: (
    params: VelaRevokeAgentMandateParams,
  ) => Promise<AgentMandateRevokeResult>;
  drainAgentMandate: (
    params: VelaDrainAgentMandateParams,
  ) => Promise<AgentMandateDrainResult>;
  listAgentMandates: (authority?: PublicKey) => Promise<AgentMandate[]>;
  checkAgentBudget: (
    params: CheckAgentBudgetParams,
  ) => Promise<AgentBudgetSummary>;
  verifyAgentMandate: (
    params: Parameters<typeof verifyAgentMandate>[2],
  ) => Promise<AgentMandateVerificationResult>;
  validateAgentPull: (
    params: ValidateAgentPullParams,
  ) => Promise<
    ReturnType<typeof validateAgentPull> extends Promise<infer T> ? T : never
  >;
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
  previewPlanChange: (
    mandate: VelaMandate | StreamMandate,
    newPlan: UpgradePlanInput,
    tokenConfig: TokenConfigAccount,
  ) => PreviewPlanChangeResult;
  explainInstruction: (
    instruction: TransactionInstruction,
    label?: string,
  ) => ExplainedInstruction;
  explainInstructions: (
    instructions: readonly TransactionInstruction[],
  ) => ExplainedTransactionPlan;
  createUpgradeBuilder: (
    args: Omit<UpgradeBuilderArgs, "connection" | "program">,
  ) => UpgradeBuilder;
  getEnabledTokens: () => Promise<TokenConfigAccount[]>;
  resolveTokenConfig: (mint: PublicKey) => Promise<TokenConfigAccount>;
  formatAmount: (
    rawAmount: bigint,
    tokenConfig: Pick<TokenConfigAccount, "decimals">,
  ) => string;
  parseAmount: (
    displayAmount: string,
    tokenConfig: Pick<TokenConfigAccount, "decimals">,
  ) => bigint;
  getActiveSubscriptions: (filter: {
    subscriber?: PublicKey;
    merchant?: PublicKey;
  }) => Promise<VelaMandate[]>;
  getPlanDetails: (planAddress: PublicKey) => Promise<VelaPlan>;
  getProtocolConfig: () => Promise<ProtocolConfig>;
  refreshConfig: () => Promise<ProtocolConfig>;
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
  pauseProtocol: () => Promise<VelaMethodResult<void>>;
  unpauseProtocol: () => Promise<VelaMethodResult<void>>;
  adminCancel: (
    params: VelaAdminCancelParams,
  ) => Promise<VelaMethodResult<VelaMandate>>;

  // Usage-based billing
  createUsagePlan: (
    params: VelaUsagePlanParams,
  ) => Promise<{ usagePlanAddress: PublicKey; txSignature: string }>;
  submitUsageReport: (
    params: VelaSubmitUsageReportParams,
  ) => Promise<{ usageReportAddress: PublicKey; txSignature: string }>;
  getUsagePlan: (usagePlanAddress: PublicKey) => Promise<UsagePlanAccount>;
  getUsageReport: (
    usageReportAddress: PublicKey,
  ) => Promise<UsageReportAccount>;
  checkoutSessions: CheckoutSessionsNamespace;
  portalSessions: PortalSessionsNamespace;

  // Raw instruction layer
  instructions: {
    createPlan: (
      params: VelaCreatePlanParams & { planId: bigint },
    ) => ReturnType<typeof buildCreatePlanInstruction>;
    createAgentMandate: (
      params: VelaCreateAgentMandateParams,
    ) => ReturnType<typeof buildCreateAgentMandateInstruction>;
    agentPull: (
      params: VelaAgentPullParams,
    ) => ReturnType<typeof buildAgentPullInstruction>;
    adjustAgentMandate: (
      params: VelaAdjustAgentMandateParams,
    ) => ReturnType<typeof buildAdjustAgentMandateInstruction>;
    pauseAgentMandate: (
      params: VelaPauseAgentMandateParams,
    ) => ReturnType<typeof buildPauseAgentMandateInstruction>;
    resumeAgentMandate: (
      params: VelaResumeAgentMandateParams,
    ) => ReturnType<typeof buildResumeAgentMandateInstruction>;
    revokeAgentMandate: (
      params: VelaRevokeAgentMandateParams,
    ) => ReturnType<typeof buildRevokeAgentMandateInstruction>;
    drainAgentMandate: (
      params: VelaDrainAgentMandateParams,
    ) => ReturnType<typeof buildDrainAgentMandateInstruction>;
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
    cancelPlanChange: (params: {
      mandate: PublicKey;
    }) => ReturnType<typeof buildCancelPlanChangeInstruction>;
    schedulePlanChange: (params: {
      mandate: PublicKey;
      newPlan: PublicKey;
    }) => ReturnType<typeof buildSchedulePlanChangeInstruction>;
    updateMandatePlan: (params: {
      mandate: PublicKey;
      newPlan: PublicKey;
    }) => ReturnType<typeof buildUpdateMandatePlanInstruction>;
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
    pauseProtocol: (params?: {
      authority?: PublicKey;
    }) => ReturnType<typeof buildPauseProtocolInstruction>;
    unpauseProtocol: (params?: {
      authority?: PublicKey;
    }) => ReturnType<typeof buildUnpauseProtocolInstruction>;
    adminCancel: (
      params: VelaAdminCancelParams,
    ) => ReturnType<typeof buildAdminCancelInstruction>;
  };

  // Validation layer
  validate: {
    agentPull: (
      params: ValidateAgentPullParams,
    ) => Promise<
      ReturnType<typeof validateAgentPull> extends Promise<infer T> ? T : never
    >;
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
  const {
    wallet,
    commitment = "confirmed",
    programId = config.cluster
      ? resolveVelaProgramPublicKeys(config.cluster).velaProtocol
      : PROGRAM_ID,
  } = config;
  const dashboardApiUrl = config.dashboardApiUrl?.replace(/\/+$/, "");
  const apiKey = config.apiKey;

  let { connection } = config;
  const programIdl = withProgramAddress(
    rawVelaIdl as Record<string, unknown>,
    programId,
  );
  let provider = new AnchorProvider(connection, wallet as any, {
    commitment,
  });
  let program = new Program(programIdl as any, provider);

  const syncRuntime = (nextConnection?: Connection) => {
    if (nextConnection) {
      connection = nextConnection;
    }
    provider = new AnchorProvider(connection, wallet as any, {
      commitment,
    });
    program = new Program(programIdl as any, provider);
  };

  const inferHeliusCluster = (): string => {
    const endpoint = (
      connection as Connection & { rpcEndpoint?: string }
    ).rpcEndpoint?.toLowerCase();
    if (endpoint?.includes("devnet")) {
      return "devnet";
    }
    if (endpoint?.includes("testnet")) {
      return "testnet";
    }
    if (endpoint?.includes("mainnet")) {
      return "mainnet-beta";
    }
    throw new Error(
      "Unable to infer the Helius cluster from the RPC endpoint. Pass heliusCluster explicitly when creating the client.",
    );
  };

  // Lazy Helius connection upgrade
  let heliusConnectionPromise: Promise<Connection> | null = null;
  if (config.heliusApiKey) {
    heliusConnectionPromise = createHeliusConnection(
      config.heliusApiKey,
      config.heliusCluster ?? inferHeliusCluster(),
    ).then((conn) => {
      syncRuntime(conn);
      return conn;
    });
  }
  let agentWebhookId: string | null = null;
  let agentWebhookRegistrationPromise: Promise<string | null> | null = null;

  // ALT manager for Versioned Transactions
  const altManager = new ALTManager();
  let protocolConfigCache: ProtocolConfig | null = null;
  let protocolConfigPromise: Promise<ProtocolConfig> | null = null;

  async function ensureRuntimeReady(): Promise<void> {
    if (heliusConnectionPromise) {
      await heliusConnectionPromise;
    }
  }

  async function loadProtocolConfig(): Promise<ProtocolConfig> {
    const [configAddress] = PDAFactory.config(program.programId);
    const raw = await (program.account as any).protocolConfig.fetch(
      configAddress,
    );
    const configAccount = deserializeProtocolConfig(raw);
    protocolConfigCache = configAccount;
    return configAccount;
  }

  async function getProtocolConfigCached(): Promise<ProtocolConfig> {
    if (protocolConfigCache) {
      return protocolConfigCache;
    }

    if (protocolConfigPromise == null) {
      protocolConfigPromise = loadProtocolConfig().catch((error) => {
        protocolConfigPromise = null;
        throw error;
      });
    }

    return protocolConfigPromise;
  }

  async function refreshProtocolConfigCache(): Promise<ProtocolConfig> {
    protocolConfigCache = null;
    protocolConfigPromise = null;
    return getProtocolConfigCached();
  }

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
    await ensureRuntimeReady();

    const signAndSend = async (tx: VersionedTransaction): Promise<string> => {
      const signed = await wallet.signTransaction(tx as any);
      const sig = await connection.sendRawTransaction(signed.serialize());
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash(commitment);
      const confirmation = await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        commitment,
      );
      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        );
      }
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
      await ensureRuntimeReady();
      return await fn();
    } catch (err) {
      throw translateError(err, context);
    }
  }

  async function resolveAgentProtocolAccounts(overrides: {
    wrappedUsdcMint?: PublicKey;
    wrappingVault?: PublicKey;
  }): Promise<{ wrappedUsdcMint: PublicKey; wrappingVault: PublicKey }> {
    if (overrides.wrappedUsdcMint && overrides.wrappingVault) {
      return {
        wrappedUsdcMint: overrides.wrappedUsdcMint,
        wrappingVault: overrides.wrappingVault,
      };
    }

    const configAccount = await getProtocolConfigCached();

    return {
      wrappedUsdcMint:
        overrides.wrappedUsdcMint ?? configAccount.wrappedUsdcMint,
      wrappingVault: overrides.wrappingVault ?? configAccount.wrappingVault,
    };
  }

  async function fetchConnectedAgentMandate(
    mandateAddress: PublicKey,
  ): Promise<AgentMandate> {
    return fetchAgentMandate(connection, mandateAddress, program);
  }

  async function getAgentMandateWrappedBalance(
    mandateAddress: PublicKey,
    wrappedUsdcMint: PublicKey,
  ): Promise<bigint> {
    const wrappedAccount = deriveAgentMandateWrappedAta(
      mandateAddress,
      wrappedUsdcMint,
    );
    const account = await getAccount(
      connection,
      wrappedAccount,
      commitment,
      TOKEN_2022_PROGRAM_ID,
    );
    return BigInt(account.amount.toString());
  }

  async function createAgentMandateFlow(
    params: VelaCreateAgentMandateParams,
  ): Promise<AgentMandateMethodResult> {
    const { instruction, mandateAddress } =
      await buildCreateAgentMandateInstruction(program, {
        ...params,
        authority: wallet.publicKey,
      });

    const signature = await sendV0Transaction([instruction]);
    const mandate = await fetchConnectedAgentMandate(mandateAddress);
    await ensureAgentWebhookRegistered();

    return { signature, address: mandateAddress, data: mandate };
  }

  async function ensureAgentWebhookRegistered(): Promise<void> {
    if (
      !config.heliusApiKey ||
      !config.agentWebhook ||
      agentWebhookId != null
    ) {
      return;
    }

    if (agentWebhookRegistrationPromise == null) {
      agentWebhookRegistrationPromise = ensureAgentWebhook({
        apiKey: config.heliusApiKey,
        agentWebhook: config.agentWebhook,
        programId,
      })
        .then(({ webhookId }) => {
          agentWebhookId = webhookId;
          return webhookId;
        })
        .catch((error) => {
          agentWebhookRegistrationPromise = null;
          throw error;
        });
    }

    try {
      await agentWebhookRegistrationPromise;
    } catch (error) {
      console.warn(
        "Agent mandate created, but webhook registration failed:",
        error instanceof Error ? error.message : String(error),
      );
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

  async function resolveKeeperOptionsForLifecycleSync(): Promise<
    KeeperScheduleOptions | undefined
  > {
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

  async function registerScheduleForMandate(
    mandate: VelaMandate,
  ): Promise<void> {
    if (!mandate.plan) {
      throw new Error(
        `Mandate ${mandate.address.toBase58()} is missing a plan reference required for keeper schedule registration.`,
      );
    }

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

  async function cancelScheduleForMandate(
    mandateAddress: PublicKey,
  ): Promise<void> {
    const options = await resolveKeeperOptionsForLifecycleSync();
    if (!options?.keeperEndpoint) {
      return;
    }

    const result = await cancelBillingSchedule(
      program,
      mandateAddress,
      options,
    );
    if (!result.success) {
      throw new Error(
        `Subscription cancelled on-chain, but keeper schedule cancellation failed for mandate ${mandateAddress.toBase58()}: ${result.error ?? "unknown error"}`,
      );
    }
  }

  function requireDashboardConfig(namespace = "dashboard API namespaces"): {
    apiKey: string;
    dashboardApiUrl: string;
  } {
    if (!dashboardApiUrl) {
      throw new Error(`dashboardApiUrl required for ${namespace}`);
    }
    if (!apiKey) {
      throw new Error(`apiKey required for ${namespace}`);
    }
    return { apiKey, dashboardApiUrl };
  }

  async function extractDashboardError(
    response: Response,
    fallback: string,
  ): Promise<Error> {
    try {
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (typeof payload.error === "string" && payload.error.length > 0) {
        return new Error(payload.error);
      }
      if (typeof payload.message === "string" && payload.message.length > 0) {
        return new Error(payload.message);
      }
    } catch {
      // Ignore JSON parsing failures and fall back to plain text or status.
    }

    const text = await response.text().catch(() => "");
    return new Error(text || fallback);
  }

  async function fetchDashboardApi<T>(
    path: string,
    init?: RequestInit,
    namespace?: string,
  ): Promise<T> {
    const { apiKey: token, dashboardApiUrl: baseUrl } =
      requireDashboardConfig(namespace);
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw await extractDashboardError(
        response,
        `Dashboard API request failed: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  const checkoutSessions: CheckoutSessionsNamespace = {
    async create(
      params: CreateCheckoutSessionParams,
    ): Promise<CheckoutSession> {
      return fetchDashboardApi<CheckoutSession>(
        "/api/checkout-sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        },
        "checkout sessions",
      );
    },

    async get(sessionId: string): Promise<CheckoutSession> {
      return fetchDashboardApi<CheckoutSession>(
        `/api/checkout-sessions/${sessionId}`,
        undefined,
        "checkout sessions",
      );
    },

    async expire(sessionId: string): Promise<void> {
      const { apiKey: token, dashboardApiUrl: baseUrl } =
        requireDashboardConfig("checkout sessions");
      const response = await fetch(
        `${baseUrl}/api/checkout-sessions/${sessionId}/expire`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw await extractDashboardError(
          response,
          `Failed to expire session: HTTP ${response.status}`,
        );
      }
    },
  };

  const portalSessions: PortalSessionsNamespace = {
    async create(params: CreatePortalSessionParams): Promise<PortalSession> {
      return fetchDashboardApi<PortalSession>(
        "/api/portal-sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        },
        "portal sessions",
      );
    },
  };

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

    createAgentMandate: (params: VelaCreateAgentMandateParams) =>
      wrapWithErrorTranslation(() => createAgentMandateFlow(params), {
        method: "createAgentMandate",
      }),

    wrapAndCreateAgentMandate: (params: VelaCreateAgentMandateParams) =>
      wrapWithErrorTranslation(() => createAgentMandateFlow(params), {
        method: "wrapAndCreateAgentMandate",
      }),

    topUpAgentMandate: (params: VelaTopUpAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { wrappedUsdcMint, wrappingVault } =
            await resolveAgentProtocolAccounts(params);
          const [mandateAddress] = deriveAgentMandateAddress(
            wallet.publicKey,
            params.agent,
            program.programId,
          );
          const destinationWrappedAccount = deriveAgentMandateWrappedAta(
            mandateAddress,
            wrappedUsdcMint,
          );
          const { instruction } = await buildWrapInstruction(program, {
            subscriber: wallet.publicKey,
            amount: BigInt(params.amount),
            splUsdcMint: params.splUsdcMint,
            wrappedUsdcMint,
            wrappingVault,
            destinationOwner: mandateAddress,
            destinationWrappedAccount,
          });

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "topUpAgentMandate" },
      ),

    agentPull: (params: VelaAgentPullParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildAgentPullInstruction(program, {
              ...params,
              payer: wallet.publicKey,
              agent: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "agentPull" },
      ),

    adjustAgentMandate: (params: VelaAdjustAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildAdjustAgentMandateInstruction(program, {
              ...params,
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "adjustAgentMandate" },
      ),

    pauseAgentMandate: (params: VelaPauseAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildPauseAgentMandateInstruction(program, {
              ...params,
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "pauseAgentMandate" },
      ),

    resumeAgentMandate: (params: VelaResumeAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildResumeAgentMandateInstruction(program, {
              ...params,
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "resumeAgentMandate" },
      ),

    revokeAgentMandate: (params: VelaRevokeAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { wrappedUsdcMint } =
            await resolveAgentProtocolAccounts(params);
          const [mandateAddress] = deriveAgentMandateAddress(
            wallet.publicKey,
            params.agent,
            program.programId,
          );
          const reclaimedAmount = await getAgentMandateWrappedBalance(
            mandateAddress,
            wrappedUsdcMint,
          );
          const { instruction } = await buildRevokeAgentMandateInstruction(
            program,
            {
              ...params,
              authority: wallet.publicKey,
              wrappedUsdcMint,
            },
          );

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return {
            signature,
            address: mandateAddress,
            data: mandate,
            reclaimedAmount,
          };
        },
        { method: "revokeAgentMandate" },
      ),

    drainAgentMandate: (params: VelaDrainAgentMandateParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { wrappedUsdcMint } =
            await resolveAgentProtocolAccounts(params);
          const [mandateAddress] = deriveAgentMandateAddress(
            wallet.publicKey,
            params.agent,
            program.programId,
          );
          const drainedAmount = await getAgentMandateWrappedBalance(
            mandateAddress,
            wrappedUsdcMint,
          );
          const { instruction } = await buildDrainAgentMandateInstruction(
            program,
            {
              ...params,
              authority: wallet.publicKey,
              wrappedUsdcMint,
            },
          );

          const signature = await sendV0Transaction([instruction]);
          const mandate = await fetchConnectedAgentMandate(mandateAddress);

          return {
            signature,
            address: mandateAddress,
            data: mandate,
            drainedAmount,
          };
        },
        { method: "drainAgentMandate" },
      ),

    listAgentMandates: (authority = wallet.publicKey) =>
      ensureRuntimeReady().then(() => listAgentMandates(program, authority)),

    checkAgentBudget: (params: CheckAgentBudgetParams) =>
      ensureRuntimeReady().then(() =>
        checkAgentBudget(program, connection, params),
      ),

    verifyAgentMandate: (params) =>
      ensureRuntimeReady().then(() =>
        verifyAgentMandate(program, connection, params),
      ),

    validateAgentPull: (params: ValidateAgentPullParams) =>
      ensureRuntimeReady().then(() =>
        validateAgentPull(program, connection, params),
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

    previewPlanChange: (mandate, newPlan, tokenConfig) =>
      UpgradeBuilder.previewPlanChange(mandate, newPlan, tokenConfig),

    explainInstruction,
    explainInstructions,

    createUpgradeBuilder: (args) =>
      new UpgradeBuilder({
        ...args,
        connection,
        program,
      }),

    getEnabledTokens: () =>
      ensureRuntimeReady().then(() =>
        getEnabledTokens(connection, program.programId),
      ),

    resolveTokenConfig: (mint) =>
      ensureRuntimeReady().then(() =>
        resolveTokenConfig(connection, mint, program.programId),
      ),

    formatAmount: (rawAmount, tokenConfig) =>
      formatAmount(rawAmount, tokenConfig),

    parseAmount: (displayAmount, tokenConfig) =>
      parseAmount(displayAmount, tokenConfig),

    getActiveSubscriptions: (filter) =>
      ensureRuntimeReady().then(() => getActiveSubscriptions(program, filter)),

    getPlanDetails: (planAddress) =>
      ensureRuntimeReady().then(() => getPlanDetails(program, planAddress)),

    getProtocolConfig: () =>
      wrapWithErrorTranslation(async () => getProtocolConfigCached(), {
        method: "getProtocolConfig",
      }),

    refreshConfig: () =>
      wrapWithErrorTranslation(async () => refreshProtocolConfigCache(), {
        method: "refreshConfig",
      }),

    registerBillingSchedule: (params, options) =>
      ensureRuntimeReady().then(() =>
        registerBillingSchedule(program, params, mergeKeeperOptions(options)),
      ),

    cancelBillingSchedule: (mandateAddress, options) =>
      ensureRuntimeReady().then(() =>
        cancelBillingSchedule(
          program,
          mandateAddress,
          mergeKeeperOptions(options),
        ),
      ),

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

    pauseProtocol: () =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, configAddress } =
            await buildPauseProtocolInstruction(program, {
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          return { signature, address: configAddress };
        },
        { method: "pauseProtocol" },
      ),

    unpauseProtocol: () =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, configAddress } =
            await buildUnpauseProtocolInstruction(program, {
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          return { signature, address: configAddress };
        },
        { method: "unpauseProtocol" },
      ),

    adminCancel: (params: VelaAdminCancelParams) =>
      wrapWithErrorTranslation(
        async () => {
          const { instruction, mandateAddress } =
            await buildAdminCancelInstruction(program, {
              ...params,
              authority: wallet.publicKey,
            });

          const signature = await sendV0Transaction([instruction]);

          // Fetch updated mandate
          const raw = await (program.account as any).velaMandate.fetch(
            mandateAddress,
          );
          const mandate = deserializeMandate(mandateAddress, raw);

          await cancelScheduleForMandate(mandateAddress);

          return { signature, address: mandateAddress, data: mandate };
        },
        { method: "adminCancel" },
      ),

    // Usage-based billing methods
    createUsagePlan: async (params: VelaUsagePlanParams) => {
      const { createUsagePlan } = await import("./usage");
      return createUsagePlan(program, {
        ...params,
        merchant: wallet.publicKey,
      });
    },

    submitUsageReport: async (params: VelaSubmitUsageReportParams) => {
      const { submitUsageReport } = await import("./usage");
      return submitUsageReport(
        program,
        { ...params, merchantPublicKey: wallet.publicKey },
        connection,
        {
          keeperEndpoint: config.keeperEndpoint,
          authToken: config.keeperAuthToken,
        },
      );
    },

    getUsagePlan: async (
      usagePlanAddress: PublicKey,
    ): Promise<UsagePlanAccount> => {
      const raw = await (program.account as any).usagePlan.fetch(
        usagePlanAddress,
      );
      return raw as UsagePlanAccount;
    },

    getUsageReport: async (
      usageReportAddress: PublicKey,
    ): Promise<UsageReportAccount> => {
      const raw = await (program.account as any).usageReport.fetch(
        usageReportAddress,
      );
      return raw as UsageReportAccount;
    },

    checkoutSessions,
    portalSessions,

    // ── Raw Instruction Layer ──────────────────────────────────────────
    instructions: {
      createPlan: (params) =>
        ensureRuntimeReady().then(() =>
          buildCreatePlanInstruction(program, {
            ...params,
            merchant: wallet.publicKey,
          }),
        ),
      createAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildCreateAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      agentPull: (params) =>
        ensureRuntimeReady().then(() =>
          buildAgentPullInstruction(program, {
            ...params,
            payer: wallet.publicKey,
            agent: wallet.publicKey,
          }),
        ),
      adjustAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildAdjustAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      pauseAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildPauseAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      resumeAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildResumeAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      revokeAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildRevokeAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      drainAgentMandate: (params) =>
        ensureRuntimeReady().then(() =>
          buildDrainAgentMandateInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      subscribe: (params) =>
        ensureRuntimeReady().then(() =>
          buildSubscribeInstruction(program, {
            ...params,
            subscriber: wallet.publicKey,
          }),
        ),
      executePull: (params) =>
        ensureRuntimeReady().then(() =>
          buildExecutePullInstruction(program, connection, {
            ...params,
            payer: wallet.publicKey,
          }),
        ),
      cancel: (params) =>
        ensureRuntimeReady().then(() =>
          buildCancelInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
      cancelPlanChange: (params) =>
        ensureRuntimeReady().then(() =>
          buildCancelPlanChangeInstruction(program, connection, {
            mandate: params.mandate,
            authority: wallet.publicKey,
          }),
        ),
      schedulePlanChange: (params) =>
        ensureRuntimeReady().then(() =>
          buildSchedulePlanChangeInstruction(program, connection, {
            mandate: params.mandate,
            authority: wallet.publicKey,
            newPlan: params.newPlan,
          }),
        ),
      updateMandatePlan: (params) =>
        ensureRuntimeReady().then(() =>
          buildUpdateMandatePlanInstruction(program, connection, {
            mandate: params.mandate,
            authority: wallet.publicKey,
            newPlan: params.newPlan,
          }),
        ),
      wrap: (params) =>
        ensureRuntimeReady().then(() => buildWrapInstruction(program, params)),
      unwrap: (params) =>
        ensureRuntimeReady().then(() =>
          buildUnwrapInstruction(program, params),
        ),
      wrapAndSubscribe: (params) =>
        ensureRuntimeReady().then(() =>
          buildWrapAndSubscribeInstructions(program, {
            ...params,
            subscriber: wallet.publicKey,
          }),
        ),
      initKeeperConfig: (params) =>
        ensureRuntimeReady().then(() =>
          buildInitKeeperConfigInstruction(program, {
            ...params,
            admin: wallet.publicKey,
          }),
        ),
      updateKeeperConfig: (params) =>
        ensureRuntimeReady().then(() =>
          buildUpdateKeeperConfigInstruction(program, {
            ...params,
            admin: wallet.publicKey,
          }),
        ),
      pauseProtocol: (_params?) =>
        ensureRuntimeReady().then(() =>
          buildPauseProtocolInstruction(program, {
            authority: wallet.publicKey,
          }),
        ),
      unpauseProtocol: (_params?) =>
        ensureRuntimeReady().then(() =>
          buildUnpauseProtocolInstruction(program, {
            authority: wallet.publicKey,
          }),
        ),
      adminCancel: (params) =>
        ensureRuntimeReady().then(() =>
          buildAdminCancelInstruction(program, {
            ...params,
            authority: wallet.publicKey,
          }),
        ),
    },

    // ── Validation Layer ───────────────────────────────────────────────
    validate: {
      agentPull: (params) =>
        ensureRuntimeReady().then(() =>
          validateAgentPull(program, connection, params),
        ),
      pullPayment: (mandateAddress) =>
        ensureRuntimeReady().then(() =>
          validatePullPayment(program, connection, mandateAddress),
        ),
      subscribe: (planAddress) =>
        ensureRuntimeReady().then(() =>
          validateSubscribe(program, planAddress, wallet.publicKey),
        ),
      cancel: (mandateAddress) =>
        ensureRuntimeReady().then(() =>
          validateCancel(program, mandateAddress, wallet.publicKey),
        ),
    },

    // ── Exposed Internals ──────────────────────────────────────────────
    get program() {
      return program;
    },
    get connection() {
      return connection;
    },
  };

  return client;
}
