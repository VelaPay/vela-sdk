import { VelaError } from "./base";

export class PullTooEarlyError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Pull attempted before next_payment_due", 6000, context);
    this.name = "PullTooEarlyError";
  }
}

export class MandateNotActiveError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Mandate has expired or been cancelled", 6001, context);
    this.name = "MandateNotActiveError";
  }
}

export class MaxPullsExceededError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Maximum pulls exhausted for this mandate", 6002, context);
    this.name = "MaxPullsExceededError";
  }
}

export class InsufficientFundsError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Subscriber has insufficient token balance", 6003, context);
    this.name = "InsufficientFundsError";
  }
}

export class UnauthorizedCancelError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Only the subscriber can cancel their mandate", 6004, context);
    this.name = "UnauthorizedCancelError";
  }
}

export class FrequencyTooLowError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Plan frequency below minimum (3600 seconds)", 6005, context);
    this.name = "FrequencyTooLowError";
  }
}

export class OverflowError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Arithmetic overflow", 6006, context);
    this.name = "OverflowError";
  }
}

export class PlanNotActiveError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Plan is not active", 6007, context);
    this.name = "PlanNotActiveError";
  }
}

export class MandateExpiredError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Mandate has expired", 6008, context);
    this.name = "MandateExpiredError";
  }
}

export class AmountExceedsPlanAmountError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Pull amount exceeds plan amount", 6009, context);
    this.name = "AmountExceedsPlanAmountError";
  }
}

export class MaxPullsTooLowError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Plan max_pulls must be at least 1", 6010, context);
    this.name = "MaxPullsTooLowError";
  }
}
