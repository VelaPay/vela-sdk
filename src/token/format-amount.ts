import type { TokenConfigAccount } from "../types";

export function formatAmount(
  rawAmount: bigint,
  tokenConfig: Pick<TokenConfigAccount, "decimals">,
): string {
  const negative = rawAmount < 0n;
  const absolute = negative ? -rawAmount : rawAmount;
  const decimals = tokenConfig.decimals;
  const padded = absolute.toString().padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction =
    decimals === 0 ? "" : padded.slice(-decimals).replace(/0+$/, "");
  const formatted = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${formatted}` : formatted;
}
