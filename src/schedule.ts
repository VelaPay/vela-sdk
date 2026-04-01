import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { deriveKeeperConfigAddress } from "./accounts/pda";
import type { BillingScheduleParams, KeeperConfig, KeeperMode } from "./types";

/** Strip trailing slashes from an endpoint URL to prevent double-slash in paths. */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function authHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Fetches and deserializes the KeeperConfig PDA from the chain.
 * Returns a typed KeeperConfig object.
 */
export async function fetchKeeperConfig(
  program: Program,
  programId?: PublicKey,
): Promise<KeeperConfig> {
  const resolvedProgramId = programId ?? program.programId;
  const [address] = deriveKeeperConfigAddress(resolvedProgramId);
  const raw = await (program.account as any).keeperConfig.fetch(address);
  const endpointBytes = raw.keeperEndpoint.slice(0, raw.endpointLen);
  const mode: KeeperMode =
    raw.mode.centralized !== undefined ? "centralized" : "tuktuk";
  return {
    admin: raw.admin,
    mode,
    keeperEndpoint: Buffer.from(endpointBytes).toString("utf-8"),
    keeperAuthority: raw.keeperAuthority,
    bump: raw.bump,
  };
}

export interface KeeperScheduleOptions {
  keeperEndpoint?: string;
  authToken?: string;
}

/**
 * Registers a billing schedule with the centralized keeper Worker.
 *
 * Routes to the KeeperConfig endpoint's `/api/keeper/register` route.
 * The keeper Worker (Plan 02) reads this to schedule periodic pulls.
 *
 * If keeperEndpoint is provided, it overrides the on-chain KeeperConfig value.
 * authToken is required — the keeper endpoint requires bearer authentication.
 */
export async function registerBillingSchedule(
  program: Program,
  params: BillingScheduleParams,
  options?: KeeperScheduleOptions | string,
): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
  // Support legacy signature: registerBillingSchedule(program, params, "endpoint")
  const opts: KeeperScheduleOptions =
    typeof options === "string" ? { keeperEndpoint: options } : options ?? {};

  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(
      opts.keeperEndpoint ?? (await fetchKeeperConfig(program)).keeperEndpoint,
    );
  } catch (err) {
    return { success: false, error: `Failed to resolve keeper endpoint: ${String(err)}` };
  }

  if (!endpoint) {
    return { success: false, error: "Keeper endpoint is empty" };
  }

  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/keeper/register`, {
      method: "POST",
      headers: authHeaders(opts.authToken),
      body: JSON.stringify({
        mandateAddress: params.mandateAddress.toBase58(),
        planAddress: params.planAddress.toBase58(),
        subscriberAddress: params.subscriberAddress.toBase58(),
        merchantAddress: params.merchantAddress.toBase58(),
        frequency: params.frequency.toString(),
        nextPaymentDue: new Date(
          Number(params.nextPaymentDue) * 1000,
        ).toISOString(),
        ...(params.billingType ? { billingType: params.billingType } : {}),
        ...(params.usagePlanAddress
          ? { usagePlanAddress: params.usagePlanAddress.toBase58() }
          : {}),
      }),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}` };
  }

  if (!response.ok) {
    let errorBody: string;
    try {
      const body = (await response.json()) as { error?: string };
      errorBody = body.error ?? `HTTP ${response.status}`;
    } catch {
      errorBody = `HTTP ${response.status}`;
    }
    return { success: false, error: errorBody };
  }

  const data = (await response.json()) as { id?: string };
  return { success: true, scheduleId: data.id };
}

/**
 * Cancels a billing schedule in the centralized keeper Worker.
 *
 * Routes DELETE to the KeeperConfig endpoint's `/api/keeper/{mandateAddress}` route.
 * Called when a subscription is cancelled to stop future pulls.
 *
 * If keeperEndpoint is provided, it overrides the on-chain KeeperConfig value.
 * authToken is required — the keeper endpoint requires bearer authentication.
 */
export async function cancelBillingSchedule(
  program: Program,
  mandateAddress: PublicKey,
  options?: KeeperScheduleOptions | string,
): Promise<{ success: boolean; error?: string }> {
  const opts: KeeperScheduleOptions =
    typeof options === "string" ? { keeperEndpoint: options } : options ?? {};

  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(
      opts.keeperEndpoint ?? (await fetchKeeperConfig(program)).keeperEndpoint,
    );
  } catch (err) {
    return { success: false, error: `Failed to resolve keeper endpoint: ${String(err)}` };
  }

  if (!endpoint) {
    return { success: false, error: "Keeper endpoint is empty" };
  }

  let response: Response;
  try {
    response = await fetch(
      `${endpoint}/api/keeper/${mandateAddress.toBase58()}`,
      { method: "DELETE", headers: authHeaders(opts.authToken) },
    );
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}` };
  }

  if (!response.ok) {
    let errorBody: string;
    try {
      const body = (await response.json()) as { error?: string };
      errorBody = body.error ?? `HTTP ${response.status}`;
    } catch {
      errorBody = `HTTP ${response.status}`;
    }
    return { success: false, error: errorBody };
  }

  return { success: true };
}
