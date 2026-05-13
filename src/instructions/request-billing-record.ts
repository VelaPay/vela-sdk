import type { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";

// Arcium program ID (from arcium-client IDL: Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ)
const ARCIUM_PROGRAM_ID = new PublicKey(
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
);

// Arcium PDA seeds (from arcium-anchor 0.9.3 crate constants)
// derive_seed!(X) = stringify!(X).as_bytes()
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

// MXE PDA: seeds = ["MXEAccount", mxe_program_id_bytes], owned by Arcium.
function deriveMxePda(mxeProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MXE_PDA_SEED, mxeProgramId.toBuffer()],
    ARCIUM_PROGRAM_ID,
  )[0];
}

// Cluster-specific PDAs
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

// comp_def_offset mirrors arcium_anchor::comp_def_offset:
// sha256(circuitName.as_bytes())[0..4] as u32 LE
function compDefOffset(circuitName: string): number {
  const hash = sha256(new TextEncoder().encode(circuitName));
  return new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(
    0,
    true,
  );
}

// comp_def PDA: seeds = ["ComputationDefinitionAccount", mxe_program_id_bytes, offset_le_bytes]
// Derived from Arcium program
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

// sign_pda: seeds = ["ArciumSignerAccount"], derived from Arcium program
function deriveSignPda(velaProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SIGN_PDA_SEED], velaProgramId)[0];
}

export interface RequestBillingRecordParams {
  payer: PublicKey;
  mandateAddress: PublicKey;
  planAddress: PublicKey;
  computationOffset: bigint;
}

export interface BuildRequestBillingRecordResult {
  instruction: TransactionInstruction;
  billingEventAddress: PublicKey;
  requestStateAddress: PublicKey;
  computationOffset: bigint;
}

const RECORD_BILLING_EVENT_CIRCUIT = "record_billing_event_v2";

/**
 * Mirrors arcium_accounts.rs derive_billing_computation_offset.
 * Domain = b"record_billing_event", mandate pubkey, pulls_executed le bytes, request_nonce le bytes.
 * Uses programId (Vela program) as the PDA program — same pattern as deriveValidationComputationOffset.
 */
export function deriveBillingComputationOffset(
  mandate: PublicKey,
  pullsExecuted: bigint,
  requestNonce: bigint,
  programId: PublicKey = PROGRAM_ID,
): bigint {
  const domain = Buffer.from("record_billing_event");
  const mandateBytes = mandate.toBuffer();
  const peBytes = Buffer.alloc(8);
  peBytes.writeBigUInt64LE(pullsExecuted);
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(requestNonce);

  const [hash] = PublicKey.findProgramAddressSync(
    [domain, mandateBytes, peBytes, nonceBytes],
    programId,
  );
  const offsetBytes = hash.toBuffer().subarray(0, 8);
  return Buffer.from(offsetBytes).readBigUInt64LE();
}

/**
 * Builds the `request_billing_record` TransactionInstruction for the Arcium MXE billing pipeline.
 *
 * The keeper uses this to submit billing data to the Arcium MXE for encrypted storage after
 * a successful pull. The Arcium cluster will compute and write back an encrypted BillingEvent.
 *
 * Callers must provide:
 * - payer: the transaction fee payer (keeper wallet)
 * - mandateAddress: the VelaMandate PDA
 * - planAddress: the VelaPlan PDA
 * - computationOffset: derived via deriveBillingComputationOffset using mandate's
 *   pulls_executed + (billing_request_nonce + 1)
 *
 * The function fetches the mandate on-chain to derive the BillingEvent PDA seeds
 * (which use the current pulls_executed value).
 */
export async function buildRequestBillingRecordInstruction(
  program: Program,
  _connection: Connection,
  params: RequestBillingRecordParams,
): Promise<BuildRequestBillingRecordResult> {
  const { payer, mandateAddress, planAddress, computationOffset } = params;

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
  const clusterId = clusterOffset; // cluster_id = cluster_offset cast to u32
  const mxeProgramId = effectiveMxeProgramId(config.mxeProgramId, programId);

  // Derive all Arcium PDAs
  const mxeAccount = deriveMxePda(mxeProgramId);
  const mempoolAccount = deriveMempoolPda(clusterId);
  const executingPool = deriveExecpoolPda(clusterId);
  const clusterAccount = deriveClusterPda(clusterId);
  const computationAccount = deriveComputationPda(clusterId, computationOffset);
  const compDefAccount = deriveCompDefPda(
    RECORD_BILLING_EVENT_CIRCUIT,
    mxeProgramId,
  );
  const signPdaAccount = deriveSignPda(programId);

  // Fetch mandate to read pulls_executed for BillingEvent PDA derivation.
  // The on-chain constraint uses mandate.pulls_executed at instruction time —
  // we must mirror this exactly.
  const mandateData = await (program.account as any).velaMandate.fetch(
    mandateAddress,
  );
  const pullsExecuted = BigInt(mandateData.pullsExecuted.toString());

  const [billingEventAddress] = PDAFactory.billing(
    mandateAddress,
    pullsExecuted,
    programId,
  );
  const [requestState] = PDAFactory.arciumBillingRecordRequest(
    mandateAddress,
    pullsExecuted,
    programId,
  );

  const instruction = await (program.methods as any)
    .requestBillingRecord(
      new BN(computationOffset.toString()),
      new BN(pullsExecuted.toString()),
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
      plan: planAddress,
      mandate: mandateAddress,
      billingEvent: billingEventAddress,
      requestState,
      systemProgram: SystemProgram.programId,
      arciumProgram: ARCIUM_PROGRAM_ID,
    })
    .instruction();

  return {
    instruction,
    billingEventAddress,
    requestStateAddress: requestState,
    computationOffset,
  };
}
