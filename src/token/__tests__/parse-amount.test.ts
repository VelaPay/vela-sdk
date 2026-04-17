import { describe, expect, test } from "bun:test";
import { AmountPrecisionExceeded } from "../../errors/upgrade-errors";
import { parseAmount } from "../parse-amount";

describe("parseAmount", () => {
  test("parses valid decimal strings", () => {
    expect(parseAmount("12.34", { decimals: 6 })).toBe(12_340_000n);
    expect(parseAmount("0", { decimals: 6 })).toBe(0n);
    expect(parseAmount("42", { decimals: 0 })).toBe(42n);
  });

  test("throws typed precision errors when fractional digits exceed decimals", () => {
    expect(() => parseAmount("12.3456789", { decimals: 6 })).toThrow(
      AmountPrecisionExceeded,
    );
  });

  test("rejects negative and whitespace-padded values", () => {
    expect(() => parseAmount("-1", { decimals: 6 })).toThrow(Error);
    expect(() => parseAmount(" 1.2", { decimals: 6 })).toThrow(Error);
    expect(() => parseAmount("1.2 ", { decimals: 6 })).toThrow(Error);
  });
});
