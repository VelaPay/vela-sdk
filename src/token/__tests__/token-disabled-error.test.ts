import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  AmountPrecisionExceeded,
  TokenChangeNotSupported,
  TokenConfigDisabled,
  TokenConfigNotFound,
} from "../../errors/upgrade-errors";

const mint = new PublicKey("11111111111111111111111111111112");

describe("upgrade/token typed errors", () => {
  test("preserve instanceof relationships and stable names", () => {
    expect(new TokenConfigNotFound(mint)).toBeInstanceOf(Error);
    expect(new TokenConfigNotFound(mint).name).toBe("TokenConfigNotFound");
    expect(new TokenConfigDisabled(mint).name).toBe("TokenConfigDisabled");
    expect(new AmountPrecisionExceeded("1.234567", 2).name).toBe(
      "AmountPrecisionExceeded",
    );
    expect(new TokenChangeNotSupported(mint, mint).name).toBe(
      "TokenChangeNotSupported",
    );
  });
});
