// Core types
export type {
  VelaClientConfig,
  VelaWallet,
  VelaMandate,
  VelaPlan,
  MerchantState,
  MandateStatus,
  PlanStatus,
  VelaCreatePlanParams,
  VelaSubscribeParams,
  VelaPullParams,
  VelaCancelParams,
  VelaMethodResult,
  ValidationResult,
  SubscribeValidationResult,
  CancelValidationResult,
} from "./types";

// Client factory
export { createVelaClient } from "./client";
export type { VelaClient } from "./client";

// Errors
export {
  VelaError,
  PullTooEarlyError,
  MandateNotActiveError,
  MaxPullsExceededError,
  InsufficientFundsError,
  UnauthorizedCancelError,
  FrequencyTooLowError,
  OverflowError,
  PlanNotActiveError,
  MandateExpiredError,
  AmountExceedsPlanAmountError,
  translateError,
} from "./errors";

// Instruction builders
export {
  buildCreatePlanInstruction,
  buildSubscribeInstruction,
  buildExecutePullInstruction,
  buildCancelInstruction,
} from "./instructions";
export type {
  BuildCreatePlanResult,
  BuildSubscribeResult,
  BuildExecutePullResult,
  BuildCancelResult,
} from "./instructions";

// Account helpers
export {
  derivePlanAddress,
  deriveMandateAddress,
  deriveMerchantStateAddress,
  deriveCredentialMintAddress,
  deserializeMandate,
  deserializePlan,
  deserializeMerchantState,
  getActiveSubscriptions,
  getPlanDetails,
  getMerchantPlans,
  getMerchantState,
} from "./accounts";

// Validators
export {
  validatePullPayment,
  validateSubscribe,
  validateCancel,
} from "./validators";

// ALT manager
export { ALTManager } from "./alt/lookup-table";

// Helius provider (opt-in)
export { createHeliusConnection, sendWithPriorityFee } from "./helius/provider";

// Constants
export { PROGRAM_ID, SEED_PREFIXES } from "./constants";
