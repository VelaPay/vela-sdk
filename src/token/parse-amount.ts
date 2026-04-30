import { AmountPrecisionExceeded } from "../errors/upgrade-errors";
import type { TokenConfigAccount } from "../types";

const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

export function parseAmount(
  displayAmount: string,
  tokenConfig: Pick<TokenConfigAccount, "decimals">,
): bigint {
  if (
    displayAmount.trim() !== displayAmount ||
    !AMOUNT_PATTERN.test(displayAmount)
  ) {
    throw new Error(
      "Amount must be a non-negative decimal string without whitespace",
    );
  }

  const [whole, fraction = ""] = displayAmount.split(".");
  if (fraction.length > tokenConfig.decimals) {
    throw new AmountPrecisionExceeded(displayAmount, tokenConfig.decimals);
  }

  const paddedFraction = fraction.padEnd(tokenConfig.decimals, "0");
  return BigInt(`${whole}${paddedFraction}`);
}
