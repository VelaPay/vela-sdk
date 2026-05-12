import { BN, type Program } from "@coral-xyz/anchor";
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
const ARCIUM_PROGRAM_ID = new PublicKey(
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
);

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

const DEFAULT_PUBLIC_KEY = new PublicKey("11111111111111111111111111111111");

function effectiveMxeProgramId(
  configMxeProgramId: PublicKey | undefined,
  programId: PublicKey,
): PublicKey {
  if (!configMxeProgramId || configMxeProgramId.equals(DEFAULT_PUBLIC_KEY)) {
    return programId;
  }
  return configMxeProgramId;
}

function deriveMxePda(mxeProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MXE_PDA_SEED, mxeProgramId.toBuffer()],
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

function deriveComputationPda(
  clusterId: number,
  computationOffset: bigint,
): PublicKey {
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
  return new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(
    0,
    true,
  );
}

function deriveCompDefPda(
  circuitName: string,
  mxeProgramId: PublicKey,
): PublicKey {
  const offset = compDefOffset(circuitName);
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(offset);
  return PublicKey.findProgramAddressSync(
    [COMP_DEF_PDA_SEED, mxeProgramId.toBuffer(), offsetBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

function deriveSignPda(velaProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SIGN_PDA_SEED], velaProgramId)[0];
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
  requestStateAddress: PublicKey;
  computationOffset: bigint;
}

const USAGE_CHARGE_CIRCUIT = "usage_charge_v2";
const TIERED_PRICING_CIRCUIT = "tiered_pricing_v2";

/**
 * Builds the `request_usage_computation` TransactionInstruction.
 *
 * The keeper queues encrypted usage units from the UsageReport account and on-chain
 * plaintext pricing terms from the UsagePlan snapshot.
 * The circuit is inferred from the usage plan tier count:
 * - 1 tier => usage_charge
 * - 2-5 tiers => tiered_pricing
 * After submission, Arcium writes the computed charge back to the PullApproval PDA.
 *
 * Callers must provide:
 * - mandateAddress: the VelaMandate PDA
 * - usagePlanAddress: the UsagePlan PDA
 * - usageReportAddress: the UsageReport PDA for this period
 * - computationOffset: derived via deriveUsageComputationOffset
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
  } = params;

  const programId = program.programId ?? PROGRAM_ID;

  // Fetch ProtocolConfig for cluster info
  const [configAddress] = PDAFactory.config(programId);
  const config = (await (program.account as any).protocolConfig.fetch(
    configAddress,
  )) as {
    clusterPubkey: PublicKey;
    clusterOffset: { toNumber?: () => number } | number;
    mxeProgramId?: PublicKey;
    bump: number;
  };

  const clusterOffset =
    typeof config.clusterOffset === "number"
      ? config.clusterOffset
      : (config.clusterOffset as { toNumber: () => number }).toNumber();
  const clusterId = clusterOffset;
  const mxeProgramId = effectiveMxeProgramId(config.mxeProgramId, programId);

  const usagePlan = (await (program.account as any).usagePlan.fetch(
    usagePlanAddress,
  )) as { tierCount: number };
  const tierCount = Number(usagePlan.tierCount);
  if (!Number.isInteger(tierCount) || tierCount < 1 || tierCount > 5) {
    throw new Error(
      `usage plan tierCount must be between 1 and 5, got ${tierCount}`,
    );
  }
  const circuitName =
    tierCount === 1 ? USAGE_CHARGE_CIRCUIT : TIERED_PRICING_CIRCUIT;

  const usageReport = (await (program.account as any).usageReport.fetch(
    usageReportAddress,
  )) as { periodStart: { toString: () => string } | number | bigint };
  const periodStart =
    typeof usageReport.periodStart === "bigint"
      ? usageReport.periodStart
      : typeof usageReport.periodStart === "number"
        ? BigInt(usageReport.periodStart)
        : BigInt(usageReport.periodStart.toString());

  // Derive all Arcium PDAs (same pattern as request-validation.ts)
  const mxeAccount = deriveMxePda(mxeProgramId);
  const mempoolAccount = deriveMempoolPda(clusterId);
  const executingPool = deriveExecpoolPda(clusterId);
  const clusterAccount = deriveClusterPda(clusterId);
  const computationAccount = deriveComputationPda(clusterId, computationOffset);
  const compDefAccount = deriveCompDefPda(circuitName, mxeProgramId);
  const signPdaAccount = deriveSignPda(programId);

  const [pullApproval] = PDAFactory.approval(mandateAddress, programId);
  const [requestState] = PDAFactory.arciumUsageComputationRequest(
    mandateAddress,
    periodStart,
    programId,
  );

  const instruction = await (program.methods as any)
    .requestUsageComputation(new BN(computationOffset.toString()))
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
      requestState,
      systemProgram: SystemProgram.programId,
      arciumProgram: ARCIUM_PROGRAM_ID,
    })
    .instruction();

  return {
    instruction,
    pullApprovalAddress: pullApproval,
    requestStateAddress: requestState,
    computationOffset,
  };
}
