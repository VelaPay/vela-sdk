export { VelaError } from "./base";
export {
  AgentMandateAlreadyExistsError,
  AgentMandateNotFoundError,
  AmountExceedsPlanAmountError,
  DailyLimitExceededError,
  DuplicateServiceError,
  FrequencyTooLowError,
  InsufficientFundsError,
  InsufficientMandateBalanceError,
  InvalidAgentMandateStatusTransitionError,
  InvalidServiceListError,
  LifetimeCapExceededError,
  MandateExpiredError,
  MandateNotActiveError,
  MandatePausedError,
  MandateRevokedError,
  MaxPullsExceededError,
  MaxPullsTooLowError,
  NoFundsToDrainError,
  OverflowError,
  PlanNotActiveError,
  ProtocolPausedError,
  PullAmountTooSmallError,
  PullCooldownActiveError,
  PullTooEarlyError,
  ServiceDailyLimitExceededError,
  TooManyServicesError,
  UnauthorizedAdminError,
  UnauthorizedAgentError,
  UnauthorizedAgentMandateAuthorityError,
  UnauthorizedCancelError,
  UnauthorizedServiceError,
} from "./program-errors";
export {
  InvalidPaymentHeaderError,
  InvalidRawAmountError,
  PaymentProofExpiredError,
  PaymentProofMismatchError,
  PaymentTransactionVerificationError,
} from "./sdk-errors";
export {
  StreamInsufficientBalanceError,
  StreamMinIntervalError,
  StreamTerminalStatusError,
  WrongAccountTypeError,
} from "./stream-errors";
export { translateError } from "./translate";
export {
  AmountPrecisionExceeded,
  TokenChangeNotSupported,
  TokenConfigDisabled,
  TokenConfigNotFound,
} from "./upgrade-errors";
