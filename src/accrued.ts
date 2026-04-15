import { StreamTerminalStatusError } from "./errors/stream-errors";
import type { StreamMandate } from "./types/stream-mandate";

export function accruedNow(mandate: StreamMandate, nowSec?: bigint): bigint {
  if (mandate.status === "cancelled") {
    throw new StreamTerminalStatusError(mandate.address, mandate.status);
  }
  if (mandate.status === "paused") {
    return 0n;
  }

  const now = nowSec ?? BigInt(Math.floor(Date.now() / 1000));
  const elapsed = now - mandate.lastSettledTs;
  if (elapsed < 0n) {
    return 0n;
  }

  const gross = elapsed * mandate.ratePerSecond;
  if (mandate.maxStreamed == null) {
    return gross;
  }

  const remaining = mandate.maxStreamed - mandate.totalStreamed;
  if (remaining <= 0n) {
    return 0n;
  }

  return gross < remaining ? gross : remaining;
}
