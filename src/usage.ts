/**
 * SDK usage-based billing convenience functions.
 *
 * These high-level functions wrap the instruction builders and handle
 * encryption of usage data via Arcium's RescueCipher before submission.
 *
 * Usage flow:
 * 1. Merchant calls createUsagePlan() to register pricing tiers on-chain
 * 2. At end of billing period, merchant calls submitUsageReport() with plaintext units
 *    (SDK encrypts them using Arcium RescueCipher before submitting)
 * 3. Keeper detects the UsageReport, calls request_usage_computation via usage-pipeline.ts
 * 4. Arcium computes the charge, writes back to PullApproval PDA
 * 5. Keeper executes pull via execute_pull (same as flat billing)
 */

import {
  getArciumProgramId,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import type { Program } from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { postUsageReportBridge } from "./internal/usage-bridge";
import type { VelaSubmitUsageReportParams, VelaUsagePlanParams } from "./types";

/** Options for the D1 bridge POST after on-chain submission */
export interface UsageReportBridgeOptions {
  /** Base URL of the keeper Worker (e.g. https://worker.example.com) */
  keeperEndpoint?: string;
  /** Bearer auth token for the keeper Worker */
  authToken?: string;
}

import { buildCreateUsagePlanInstruction } from "./instructions/create-usage-plan";
import { buildSubmitUsageReportInstruction } from "./instructions/submit-usage-report";

/** 16-byte random nonce for RescueCipher CTR mode */
function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Convert a 16-byte nonce to u128 bigint (little-endian) */
function nonceToU128(nonce: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(nonce[i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * Creates a usage-based pricing plan on-chain.
 *
 * Builds and submits the create_usage_plan transaction.
 * The merchant wallet in `params` signs the transaction.
 *
 * @param program - Anchor program instance with merchant as signer
 * @param params  - Plan parameters including planId, tiers, and limits
 * @returns usagePlanAddress and txSignature
 */
export async function createUsagePlan(
  program: Program,
  params: VelaUsagePlanParams & { merchant: PublicKey },
): Promise<{ usagePlanAddress: PublicKey; txSignature: string }> {
  const { instruction, usagePlanAddress } =
    await buildCreateUsagePlanInstruction(program, params);

  const tx = new Transaction().add(instruction);
  const txSignature = await (program.provider as any).sendAndConfirm(tx);
  return { usagePlanAddress, txSignature };
}

/**
 * Encrypts usage data using Arcium RescueCipher and submits the usage report on-chain.
 *
 * Encryption flow (mirrors the keeper's flat-pipeline Phase A):
 * 1. Fetch MXE public key from on-chain Arcium program
 * 2. Generate ephemeral x25519 keypair
 * 3. Derive shared secret via ECDH
 * 4. Pack usage_units plus plan pricing inputs and encrypt with RescueCipher
 * 5. Submit ciphertext + pubkey + nonce to submit_usage_report instruction
 *
 * The on-chain program validates:
 * - merchant == mandate.merchant (signature authority)
 * - mandate.billing_type == Usage
 * - period_start == mandate.next_payment_due (strict period alignment)
 *
 * @param program    - Anchor program instance with merchant as signer
 * @param params     - Usage report parameters including plaintext usageUnits
 * @param connection - Solana connection for ATA and balance queries
 * @param merchant   - Merchant keypair (needed to sign and derive ATA; provider signer is also valid)
 * @returns usageReportAddress and txSignature
 */
export async function submitUsageReport(
  program: Program,
  params: VelaSubmitUsageReportParams & { merchantPublicKey: PublicKey },
  connection: Connection,
  bridgeOptions?: UsageReportBridgeOptions,
): Promise<{ usageReportAddress: PublicKey; txSignature: string }> {
  const arciumProgramId = getArciumProgramId();

  // Fetch MXE public key from on-chain Arcium program
  const mxePublicKeyBytes = await getMXEPublicKey(
    program.provider as any,
    arciumProgramId,
  );
  if (!mxePublicKeyBytes) {
    throw new Error(
      "Arcium MXE public key not found on-chain — ensure Arcium is configured",
    );
  }

  let clientPrivateKey: Uint8Array | undefined;
  let sharedSecret: Uint8Array | undefined;

  try {
    // Generate ephemeral x25519 keypair and derive shared secret
    clientPrivateKey = x25519.utils.randomPrivateKey();
    const clientPublicKey = x25519.getPublicKey(clientPrivateKey);
    sharedSecret = x25519.getSharedSecret(clientPrivateKey, mxePublicKeyBytes);

    const usagePlan = (await (program.account as any).usagePlan.fetch(
      params.usagePlanAddress,
    )) as {
      tiers: Array<{ upTo: BN; ratePerUnit: BN }>;
      tierCount: number;
      maxChargePerPeriod: BN;
    };
    const tierCount = Number(usagePlan.tierCount);
    if (!Number.isInteger(tierCount) || tierCount < 1 || tierCount > 5) {
      throw new Error(`usage plan tierCount must be between 1 and 5, got ${tierCount}`);
    }

    // Encrypt the full circuit input committed in UsageReport. The keeper later queues
    // exactly this ciphertext, so it cannot swap usage or pricing values at request time.
    const usageUnitsNum = BigInt(params.usageUnits.toString());
    const maxCharge = BigInt(usagePlan.maxChargePerPeriod.toString());
    const plaintextFields =
      tierCount === 1
        ? [
            usageUnitsNum,
            BigInt(usagePlan.tiers[0].ratePerUnit.toString()),
            maxCharge,
          ]
        : [
            usageUnitsNum,
            ...[0, 1, 2, 3, 4].map((i) =>
              i < tierCount ? BigInt(usagePlan.tiers[i].upTo.toString()) : 0n,
            ),
            ...[0, 1, 2, 3, 4].map((i) =>
              i < tierCount
                ? BigInt(usagePlan.tiers[i].ratePerUnit.toString())
                : 0n,
            ),
            BigInt(tierCount),
            maxCharge,
          ];
    const cipher = new RescueCipher(sharedSecret);
    const nonce = generateNonce();
    const computationCiphertext = cipher.encrypt(plaintextFields, nonce);

    const nonceU128 = nonceToU128(nonce);
    const nonceBN = new BN(nonceU128.toString());
    const pubKeyArray = Array.from(clientPublicKey);

    const { instruction, usageReportAddress } =
      await buildSubmitUsageReportInstruction(program, {
        merchant: params.merchantPublicKey,
        mandateAddress: params.mandateAddress,
        usagePlanAddress: params.usagePlanAddress,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        computationCiphertext,
        nonce: nonceBN,
        pubKey: pubKeyArray,
      });

    const tx = new Transaction().add(instruction);
    const txSignature = await (program.provider as any).sendAndConfirm(tx);

    // D1 bridge: POST plaintext usage data to keeper Worker for usage-pipeline resolution
    if (bridgeOptions?.keeperEndpoint) {
      const bridgeResult = await postUsageReportBridge(
        bridgeOptions.keeperEndpoint,
        {
          mandateAddress: params.mandateAddress.toBase58(),
          merchantAddress: params.merchantPublicKey.toBase58(),
          periodStart: new Date(
            Number(params.periodStart.toString()) * 1000,
          ).toISOString(),
          periodEnd: new Date(
            Number(params.periodEnd.toString()) * 1000,
          ).toISOString(),
          usageUnits: Number(params.usageUnits.toString()),
          txSignature,
        },
        bridgeOptions.authToken,
      );

      if (!bridgeResult.ok) {
        // Non-fatal: on-chain report was already submitted successfully.
        // The idempotent bridge endpoint allows a repair write later if all retry attempts fail.
        console.warn(
          `[vela-sdk] Usage report D1 bridge failed after ${bridgeResult.attempts} attempt(s)` +
            `${bridgeResult.status ? ` (HTTP ${bridgeResult.status})` : ""}: ${bridgeResult.error ?? "unknown error"}. ` +
            `On-chain report submitted successfully.`,
        );
      }
    }

    return { usageReportAddress, txSignature };
  } finally {
    // Zero ephemeral key material even on failure
    clientPrivateKey?.fill(0);
    sharedSecret?.fill(0);
  }
}
