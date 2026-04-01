import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { deriveKeeperConfigAddress } from "./accounts/pda";
import type { BillingScheduleParams, KeeperConfig, KeeperMode } from "./types";

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

/**
 * Registers a billing schedule with the centralized keeper Worker.
 *
 * Routes to the KeeperConfig endpoint's `/api/keeper/register` route.
 * The keeper Worker (Plan 02) reads this to schedule periodic pulls.
 *
 * If keeperEndpoint is provided, it overrides the on-chain KeeperConfig value.
 */
export async function registerBillingSchedule(
  program: Program,
  params: BillingScheduleParams,
  keeperEndpoint?: string,
): Promise<{ success: boolean; scheduleId?: string }> {
  const endpoint =
    keeperEndpoint ?? (await fetchKeeperConfig(program)).keeperEndpoint;
  const response = await fetch(`${endpoint}/api/keeper/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mandateAddress: params.mandateAddress.toBase58(),
      planAddress: params.planAddress.toBase58(),
      subscriberAddress: params.subscriberAddress.toBase58(),
      merchantAddress: params.merchantAddress.toBase58(),
      frequency: params.frequency.toString(),
      nextPaymentDue: new Date(
        Number(params.nextPaymentDue) * 1000,
      ).toISOString(),
    }),
  });
  const data = (await response.json()) as { id?: string };
  return { success: response.ok, scheduleId: data.id };
}

/**
 * Cancels a billing schedule in the centralized keeper Worker.
 *
 * Routes DELETE to the KeeperConfig endpoint's `/api/keeper/{mandateAddress}` route.
 * Called when a subscription is cancelled to stop future pulls.
 *
 * If keeperEndpoint is provided, it overrides the on-chain KeeperConfig value.
 */
export async function cancelBillingSchedule(
  program: Program,
  mandateAddress: PublicKey,
  keeperEndpoint?: string,
): Promise<{ success: boolean }> {
  const endpoint =
    keeperEndpoint ?? (await fetchKeeperConfig(program)).keeperEndpoint;
  const response = await fetch(
    `${endpoint}/api/keeper/${mandateAddress.toBase58()}`,
    { method: "DELETE" },
  );
  return { success: response.ok };
}
