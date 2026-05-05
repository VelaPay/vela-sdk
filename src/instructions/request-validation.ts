import { BN, type Program } from "@coral-xyz/anchor";
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

// MXE PDA: seeds = ["MXEAccount", vela_program_id_bytes], owned by Arcium.
function deriveMxePda(velaProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MXE_PDA_SEED, velaProgramId.toBuffer()],
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
// sha256("global:{circuitName}") -> first 4 bytes as little-endian u32
// Note: arcium-anchor uses just the circuit name string (not prefixed with "global:")
// The Rust implementation: sha256(conf_ix_name.as_bytes())[0..4] as u32 LE
function compDefOffset(circuitName: string): number {
  const hash = sha256(new TextEncoder().encode(circuitName));
  return new DataView(hash.buffer, hash.byteOffset, hash.byteLength).getUint32(
    0,
    true,
  );
}

// comp_def PDA: seeds = ["ComputationDefinitionAccount", vela_program_id_bytes, offset_le_bytes]
// Derived from Arcium program
function deriveCompDefPda(
  circuitName: string,
  velaProgramId: PublicKey,
): PublicKey {
  const offset = compDefOffset(circuitName);
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(offset);
  return PublicKey.findProgramAddressSync(
    [COMP_DEF_PDA_SEED, velaProgramId.toBuffer(), offsetBuf],
    ARCIUM_PROGRAM_ID,
  )[0];
}

// sign_pda: seeds = ["ArciumSignerAccount"], derived from the Vela program.
function deriveSignPda(velaProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SIGN_PDA_SEED], velaProgramId)[0];
}

export interface RequestValidationParams {
  payer: PublicKey;
  mandateAddress: PublicKey;
  planAddress: PublicKey;
  nextPaymentDue: bigint;
  subscriberAddress?: PublicKey; // Optional -- only needed if mandateAddress not yet known
  computationOffset: bigint;
  ciphertext: Uint8Array[]; // 8 elements, each 32 bytes
  pubKey: Uint8Array; // x25519 public key, 32 bytes
  nonce: bigint; // u128
}

export interface BuildRequestValidationResult {
  instruction: TransactionInstruction;
  pullApprovalAddress: PublicKey;
  requestStateAddress: PublicKey;
  computationOffset: bigint;
}

/**
 * Mirrors arcium_accounts.rs derive_validation_computation_offset.
 * Domain = b"validate_mandate", mandate pubkey, next_payment_due le bytes, request_nonce le bytes.
 * Uses programId as the PDA program (same as vela-protocol program).
 */
export function deriveValidationComputationOffset(
  mandate: PublicKey,
  nextPaymentDue: bigint,
  requestNonce: bigint,
  programId: PublicKey = PROGRAM_ID,
): bigint {
  const domain = Buffer.from("validate_mandate");
  const mandateBytes = mandate.toBuffer();
  const npdBytes = Buffer.alloc(8);
  npdBytes.writeBigInt64LE(nextPaymentDue);
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(requestNonce);

  const [hash] = PublicKey.findProgramAddressSync(
    [domain, mandateBytes, npdBytes, nonceBytes],
    programId,
  );
  const offsetBytes = hash.toBuffer().subarray(0, 8);
  return Buffer.from(offsetBytes).readBigUInt64LE();
}

/**
 * Builds the `request_validation` TransactionInstruction for the Arcium MXE billing pipeline.
 *
 * The keeper (or any caller) uses this to submit encrypted mandate data for MPC validation.
 * After submission, the Arcium cluster will compute and write back to the PullApproval PDA.
 *
 * Callers must provide:
 * - mandateAddress: the VelaMandate PDA (already known to keeper)
 * - planAddress: the VelaPlan PDA
 * - nextPaymentDue: mandate.next_payment_due, used as the request-state PDA subject
 * - computationOffset: derived via deriveValidationComputationOffset
 * - ciphertext: 8 x25519-encrypted u64/i64 fields in circuit order:
 *   mandate_amount, plan_amount, subscriber_balance, current_timestamp,
 *   next_payment_due, expiry, pulls_executed, max_pulls
 * - pubKey: caller's x25519 ephemeral public key (32 bytes)
 * - nonce: u128 encryption nonce (0 if nonce is embedded in ArgBuilder ciphertext)
 */
export async function buildRequestValidationInstruction(
  program: Program,
  _connection: Connection,
  params: RequestValidationParams,
): Promise<BuildRequestValidationResult> {
  // Validate ciphertext: must be exactly 8 elements, each 32 bytes
  if (params.ciphertext.length !== 8) {
    throw new Error(
      `ciphertext must have exactly 8 elements, got ${params.ciphertext.length}`,
    );
  }
  for (let i = 0; i < params.ciphertext.length; i++) {
    if (params.ciphertext[i].length !== 32) {
      throw new Error(
        `ciphertext[${i}] must be exactly 32 bytes, got ${params.ciphertext[i].length}`,
      );
    }
  }
  // Validate pubKey: must be exactly 32 bytes (x25519 public key)
  if (params.pubKey.length !== 32) {
    throw new Error(
      `pubKey must be exactly 32 bytes, got ${params.pubKey.length}`,
    );
  }

  const programId = program.programId ?? PROGRAM_ID;

  // Fetch ProtocolConfig for cluster info
  const [configAddress] = PDAFactory.config(programId);
  const config = (await (program.account as any).protocolConfig.fetch(
    configAddress,
  )) as {
    clusterPubkey: PublicKey;
    clusterOffset: { toNumber?: () => number } | number;
    bump: number;
  };

  const clusterOffset =
    typeof config.clusterOffset === "number"
      ? config.clusterOffset
      : (config.clusterOffset as { toNumber: () => number }).toNumber();
  const clusterId = clusterOffset; // cluster_id = cluster_offset cast to u32

  // Derive all Arcium PDAs
  const mxeAccount = deriveMxePda(programId);
  const mempoolAccount = deriveMempoolPda(clusterId);
  const executingPool = deriveExecpoolPda(clusterId);
  const clusterAccount = deriveClusterPda(clusterId);
  const computationAccount = deriveComputationPda(
    clusterId,
    params.computationOffset,
  );
  const compDefAccount = deriveCompDefPda("validate_mandate", programId);
  const signPdaAccount = deriveSignPda(programId);

  // Derive PullApproval PDA: seeds = [b"approval", mandate.key()]
  const [pullApproval] = PDAFactory.approval(params.mandateAddress, programId);
  const [requestState] = PDAFactory.arciumValidationRequest(
    params.mandateAddress,
    params.nextPaymentDue,
    programId,
  );

  // Convert ciphertext Vec<[u8;32]> to the Anchor-expected format (array of number arrays)
  const ciphertextArrays = params.ciphertext.map((ct) => Array.from(ct));

  const instruction = await (program.methods as any)
    .requestValidation(
      new BN(params.computationOffset.toString()),
      new BN(params.nextPaymentDue.toString()),
      ciphertextArrays,
      Array.from(params.pubKey),
      new BN(params.nonce.toString()),
    )
    .accounts({
      payer: params.payer,
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
      plan: params.planAddress,
      mandate: params.mandateAddress,
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
    computationOffset: params.computationOffset,
  };
}
