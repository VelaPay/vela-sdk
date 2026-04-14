import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { PDAFactory } from "../accounts/pda";
import { TOKEN_2022_PROGRAM_ID } from "../constants";
import type { PricingTier, VelaUsagePlanParams } from "../types";

export interface BuildCreateUsagePlanResult {
  instruction: TransactionInstruction;
  usagePlanAddress: PublicKey;
  credentialMintAddress: PublicKey;
}

/**
 * Derives the UsagePlan PDA address.
 * Seeds: [b"usage_plan", merchant.toBuffer(), planId.toArrayLike(Buffer, 'le', 8)]
 */
export function deriveUsagePlanAddress(
  merchant: PublicKey,
  planId: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PDAFactory.usagePlan(merchant, planId, programId);
}

/**
 * Derives the usage credential mint PDA address.
 * Seeds: [b"usage_credential", merchant.toBuffer(), planId.toArrayLike(Buffer, 'le', 8)]
 */
export function deriveUsageCredentialMintAddress(
  merchant: PublicKey,
  planId: BN,
  programId: PublicKey,
): [PublicKey, number] {
  return PDAFactory.usageCredential(merchant, planId, programId);
}

/**
 * Builds a raw `create_usage_plan` TransactionInstruction without signing or sending.
 *
 * Creates a usage-based pricing plan PDA with up to 5 pricing tiers. The caller provides
 * planId which should come from the merchant's current MerchantState.planCount (same pattern
 * as buildCreatePlanInstruction for flat plans).
 */
export async function buildCreateUsagePlanInstruction(
  program: Program,
  params: VelaUsagePlanParams & { merchant: PublicKey },
): Promise<BuildCreateUsagePlanResult> {
  const {
    merchant,
    planId,
    unitName,
    tiers,
    maxChargePerPeriod,
    settlementFrequency,
  } = params;

  const programId = program.programId;

  const [usagePlanAddress] = deriveUsagePlanAddress(merchant, planId, programId);
  const [credentialMintAddress] = deriveUsageCredentialMintAddress(
    merchant,
    planId,
    programId,
  );

  // Convert unit_name: Uint8Array (32 bytes) to number[] for Anchor
  const unitNameArray: number[] = Array.from(
    unitName.length === 32 ? unitName : (() => {
      const buf = new Uint8Array(32);
      buf.set(unitName.slice(0, 32));
      return buf;
    })(),
  );

  // Convert tiers to Anchor-compatible format
  const tiersAncho = tiers.map((t: PricingTier) => ({
    upTo: t.upTo,
    ratePerUnit: t.ratePerUnit,
    padding: t.padding,
  }));

  const instruction = await (program.methods as any)
    .createUsagePlan(
      planId,
      unitNameArray,
      tiersAncho,
      maxChargePerPeriod,
      settlementFrequency,
    )
    .accounts({
      merchant,
      usagePlan: usagePlanAddress,
      credentialMint: credentialMintAddress,
      systemProgram: SystemProgram.programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  return { instruction, usagePlanAddress, credentialMintAddress };
}
