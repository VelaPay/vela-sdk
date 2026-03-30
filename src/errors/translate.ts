import { VelaError } from "./base";
import {
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
} from "./program-errors";

type ErrorConstructor = new (context?: Record<string, unknown>) => VelaError;

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
  // Check for Anchor error structure
  const anchorCode = (error as any)?.error?.errorCode?.number;

  if (typeof anchorCode === "number" && anchorCode in ERROR_MAP) {
    return new ERROR_MAP[anchorCode](context);
  }

  // Check for SendTransactionError from LiteSVM / web3.js
  // Format: "InstructionErrorCustom { code: 6000 }"
  const txMessage = (error as any)?.transactionMessage;
  if (typeof txMessage === "string") {
    const codeMatch = txMessage.match(/InstructionErrorCustom\s*\{\s*code:\s*(\d+)\s*\}/);
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
