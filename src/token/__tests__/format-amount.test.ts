import { describe, expect, test } from "bun:test";
import { formatAmount } from "../format-amount";

describe("formatAmount", () => {
  test("formats six-decimal token amounts and trims trailing zeroes", () => {
    expect(formatAmount(12_340_000n, { decimals: 6 })).toBe("12.34");
    expect(formatAmount(0n, { decimals: 6 })).toBe("0");
    expect(formatAmount(1n, { decimals: 6 })).toBe("0.000001");
  });

  test("formats signed amounts", () => {
    expect(formatAmount(-5_000_000n, { decimals: 6 })).toBe("-5");
  });

  test("supports non-USDC decimals", () => {
    expect(formatAmount(1_234_567_890n, { decimals: 9 })).toBe("1.23456789");
    expect(formatAmount(42n, { decimals: 0 })).toBe("42");
  });
});
