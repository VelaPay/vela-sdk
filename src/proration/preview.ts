import Decimal from "decimal.js";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_EVEN });

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
    throw new RangeError(
      "elapsedSeconds must not exceed periodTotalSeconds",
    );
  }

  const oldAmount = new Decimal(planAmountOld.toString());
  const newAmount = new Decimal(planAmountNew.toString());
  const elapsed = new Decimal(elapsedSeconds.toString());
  const total = new Decimal(periodTotalSeconds.toString());
  const remaining = total.minus(elapsed);

  const usedOld = oldAmount.mul(elapsed).div(total);
  const unusedOld = oldAmount.minus(usedOld);
  const newForRemaining = newAmount.mul(remaining).div(total);
  const signedDelta = newForRemaining.minus(unusedOld);
  const truncatedAbs = signedDelta.abs().floor();
  const signed = signedDelta.isNegative() ? truncatedAbs.neg() : truncatedAbs;
  const raw = BigInt(signed.toFixed(0));

  if (raw === 0n) {
    return { outcome: "NoOp", prorationAmount: 0n };
  }
  if (raw > 0n) {
    return { outcome: "ChargeNow", prorationAmount: raw };
  }
  return { outcome: "CreditNow", prorationAmount: raw };
}
