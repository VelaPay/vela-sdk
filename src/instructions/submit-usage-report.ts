import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import type BN from "bn.js";
import { PDAFactory } from "../accounts/pda";

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
  return PDAFactory.usageReport(mandateAddress, periodStart, programId);
}

export interface SubmitUsageReportParams {
  merchant: PublicKey;
  mandateAddress: PublicKey;
  usagePlanAddress: PublicKey;
  periodStart: BN; // i64 timestamp — mandate.next_payment_due - mandate.frequency
  periodEnd: BN; // i64 timestamp — mandate.next_payment_due
  computationCiphertext: number[][]; // exactly one encrypted usage_units field
  nonce: BN; // u128 encryption nonce
  pubKey: number[]; // [u8;32] x25519 client public key
}

/**
 * Builds a raw `submit_usage_report` TransactionInstruction without signing or sending.
 *
 * The caller is responsible for encrypting usage_units before calling this function.
 * Use the usage.ts submitUsageReport convenience function for automatic encryption.
 *
 * The on-chain program validates:
 * - merchant == mandate.merchant
 * - mandate.billing_type == Usage
 * - mandate.status == Active
 * - period_start/period_end == the mandate's closed current billing period
 * - computation_ciphertext contains one encrypted usage_units value
 */
export async function buildSubmitUsageReportInstruction(
  program: Program,
  params: SubmitUsageReportParams,
): Promise<BuildSubmitUsageReportResult> {
  const {
    merchant,
    mandateAddress,
    usagePlanAddress,
    periodStart,
    periodEnd,
    computationCiphertext,
    nonce,
    pubKey,
  } = params;

  const programId = program.programId;
  if (computationCiphertext.length !== 1) {
    throw new Error(
      `submit_usage_report expects exactly one encrypted usage_units ciphertext, got ${computationCiphertext.length}`,
    );
  }

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
      computationCiphertext,
      nonce,
      pubKey,
    )
    .accounts({
      merchant,
      mandate: mandateAddress,
      usagePlan: usagePlanAddress,
      usageReport: usageReportAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { instruction, usageReportAddress };
}
