import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { PublicKey } from "@solana/web3.js";
import { UpgradeBuilder } from "../../builders";
import { computeProration } from "../preview";
import type { TokenConfigAccount, VelaMandate } from "../../types";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const plan = new PublicKey("11111111111111111111111111111114");
const nextPlan = new PublicKey("11111111111111111111111111111115");
const mint = new PublicKey("11111111111111111111111111111116");

const tokenConfig: TokenConfigAccount = {
  mint,
  tokenProgram: mint,
  billingRail: "transferHook",
  decimals: 6,
  enabled: true,
  oracleReference: PublicKey.default,
};

const MAX_AMOUNT = 10n ** 12n;
const DAY = 86_400n;
const NOW_SECONDS = 1_700_000_000n;

function mandateFromWindow(oldAmount: bigint, elapsed: bigint, total: bigint): VelaMandate {
  return {
    address: new PublicKey("11111111111111111111111111111117"),
    subscriber,
    plan,
    merchant,
    mandateIndex: 3n,
    amount: oldAmount,
    frequency: total,
    startDate: NOW_SECONDS - elapsed,
    expiry: 0n,
    maxPulls: 12n,
    pullsExecuted: 0n,
    nextPaymentDue: NOW_SECONDS + (total - elapsed),
    status: "active",
    bump: 255,
    billingType: "flat",
    version: 3,
  };
}

describe("UpgradeBuilder preview parity", () => {
  test("matches computeProration across 256 favor-subscriber cases", () => {
    const originalNow = Date.now;
    Date.now = () => Number(NOW_SECONDS) * 1000;

    try {
      fc.assert(
        fc.property(
          fc.record({
            oldAmount: fc.bigInt({ min: 1n, max: MAX_AMOUNT }),
            newAmount: fc.bigInt({ min: 1n, max: MAX_AMOUNT }),
            total: fc.bigInt({ min: 1n, max: 365n * DAY }),
            elapsed: fc.bigInt({ min: 0n, max: 365n * DAY }),
          }),
          ({ oldAmount, newAmount, total, elapsed }) => {
            fc.pre(elapsed <= total);

            const mandate = mandateFromWindow(oldAmount, elapsed, total);
            const preview = UpgradeBuilder.previewPlanChange(
              mandate,
              {
                address: nextPlan,
                amount: newAmount,
              },
              tokenConfig,
            );
            const expected = computeProration(
              oldAmount,
              newAmount,
              elapsed,
              total,
            );

            expect(preview.outcome).toBe(expected.outcome);
            expect(preview.prorationAmount).toBe(expected.prorationAmount);
          },
        ),
        { numRuns: 256 },
      );
    } finally {
      Date.now = originalNow;
    }
  });
});
