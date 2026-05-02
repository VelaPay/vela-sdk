export type ProrationOutcome =
  | "ChargeNow"
  | "CreditNow"
  | "NoOp"
  | "ScheduledChange";

export interface PreviewPlanChangeResult {
  outcome: ProrationOutcome;
  prorationAmount: bigint;
}

export function computeProration(
  planAmountOld: bigint,
  planAmountNew: bigint,
  elapsedSeconds: bigint,
  periodTotalSeconds: bigint,
): PreviewPlanChangeResult {
  if (planAmountOld < 0n || planAmountNew < 0n) {
    throw new RangeError("Plan amounts must be non-negative");
  }
  if (periodTotalSeconds <= 0n) {
    throw new RangeError("periodTotalSeconds must be greater than zero");
  }
  if (elapsedSeconds < 0n) {
    throw new RangeError("elapsedSeconds must be non-negative");
  }
  if (elapsedSeconds > periodTotalSeconds) {
    throw new RangeError("elapsedSeconds must not exceed periodTotalSeconds");
  }

  const remaining = periodTotalSeconds - elapsedSeconds;
  const numerator = (planAmountNew - planAmountOld) * remaining;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const truncatedAbs = absNumerator / periodTotalSeconds;
  const raw = numerator < 0n ? -truncatedAbs : truncatedAbs;

  if (raw === 0n) {
    return { outcome: "NoOp", prorationAmount: 0n };
  }
  if (raw > 0n) {
    return { outcome: "ChargeNow", prorationAmount: raw };
  }
  return { outcome: "CreditNow", prorationAmount: raw };
}
