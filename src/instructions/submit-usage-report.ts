import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { USAGE_REPORT_SEED } from "../types";

export interface BuildSubmitUsageReportResult {
  instruction: TransactionInstruction;
  usageReportAddress: PublicKey;
}

/**
 * Derives the UsageReport PDA address.
 * Seeds: [b"usage_report", mandateAddress.toBuffer(), periodStart.toArrayLike(Buffer, 'le', 8)]
 */
export function deriveUsageReportAddress(
  mandateAddress: PublicKey,
  periodStart: BN,
  programId: PublicKey,
): [PublicKey, number] {
  const periodStartBuf = periodStart.toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [USAGE_REPORT_SEED, mandateAddress.toBuffer(), periodStartBuf],
    programId,
  );
}

export interface SubmitUsageReportParams {
  merchant: PublicKey;
  mandateAddress: PublicKey;
  periodStart: BN;               // i64 timestamp — must equal mandate.next_payment_due
  periodEnd: BN;                 // i64 timestamp
  encryptedUsage: number[][];    // [[u8;32];4] — pre-encrypted by caller using Arcium RescueCipher
  nonce: BN;                     // u128 encryption nonce
  pubKey: number[];              // [u8;32] x25519 client public key
}

/**
 * Builds a raw `submit_usage_report` TransactionInstruction without signing or sending.
 *
 * The caller is responsible for encrypting usageUnits before calling this function.
 * Use the usage.ts submitUsageReport convenience function for automatic encryption.
 *
 * The on-chain program validates:
 * - merchant == mandate.merchant
 * - mandate.billing_type == Usage
 * - mandate.status == Active
 * - period_start == mandate.next_payment_due (strict alignment per D-21)
 */
export async function buildSubmitUsageReportInstruction(
  program: Program,
  params: SubmitUsageReportParams,
): Promise<BuildSubmitUsageReportResult> {
  const {
    merchant,
    mandateAddress,
    periodStart,
    periodEnd,
    encryptedUsage,
    nonce,
    pubKey,
  } = params;

  const programId = program.programId;

  // Derive UsageReport PDA
  const [usageReportAddress] = deriveUsageReportAddress(
    mandateAddress,
    periodStart,
    programId,
  );

  const instruction = await (program.methods as any)
    .submitUsageReport(
      periodStart,
      periodEnd,
      encryptedUsage,
      nonce,
      pubKey,
    )
    .accounts({
      merchant,
      mandate: mandateAddress,
      usageReport: usageReportAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { instruction, usageReportAddress };
}
