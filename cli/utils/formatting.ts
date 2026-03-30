import type { VelaMandate, VelaPlan } from "../../src/types";

/**
 * Converts raw USDC amount (6 decimals) to human-readable string.
 *
 * Example: 25_000_000n -> "25.000000 USDC"
 */
export function formatLamports(lamports: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = lamports / divisor;
  const fractional = lamports % divisor;
  const fractionalStr = fractional.toString().padStart(decimals, "0");
  return `${whole}.${fractionalStr} USDC`;
}

/**
 * Converts a unix timestamp (seconds) to an ISO date string.
 *
 * Example: 1700000000n -> "2023-11-14T22:13:20.000Z"
 */
export function formatTimestamp(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

/**
 * Converts seconds to a human-readable duration string.
 *
 * Examples:
 *   2592000n -> "30 days"
 *   604800n  -> "7 days"
 *   3600n    -> "1 hour"
 *   86400n   -> "1 day"
 *   7200n    -> "2 hours"
 */
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);

  if (s >= 86400) {
    const days = Math.round(s / 86400);
    return days === 1 ? "1 day" : `${days} days`;
  }

  if (s >= 3600) {
    const hours = Math.round(s / 3600);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  if (s >= 60) {
    const minutes = Math.round(s / 60);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  return s === 1 ? "1 second" : `${s} seconds`;
}

/**
 * Formats a VelaMandate into a multi-line human-readable string (per D-09).
 *
 * Output:
 *   Mandate: <address>
 *   Status: Active
 *   Subscriber: <address>
 *   Merchant: <address>
 *   Amount: 25.000000 USDC
 *   Frequency: 30 days
 *   Pulls: 3/12 executed
 *   Next Payment: 2026-04-30T00:00:00.000Z
 *   Started: 2026-03-30T00:00:00.000Z
 *   Expires: 2027-03-30T00:00:00.000Z
 */
export function formatMandateStatus(mandate: VelaMandate): string {
  const statusLabel =
    mandate.status === "active"
      ? "Active"
      : mandate.status === "cancelled"
        ? "Cancelled"
        : "Expired";

  const lines = [
    `Mandate: ${mandate.address.toBase58()}`,
    `Status: ${statusLabel}`,
    `Subscriber: ${mandate.subscriber.toBase58()}`,
    `Merchant: ${mandate.merchant.toBase58()}`,
    `Amount: ${formatLamports(mandate.amount)}`,
    `Frequency: ${formatDuration(mandate.frequency)}`,
    `Pulls: ${mandate.pullsExecuted.toString()}/${mandate.maxPulls.toString()} executed`,
    `Next Payment: ${formatTimestamp(mandate.nextPaymentDue)}`,
    `Started: ${formatTimestamp(mandate.startDate)}`,
    `Expires: ${formatTimestamp(mandate.expiry)}`,
  ];

  return lines.join("\n");
}

/**
 * Formats a VelaPlan into a multi-line human-readable string.
 */
export function formatPlanDetails(plan: VelaPlan): string {
  const statusLabel = plan.status === "active" ? "Active" : "Inactive";

  const lines = [
    `Plan: ${plan.address.toBase58()}`,
    `Status: ${statusLabel}`,
    `Merchant: ${plan.merchant.toBase58()}`,
    `Plan ID: ${plan.planId.toString()}`,
    `Amount: ${formatLamports(plan.amount)}`,
    `Frequency: ${formatDuration(plan.frequency)}`,
    `Trial Period: ${plan.trialPeriod === 0n ? "None" : formatDuration(plan.trialPeriod)}`,
    `Max Pulls: ${plan.maxPulls.toString()}`,
    `Credential Mint: ${plan.credentialMint.toBase58()}`,
  ];

  return lines.join("\n");
}
