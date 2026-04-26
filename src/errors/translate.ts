import { VelaError } from "./base";
import {
  AgentMandateAlreadyExistsError,
  AgentMandateNotFoundError,
  AmountExceedsPlanAmountError,
  DailyLimitExceededError,
  DuplicateServiceError,
  FrequencyTooLowError,
  InsufficientMandateBalanceError,
  InsufficientFundsError,
  InvalidAgentMandateStatusTransitionError,
  InvalidServiceListError,
  LifetimeCapExceededError,
  MandatePausedError,
  MandateRevokedError,
  MandateExpiredError,
  MandateNotActiveError,
  MaxPullsExceededError,
  MaxPullsTooLowError,
  NoFundsToDrainError,
  OverflowError,
  PlanNotActiveError,
  ProtocolPausedError,
  PullTooEarlyError,
  PullAmountTooSmallError,
  PullCooldownActiveError,
  ServiceDailyLimitExceededError,
  TooManyServicesError,
  UnauthorizedAgentError,
  UnauthorizedAgentMandateAuthorityError,
  UnauthorizedCancelError,
  UnauthorizedServiceError,
} from "./program-errors";

type ErrorConstructor = new (context?: Record<string, unknown>) => VelaError;
type AnchorErrorLike = {
  error?: {
    errorCode?: {
      number?: number;
    };
  };
  transactionMessage?: string;
};

const ERROR_MAP: Record<number, ErrorConstructor> = {
  6000: PullTooEarlyError,
  6001: MandateNotActiveError,
  6002: MaxPullsExceededError,
  6003: InsufficientFundsError,
  6004: UnauthorizedCancelError,
  6005: FrequencyTooLowError,
  6006: OverflowError,
  6007: PlanNotActiveError,
  6008: MandateExpiredError,
  6009: AmountExceedsPlanAmountError,
  6010: MaxPullsTooLowError,
  6030: UnauthorizedAgentError,
  6031: UnauthorizedServiceError,
  6032: TooManyServicesError,
  6033: DuplicateServiceError,
  6034: MandatePausedError,
  6035: MandateRevokedError,
  6036: DailyLimitExceededError,
  6037: ServiceDailyLimitExceededError,
  6038: LifetimeCapExceededError,
  6039: PullAmountTooSmallError,
  6040: PullCooldownActiveError,
  6041: InvalidServiceListError,
  6042: AgentMandateAlreadyExistsError,
  6043: AgentMandateNotFoundError,
  6044: InsufficientMandateBalanceError,
  6045: NoFundsToDrainError,
  6046: InvalidAgentMandateStatusTransitionError,
  6047: UnauthorizedAgentMandateAuthorityError,
  6060: ProtocolPausedError,
};

/**
 * Translates an Anchor program error (or any unknown error) into a typed VelaError.
 *
 * Checks for:
 * 1. Anchor error structure `error.error.errorCode.number`
 * 2. SendTransactionError with `transactionMessage` containing `InstructionErrorCustom { code: XXXX }`
 * 3. Error message containing hex error code `custom program error: 0xXXXX`
 *
 * Falls back to a generic VelaError with code -1.
 */
export function translateError(
  error: unknown,
  context?: Record<string, unknown>,
): VelaError {
  const errorLike = error as AnchorErrorLike;
  const anchorCode = errorLike.error?.errorCode?.number;

  if (typeof anchorCode === "number" && anchorCode in ERROR_MAP) {
    return new ERROR_MAP[anchorCode](context);
  }

  // Check for SendTransactionError from LiteSVM / web3.js
  // Format: "InstructionErrorCustom { code: 6000 }"
  const txMessage = errorLike.transactionMessage;
  if (typeof txMessage === "string") {
    const codeMatch = txMessage.match(
      /InstructionErrorCustom\s*\{\s*code:\s*(\d+)\s*\}/,
    );
    if (codeMatch) {
      const code = parseInt(codeMatch[1], 10);
      if (code in ERROR_MAP) {
        return new ERROR_MAP[code](context);
      }
    }
  }

  // Check for hex error code in error message
  // Format: "custom program error: 0x1770"
  const message = error instanceof Error ? error.message : String(error);
  const hexMatch = message.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (hexMatch) {
    const code = parseInt(hexMatch[1], 16);
    if (code in ERROR_MAP) {
      return new ERROR_MAP[code](context);
    }
  }

  // Fallback: generic VelaError
  return new VelaError(message, -1, context);
}
