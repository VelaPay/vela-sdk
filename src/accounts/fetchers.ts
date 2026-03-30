import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { deserializeMandate, deserializePlan, deserializeMerchantState } from "./deserialize";
import { deriveMerchantStateAddress } from "./pda";
import type { VelaMandate, VelaPlan, MerchantState } from "../types";

/**
 * Fetches active subscriptions (mandates) filtered by subscriber or merchant.
 *
 * Uses Anchor's `program.account.velaMandate.all()` with memcmp filters:
 * - subscriber: offset 8 (8-byte discriminator), 32-byte pubkey
 * - merchant:   offset 72 (8 + 32 subscriber + 32 plan), 32-byte pubkey
 */
export async function getActiveSubscriptions(
  program: Program,
  filter: { subscriber?: PublicKey; merchant?: PublicKey },
): Promise<VelaMandate[]> {
  const filters: Array<{ memcmp: { offset: number; bytes: string } }> = [];

  if (filter.subscriber) {
    filters.push({
      memcmp: { offset: 8, bytes: filter.subscriber.toBase58() },
    });
  }

  if (filter.merchant) {
    filters.push({
      memcmp: { offset: 72, bytes: filter.merchant.toBase58() },
    });
  }

  const accounts = await (program.account as any).velaMandate.all(filters);

  return accounts.map((acc: any) =>
    deserializeMandate(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a single VelaPlan by its address.
 */
export async function getPlanDetails(
  program: Program,
  planAddress: PublicKey,
): Promise<VelaPlan> {
  const raw = await (program.account as any).velaPlan.fetch(planAddress);
  return deserializePlan(planAddress, raw);
}

/**
 * Fetches all plans owned by a merchant.
 *
 * Uses memcmp filter at offset 8 (8-byte discriminator) for the merchant pubkey field.
 */
export async function getMerchantPlans(
  program: Program,
  merchant: PublicKey,
): Promise<VelaPlan[]> {
  const accounts = await (program.account as any).velaPlan.all([
    { memcmp: { offset: 8, bytes: merchant.toBase58() } },
  ]);

  return accounts.map((acc: any) =>
    deserializePlan(acc.publicKey, acc.account),
  );
}

/**
 * Fetches and deserializes a merchant's state account.
 */
export async function getMerchantState(
  program: Program,
  merchant: PublicKey,
): Promise<MerchantState> {
  const [merchantStateAddress] = deriveMerchantStateAddress(merchant, program.programId);
  const raw = await (program.account as any).merchantState.fetch(merchantStateAddress);
  return deserializeMerchantState(merchantStateAddress, raw);
}
