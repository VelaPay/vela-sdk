import { describe, expect, test } from "bun:test";

import { computeProration } from "../preview";

const DAY = 86_400n;

describe("computeProration favor-subscriber cases", () => {
  test.each([
    [
      "periodic-upward-exact",
      10_000_000n,
      20_000_000n,
      15n * DAY,
      30n * DAY,
      "ChargeNow",
      5_000_000n,
    ],
    [
      "periodic-downward-exact",
      20_000_000n,
      10_000_000n,
      15n * DAY,
      30n * DAY,
      "CreditNow",
      -5_000_000n,
    ],
    [
      "streaming-upward-exact",
      1_000_000n,
      2_000_000n,
      12n * 3_600n,
      24n * 3_600n,
      "ChargeNow",
      500_000n,
    ],
    [
      "streaming-downward-exact",
      2_000_000n,
      1_000_000n,
      12n * 3_600n,
      24n * 3_600n,
      "CreditNow",
      -500_000n,
    ],
    [
      "periodic-upward-subcent",
      10_000_001n,
      20_000_000n,
      15n * DAY,
      30n * DAY,
      "ChargeNow",
      4_999_999n,
    ],
    [
      "periodic-downward-subcent",
      20_000_000n,
      10_000_001n,
      15n * DAY,
      30n * DAY,
      "CreditNow",
      -4_999_999n,
    ],
    [
      "streaming-upward-subcent",
      1_000_001n,
      2_000_000n,
      12n * 3_600n,
      24n * 3_600n,
      "ChargeNow",
      499_999n,
    ],
    [
      "streaming-downward-subcent",
      2_000_000n,
      1_000_001n,
      12n * 3_600n,
      24n * 3_600n,
      "CreditNow",
      -499_999n,
    ],
  ] as const)("%s", (_, oldAmount, newAmount, elapsed, total, expectedOutcome, expectedAmount) => {
    expect(computeProration(oldAmount, newAmount, elapsed, total)).toEqual({
      outcome: expectedOutcome,
      prorationAmount: expectedAmount,
    });
  });
});
