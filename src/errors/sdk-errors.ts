import { VelaError } from "./base";

export class InvalidRawAmountError extends VelaError {
  constructor(value: unknown, context?: Record<string, unknown>) {
    super("Raw amount must be a non-negative integer base-unit value", 7000, {
      value,
      ...context,
    });
    this.name = "InvalidRawAmountError";
  }
}

export class InvalidPaymentHeaderError extends VelaError {
  constructor(header: string, context?: Record<string, unknown>) {
    super(`Invalid ${header} header payload`, 7001, context);
    this.name = "InvalidPaymentHeaderError";
  }
}

export class PaymentProofExpiredError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Payment proof expired", 7002, context);
    this.name = "PaymentProofExpiredError";
  }
}

export class PaymentProofMismatchError extends VelaError {
  constructor(field: string, context?: Record<string, unknown>) {
    super(`Payment proof ${field} mismatch`, 7003, { field, ...context });
    this.name = "PaymentProofMismatchError";
  }
}

export class PaymentTransactionVerificationError extends VelaError {
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Payment transaction verification failed: ${reason}`, 7004, {
      reason,
      ...context,
    });
    this.name = "PaymentTransactionVerificationError";
  }
}
