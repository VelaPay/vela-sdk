import type { Program } from "@coral-xyz/anchor";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
import type { VelaRequestUsageComputationParams } from "../types";

// Arcium program ID (same as request-validation.ts)
const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

// Arcium PDA seeds (from arcium-anchor 0.9.3)
const MXE_PDA_SEED = Buffer.from("MXEAccount");
const CLUSTER_PDA_SEED = Buffer.from("Cluster");
const MEMPOOL_PDA_SEED = Buffer.from("Mempool");
const EXECPOOL_PDA_SEED = Buffer.from("Execpool");
const COMP_PDA_SEED = Buffer.from("ComputationAccount");
const COMP_DEF_PDA_SEED = Buffer.from("ComputationDefinitionAccount");
const SIGN_PDA_SEED = Buffer.from("ArciumSignerAccount");
const CLOCK_PDA_SEED = Buffer.from("ClockAccount");
const POOL_PDA_SEED = Buffer.from("FeePool");

// Static Arcium PDAs derived once
const ARCIUM_CLOCK_ACCOUNT_ADDRESS = PublicKey.findProgramAddressSync(
  [CLOCK_PDA_SEED],
  ARCIUM_PROGRAM_ID,
)[0];

const ARCIUM_FEE_POOL_ACCOUNT_ADDRESS = PublicKey.findProgramAddressSync(
  [POOL_PDA_SEED],
  ARCIUM_PROGRAM_ID,
)[0];

function deriveMxePda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MXE_PDA_SEED, ARCIUM_PROGRAM_ID.toBuffer()],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveClusterPda(clusterId: number): PublicKey {
  const clusterIdBuf = Buffer.alloc(4);
  clusterIdBuf.writeUInt32LE(clusterId);
  return PublicKey.findProgramAddressSync(
    [CLUSTER_PDA_SEED, clusterIdBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveMempoolPda(clusterId: number): PublicKey {
  const clusterIdBuf = Buffer.alloc(4);
  clusterIdBuf.writeUInt32LE(clusterId);
  return PublicKey.findProgramAddressSync(
    [MEMPOOL_PDA_SEED, clusterIdBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveExecpoolPda(clusterId: number): PublicKey {
  const clusterIdBuf = Buffer.alloc(4);
  clusterIdBuf.writeUInt32LE(clusterId);
  return PublicKey.findProgramAddressSync(
    [EXECPOOL_PDA_SEED, clusterIdBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveComputationPda(clusterId: number, computationOffset: bigint): PublicKey {
  const clusterIdBuf = Buffer.alloc(4);
  clusterIdBuf.writeUInt32LE(clusterId);
  const offsetBuf = Buffer.alloc(8);
  offsetBuf.writeBigUInt64LE(computationOffset);
  return PublicKey.findProgramAddressSync(
    [COMP_PDA_SEED, clusterIdBuf, offsetBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

/** sha256(circuitName)[0..4] as u32 LE — mirrors arcium_anchor::comp_def_offset */
function compDefOffset(circuitName: string): number {
  const hash = sha256(new TextEncoder().encode(circuitName));
  return new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(0, true);
}

function deriveCompDefPda(velaProgramId: PublicKey, circuitName: string): PublicKey {
  const offset = compDefOffset(circuitName);
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(offset);
  return PublicKey.findProgramAddressSync(
    [COMP_DEF_PDA_SEED, velaProgramId.toBuffer(), offsetBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveSignPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SIGN_PDA_SEED],
    ARCIUM_PROGRAM_ID,
  )[0];
}

/**
 * Mirrors arcium_accounts.rs derive_usage_computation_offset.
 * Domain = b"usage", mandate pubkey, period_start le bytes, request_nonce le bytes.
 * Uses programId (Vela program) as the PDA program — same pattern as deriveValidationComputationOffset.
 */
export function deriveUsageComputationOffset(
  mandate: PublicKey,
  periodStart: bigint,
  requestNonce: bigint,
  programId: PublicKey = PROGRAM_ID,
): bigint {
  const domain = Buffer.from("usage");
  const mandateBytes = mandate.toBuffer();
  const psBytes = Buffer.alloc(8);
  psBytes.writeBigInt64LE(periodStart);
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(requestNonce);

  const [hash] = PublicKey.findProgramAddressSync(
    [domain, mandateBytes, psBytes, nonceBytes],
    programId,
  );
  const offsetBytes = hash.toBuffer().subarray(0, 8);
  return Buffer.from(offsetBytes).readBigUInt64LE();
}

export interface BuildRequestUsageComputationResult {
  instruction: TransactionInstruction;
  pullApprovalAddress: PublicKey;
  computationOffset: bigint;
}

const USAGE_CHARGE_CIRCUIT = "usage_charge";
const TIERED_PRICING_CIRCUIT = "tiered_pricing";

/**
 * Builds the `request_usage_computation` TransactionInstruction.
 *
 * The keeper uses this to submit encrypted usage data to the Arcium MXE for computation.
 * The circuit is inferred from the ciphertext shape:
 * - 3 fields => usage_charge
 * - 13 fields => tiered_pricing
 * After submission, Arcium writes the computed charge back to the PullApproval PDA.
 *
 * Callers must provide:
 * - mandateAddress: the VelaMandate PDA
 * - usagePlanAddress: the UsagePlan PDA
 * - usageReportAddress: the UsageReport PDA for this period
 * - computationOffset: derived via deriveUsageComputationOffset
 * - ciphertext: encrypted usage fields in circuit order
 * - pubKey: caller's x25519 ephemeral public key (32 bytes)
 * - nonce: u128 encryption nonce
 */
export async function buildRequestUsageComputationInstruction(
  program: Program,
  params: VelaRequestUsageComputationParams,
): Promise<BuildRequestUsageComputationResult> {
  const {
    payer,
    mandateAddress,
    usagePlanAddress,
    usageReportAddress,
    computationOffset,
    ciphertext,
    pubKey,
    nonce,
  } = params;

  if (pubKey.length !== 32) {
    throw new Error(`pubKey must be exactly 32 bytes, got ${pubKey.length}`);
  }

  const circuitName =
    ciphertext.length === 3
      ? USAGE_CHARGE_CIRCUIT
      : ciphertext.length === 13
        ? TIERED_PRICING_CIRCUIT
        : null;
  if (!circuitName) {
    throw new Error(
      `ciphertext must contain 3 fields for usage_charge or 13 fields for tiered_pricing, got ${ciphertext.length}`,
    );
  }

  const programId = program.programId ?? PROGRAM_ID;

  // Fetch ProtocolConfig for cluster info
  const [configAddress] = PDAFactory.config(programId);
  const config = await (program.account as any).protocolConfig.fetch(configAddress) as {
    clusterPubkey: PublicKey;
    clusterOffset: { toNumber?: () => number } | number;
    bump: number;
  };

  const clusterOffset = typeof config.clusterOffset === "number"
    ? config.clusterOffset
    : (config.clusterOffset as { toNumber: () => number }).toNumber();
  const clusterId = clusterOffset;

  // Derive all Arcium PDAs (same pattern as request-validation.ts)
  const mxeAccount = deriveMxePda();
  const mempoolAccount = deriveMempoolPda(clusterId);
  const executingPool = deriveExecpoolPda(clusterId);
  const clusterAccount = deriveClusterPda(clusterId);
  const computationAccount = deriveComputationPda(clusterId, computationOffset);
  const compDefAccount = deriveCompDefPda(programId, circuitName);
  const signPdaAccount = deriveSignPda();

  const [pullApproval] = PDAFactory.approval(mandateAddress, programId);

  // Convert ciphertext to number[][] format expected by Anchor
  const ciphertextArrays = ciphertext.map((ct) => Array.from(ct));

  const instruction = await (program.methods as any)
    .requestUsageComputation(
      computationOffset,
      ciphertextArrays,
      Array.from(pubKey),
      nonce,
    )
    .accounts({
      payer,
      config: configAddress,
      mxeAccount,
      signPdaAccount,
      mempoolAccount,
      executingPool,
      computationAccount,
      compDefAccount,
      clusterAccount,
      poolAccount: ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
      clockAccount: ARCIUM_CLOCK_ACCOUNT_ADDRESS,
      usagePlan: usagePlanAddress,
      mandate: mandateAddress,
      usageReport: usageReportAddress,
      pullApproval,
      systemProgram: SystemProgram.programId,
      arciumProgram: ARCIUM_PROGRAM_ID,
    })
    .instruction();

  return {
    instruction,
    pullApprovalAddress: pullApproval,
    computationOffset,
  };
}
