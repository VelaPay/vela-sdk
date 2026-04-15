import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { computeProration } from "../preview";

const DAY = 86_400n;
const MAX_AMOUNT = 10n ** 12n;
const MAX_PERIOD = 365n * DAY;

describe("computeProration quadrant coverage", () => {
  test("covers the four explicit upgrade quadrants", () => {
    expect(
      computeProration(10_000_000n, 20_000_000n, 15n * DAY, 30n * DAY),
    ).toEqual({
      outcome: "ChargeNow",
      prorationAmount: 5_000_000n,
    });

    expect(
      computeProration(20_000_000n, 10_000_000n, 15n * DAY, 30n * DAY),
    ).toEqual({
      outcome: "CreditNow",
      prorationAmount: -5_000_000n,
    });

    expect(
      computeProration(1_000_000n, 2_000_000n, 12n * 3_600n, 24n * 3_600n),
    ).toEqual({
      outcome: "ChargeNow",
      prorationAmount: 500_000n,
    });

    expect(
      computeProration(2_000_000n, 1_000_000n, 12n * 3_600n, 24n * 3_600n),
    ).toEqual({
      outcome: "CreditNow",
      prorationAmount: -500_000n,
    });
  });

  test("returns NoOp when the old and new plans are identical", () => {
    expect(
      computeProration(10_000_000n, 10_000_000n, 7n * DAY, 30n * DAY),
    ).toEqual({
      outcome: "NoOp",
      prorationAmount: 0n,
    });
  });

  test("keeps reverse plan swaps symmetric across 256 random inputs", () => {
    const prorationInputArb = fc
      .record({
        oldAmount: fc.bigInt({ min: 1n, max: MAX_AMOUNT }),
        newAmount: fc.bigInt({ min: 1n, max: MAX_AMOUNT }),
        total: fc.bigInt({ min: 1n, max: MAX_PERIOD }),
      })
      .chain(({ oldAmount, newAmount, total }) =>
        fc.record({
          oldAmount: fc.constant(oldAmount),
          newAmount: fc.constant(newAmount),
          total: fc.constant(total),
          elapsed: fc.bigInt({ min: 0n, max: total }),
        }),
      );

    fc.assert(
      fc.property(
        prorationInputArb,
        ({ oldAmount, newAmount, elapsed, total }) => {
          const forward = computeProration(
            oldAmount,
            newAmount,
            elapsed,
            total,
          );
          const reverse = computeProration(
            newAmount,
            oldAmount,
            elapsed,
            total,
          );

          expect(forward.prorationAmount).toBe(-reverse.prorationAmount);

          if (forward.prorationAmount > 0n) {
            expect(forward.outcome).toBe("ChargeNow");
          } else if (forward.prorationAmount < 0n) {
            expect(forward.outcome).toBe("CreditNow");
          } else {
            expect(forward.outcome).toBe("NoOp");
          }
        },
      ),
      { numRuns: 256 },
    );
  });
});
