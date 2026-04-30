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

export class UnauthorizedAdminError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Only the protocol admin can perform this action", 6016, context);
    this.name = "UnauthorizedAdminError";
  }
}

export class ProtocolPausedError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Protocol is paused -- billing pulls are blocked", 6060, context);
    this.name = "ProtocolPausedError";
  }
}

export class UnauthorizedAgentError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Only the authorized agent signer can execute this pull",
      6030,
      context,
    );
    this.name = "UnauthorizedAgentError";
  }
}

export class UnauthorizedServiceError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Destination service is not authorized on this agent mandate",
      6031,
      context,
    );
    this.name = "UnauthorizedServiceError";
  }
}

export class TooManyServicesError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Agent mandate service list exceeds the maximum allowed entries",
      6032,
      context,
    );
    this.name = "TooManyServicesError";
  }
}

export class DuplicateServiceError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Agent mandate service list contains a duplicate service",
      6033,
      context,
    );
    this.name = "DuplicateServiceError";
  }
}

export class MandatePausedError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate is paused and cannot process pulls", 6034, context);
    this.name = "MandatePausedError";
  }
}

export class MandateRevokedError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate is revoked and cannot process pulls", 6035, context);
    this.name = "MandateRevokedError";
  }
}

export class DailyLimitExceededError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Agent mandate daily limit would be exceeded by this pull",
      6036,
      context,
    );
    this.name = "DailyLimitExceededError";
  }
}

export class ServiceDailyLimitExceededError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Service daily limit would be exceeded by this pull", 6037, context);
    this.name = "ServiceDailyLimitExceededError";
  }
}

export class LifetimeCapExceededError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Agent mandate lifetime cap would be exceeded by this pull",
      6038,
      context,
    );
    this.name = "LifetimeCapExceededError";
  }
}

export class PullAmountTooSmallError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Pull amount is below the agent mandate minimum pull amount",
      6039,
      context,
    );
    this.name = "PullAmountTooSmallError";
  }
}

export class PullCooldownActiveError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate pull cooldown is still active", 6040, context);
    this.name = "PullCooldownActiveError";
  }
}

export class InvalidServiceListError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate service list is invalid", 6041, context);
    this.name = "InvalidServiceListError";
  }
}

export class AgentMandateAlreadyExistsError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Agent mandate already exists for this authority and agent",
      6042,
      context,
    );
    this.name = "AgentMandateAlreadyExistsError";
  }
}

export class AgentMandateNotFoundError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate account was not found", 6043, context);
    this.name = "AgentMandateNotFoundError";
  }
}

export class InsufficientMandateBalanceError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Mandate-owned wrapped token account has insufficient balance",
      6044,
      context,
    );
    this.name = "InsufficientMandateBalanceError";
  }
}

export class NoFundsToDrainError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super("Agent mandate has no funds available to drain", 6045, context);
    this.name = "NoFundsToDrainError";
  }
}

export class InvalidAgentMandateStatusTransitionError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Requested agent mandate status transition is invalid",
      6046,
      context,
    );
    this.name = "InvalidAgentMandateStatusTransitionError";
  }
}

export class UnauthorizedAgentMandateAuthorityError extends VelaError {
  constructor(context?: Record<string, unknown>) {
    super(
      "Only the agent mandate authority can perform this action",
      6047,
      context,
    );
    this.name = "UnauthorizedAgentMandateAuthorityError";
  }
}
