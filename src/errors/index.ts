export { VelaError } from "./base";
export {
  AmountExceedsPlanAmountError,
  FrequencyTooLowError,
  InsufficientFundsError,
  MandateExpiredError,
  MandateNotActiveError,
  MaxPullsExceededError,
  MaxPullsTooLowError,
  OverflowError,
  PlanNotActiveError,
  PullTooEarlyError,
  UnauthorizedCancelError,
  UnauthorizedAdminError,
  ProtocolPausedError,
} from "./program-errors";
export { translateError } from "./translate";
