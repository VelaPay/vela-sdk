import type {
  AgentBudgetSummary,
  AgentMandate,
  AgentMandateStatus,
  AgentServiceLimit,
  VelaMandate,
  VelaPlan,
} from "../../src/types";

const AGENT_DAILY_RESET_WINDOW_SECONDS = 86_400n;

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

export function formatAddress(address: { toBase58(): string }): string {
  const base58 = address.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
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

function formatAgentMandateStatus(status: AgentMandateStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function clampRemaining(limit: bigint, spent: bigint): bigint {
  return limit > spent ? limit - spent : 0n;
}

function computeResetWindow(
  spent: bigint,
  lastReset: bigint,
  now: bigint,
): { spent: bigint; nextResetAt: bigint } {
  if (now - lastReset >= AGENT_DAILY_RESET_WINDOW_SECONDS) {
    return {
      spent: 0n,
      nextResetAt: now + AGENT_DAILY_RESET_WINDOW_SECONDS,
    };
  }

  return {
    spent,
    nextResetAt: lastReset + AGENT_DAILY_RESET_WINDOW_SECONDS,
  };
}

function formatAgentServiceRow(
  serviceLimit: AgentServiceLimit,
  now: bigint,
  selectedServiceBase58?: string,
): string {
  const serviceWindow = computeResetWindow(
    serviceLimit.dailySpent,
    serviceLimit.lastReset,
    now,
  );
  const remaining = clampRemaining(serviceLimit.dailyLimit, serviceWindow.spent);
  const selectedLabel =
    selectedServiceBase58 != null &&
    serviceLimit.service.toBase58() === selectedServiceBase58
      ? " (selected)"
      : "";

  return [
    `- ${serviceLimit.service.toBase58()}${selectedLabel}`,
    `  Remaining: ${formatLamports(remaining)}`,
    `  Limit: ${formatLamports(serviceLimit.dailyLimit)}`,
    `  Reset: ${formatTimestamp(serviceWindow.nextResetAt)}`,
  ].join("\n");
}

export function formatAgentMandateBudget(
  summary: AgentBudgetSummary,
  selectedService?: { toBase58(): string },
): string {
  const lifetimeRemaining = clampRemaining(
    summary.mandate.lifetimeCap,
    summary.mandate.totalSpent,
  );
  const now = BigInt(Math.floor(Date.now() / 1000));
  const selectedServiceBase58 = selectedService?.toBase58();
  const lines = [
    `Mandate: ${summary.mandate.address.toBase58()}`,
    `Status: ${formatAgentMandateStatus(summary.status)}`,
    `Authority: ${summary.mandate.authority.toBase58()}`,
    `Agent: ${summary.mandate.agent.toBase58()}`,
    `Daily Remaining: ${formatLamports(summary.globalRemaining)}`,
    `Daily Reset: ${formatTimestamp(summary.dailyResetAt)}`,
    `Lifetime Remaining: ${formatLamports(lifetimeRemaining)}`,
    `Wrapped Balance: ${formatLamports(summary.mandateBalance)}`,
    `Funded: ${summary.funded ? "Yes" : "No"}`,
    `Min Pull Amount: ${formatLamports(summary.mandate.minPullAmount)}`,
    `Min Pull Interval: ${formatDuration(summary.mandate.minPullInterval)}`,
  ];

  if (selectedServiceBase58) {
    lines.push(`Service Requested: ${selectedServiceBase58}`);
    lines.push(`Service Authorized: ${summary.serviceAuthorized ? "Yes" : "No"}`);
    lines.push(
      `Service Remaining: ${
        summary.serviceRemaining == null
          ? "N/A"
          : formatLamports(summary.serviceRemaining)
      }`,
    );
    lines.push(
      `Service Reset: ${
        summary.serviceResetAt == null
          ? "N/A"
          : formatTimestamp(summary.serviceResetAt)
      }`,
    );
  }

  if (summary.mandate.services.length === 0) {
    lines.push("Services: None");
    return lines.join("\n");
  }

  lines.push("Services:");
  for (const serviceLimit of summary.mandate.services) {
    lines.push(
      formatAgentServiceRow(serviceLimit, now, selectedServiceBase58),
    );
  }

  return lines.join("\n");
}

export function formatAgentMandateList(
  mandates: AgentMandate[],
  authority?: { toBase58(): string },
): string {
  if (mandates.length === 0) {
    return authority == null
      ? "No agent mandates found."
      : `No agent mandates found for ${authority.toBase58()}.`;
  }

  const header = [
    "MANDATE".padEnd(14),
    "AGENT".padEnd(14),
    "STATUS".padEnd(10),
    "DAILY REMAINING".padEnd(18),
    "LIFETIME REMAINING".padEnd(21),
    "SERVICES",
  ].join(" ");

  const rows = mandates.map((mandate) =>
    [
      formatAddress(mandate.address).padEnd(14),
      formatAddress(mandate.agent).padEnd(14),
      formatAgentMandateStatus(mandate.status).padEnd(10),
      formatLamports(
        clampRemaining(mandate.dailyLimit, mandate.dailySpent),
      ).padEnd(18),
      formatLamports(
        clampRemaining(mandate.lifetimeCap, mandate.totalSpent),
      ).padEnd(21),
      mandate.services.length.toString(),
    ].join(" "),
  );

  return [header, ...rows].join("\n");
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
