import { createHash } from "node:crypto";
import type { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { LiteSVMProvider } from "anchor-litesvm";
import type { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import {
  buildInitMerchantCredentialInstruction,
  buildInitTokenConfigInstruction,
} from "../../src";
import {
  APPROVAL_SEED,
  CONFIG_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  KEEPER_CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  USDC_DECIMALS,
} from "../../src/constants";
import { requireProtocolHookSo } from "../helpers/protocol-artifacts";

const EMPTY_PUBKEY = new PublicKey(new Uint8Array(32));
// ProtocolConfig layout:
// discriminator(8) + admin(32) + cluster_pubkey(32) + cluster_type(1) +
// cluster_offset(8) + wrapped_usdc_mint(32) + wrapping_vault(32) + paused(1) +
// paused_at(8) + transfer_hook_program_id(32) + bump(1) + version(1) + mxe_program_id(32) = 220
const PROTOCOL_CONFIG_SIZE = 220;
// KeeperConfig layout: discriminator(8) + admin(32) + mode(1) + keeper_endpoint([u8;128]) +
//   endpoint_len(1) + keeper_authority(32) + bump(1) = 203
const KEEPER_CONFIG_SIZE = 203;
const PULL_APPROVAL_SIZE = 82;

function discriminator(namespace: "global" | "account", name: string): Buffer {
  return createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

export function findHookSo(): string {
  return requireProtocolHookSo();
}

export function deriveConfigAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
}

export function deriveKeeperConfigAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([KEEPER_CONFIG_SEED], PROGRAM_ID);
}

export function deriveMintAuthorityAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], PROGRAM_ID);
}

export function deriveExtraAccountMetaListAddress(
  wrappedUsdcMint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, wrappedUsdcMint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  );
}

export function derivePullApprovalAddress(
  mandate: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [APPROVAL_SEED, mandate.toBuffer()],
    PROGRAM_ID,
  );
}

function serializeProtocolConfig(admin: PublicKey, bump: number): Uint8Array {
  const data = Buffer.alloc(PROTOCOL_CONFIG_SIZE);
  // offset 0: discriminator (8 bytes)
  discriminator("account", "ProtocolConfig").copy(data, 0);
  // offset 8: admin (32 bytes)
  admin.toBuffer().copy(data, 8);
  // offset 40: cluster_pubkey (32 bytes) -- zero pubkey
  EMPTY_PUBKEY.toBuffer().copy(data, 40);
  // offset 72: cluster_type (1 byte) -- 0 = Mainnet
  data.writeUInt8(0, 72);
  // offset 73: cluster_offset (8 bytes) -- devnet fixture offset
  data.writeBigUInt64LE(456n, 73);
  // offset 81: wrapped_usdc_mint (32 bytes) -- zero pubkey
  EMPTY_PUBKEY.toBuffer().copy(data, 81);
  // offset 113: wrapping_vault (32 bytes) -- zero pubkey
  EMPTY_PUBKEY.toBuffer().copy(data, 113);
  // offset 145: paused (1 byte) -- false
  data.writeUInt8(0, 145);
  // offset 146: paused_at (8 bytes) -- 0
  data.writeBigInt64LE(0n, 146);
  // offset 154: transfer_hook_program_id (32 bytes)
  TRANSFER_HOOK_PROGRAM_ID.toBuffer().copy(data, 154);
  // offset 186: bump (1 byte)
  data.writeUInt8(bump, 186);
  // offset 187: version (1 byte)
  data.writeUInt8(1, 187);
  // offset 188: mxe_program_id (32 bytes) -- zero falls back to Vela program ID
  EMPTY_PUBKEY.toBuffer().copy(data, 188);
  return data;
}

function serializeKeeperConfig(
  admin: PublicKey,
  keeperAuthority: PublicKey,
  bump: number,
): Uint8Array {
  const data = Buffer.alloc(KEEPER_CONFIG_SIZE);
  // offset 0: discriminator (8 bytes)
  discriminator("account", "KeeperConfig").copy(data, 0);
  // offset 8: admin (32 bytes)
  admin.toBuffer().copy(data, 8);
  // offset 40: mode (1 byte) -- 0 = Centralized
  data.writeUInt8(0, 40);
  // offset 41: keeper_endpoint ([u8; 128]) -- all zeros
  // (already zeroed by Buffer.alloc)
  // offset 169: endpoint_len (1 byte) -- 0
  data.writeUInt8(0, 169);
  // offset 170: keeper_authority (32 bytes)
  keeperAuthority.toBuffer().copy(data, 170);
  // offset 202: bump (1 byte)
  data.writeUInt8(bump, 202);
  return data;
}

function serializePullApproval(args: {
  mandate: PublicKey;
  periodStart?: bigint;
  periodEnd?: bigint;
  validUntil: bigint;
  approved: boolean;
  approvedAmount: bigint;
  createdAt: bigint;
  bump: number;
}): Uint8Array {
  const data = Buffer.alloc(PULL_APPROVAL_SIZE);
  discriminator("account", "PullApproval").copy(data, 0);
  args.mandate.toBuffer().copy(data, 8);
  data.writeBigInt64LE(args.periodStart ?? 0n, 40);
  data.writeBigInt64LE(args.periodEnd ?? 0n, 48);
  data.writeBigInt64LE(args.validUntil, 56);
  data.writeUInt8(args.approved ? 1 : 0, 64);
  data.writeBigUInt64LE(args.approvedAmount, 65);
  data.writeBigInt64LE(args.createdAt, 73);
  data.writeUInt8(args.bump, 81);
  return data;
}

function buildInitWrappedMintInstruction(args: {
  admin: PublicKey;
  config: PublicKey;
  mintAuthority: PublicKey;
  wrappedUsdcMint: PublicKey;
  splUsdcMint: PublicKey;
  wrappingVault: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.admin, isSigner: true, isWritable: true },
      { pubkey: args.config, isSigner: false, isWritable: true },
      { pubkey: args.mintAuthority, isSigner: false, isWritable: false },
      { pubkey: args.wrappedUsdcMint, isSigner: true, isWritable: true },
      { pubkey: args.splUsdcMint, isSigner: false, isWritable: false },
      { pubkey: args.wrappingVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: discriminator("global", "init_wrapped_mint"),
  });
}

function buildInitExtraAccountMetaListInstruction(args: {
  admin: PublicKey;
  config: PublicKey;
  extraAccountMetaList: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: args.admin, isSigner: true, isWritable: true },
      { pubkey: args.config, isSigner: false, isWritable: false },
      { pubkey: args.extraAccountMetaList, isSigner: false, isWritable: true },
      { pubkey: args.wrappedUsdcMint, isSigner: false, isWritable: false },
      { pubkey: args.wrappingVault, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("global", "init_extra_account_meta_list"),
  });
}

export async function sendInstructions(
  provider: LiteSVMProvider,
  instructions: TransactionInstruction[],
  signers: Keypair[] = [],
): Promise<string> {
  provider.client.expireBlockhash();
  const { Transaction } = await import("@solana/web3.js");
  const tx = new Transaction().add(...instructions);
  return provider.sendAndConfirm!(tx, signers);
}

export async function installPhase7AdminState(args: {
  provider: LiteSVMProvider;
  svm: LiteSVM;
  admin: Keypair;
  splUsdcMint: PublicKey;
}): Promise<{
  config: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
  extraAccountMetaList: PublicKey;
}> {
  const { provider, svm, admin, splUsdcMint } = args;
  const [config, configBump] = deriveConfigAddress();
  const [keeperConfig, keeperConfigBump] = deriveKeeperConfigAddress();
  const [mintAuthority] = deriveMintAuthorityAddress();
  const wrappingVault = getAssociatedTokenAddressSync(
    splUsdcMint,
    mintAuthority,
    true,
    TOKEN_PROGRAM_ID,
  );

  svm.setAccount(config, {
    lamports: Number(
      svm.minimumBalanceForRentExemption(BigInt(PROTOCOL_CONFIG_SIZE)),
    ),
    data: serializeProtocolConfig(admin.publicKey, configBump),
    owner: PROGRAM_ID,
    executable: false,
    rentEpoch: 0,
  });

  // Inject a minimal KeeperConfig so execute_pull can deserialize it.
  // In tests, the admin wallet also acts as the keeper authority (payer of execute_pull).
  svm.setAccount(keeperConfig, {
    lamports: Number(
      svm.minimumBalanceForRentExemption(BigInt(KEEPER_CONFIG_SIZE)),
    ),
    data: serializeKeeperConfig(
      admin.publicKey,
      admin.publicKey,
      keeperConfigBump,
    ),
    owner: PROGRAM_ID,
    executable: false,
    rentEpoch: 0,
  });

  const wrappedUsdcMint = Keypair.generate();
  await sendInstructions(
    provider,
    [
      buildInitWrappedMintInstruction({
        admin: admin.publicKey,
        config,
        mintAuthority,
        wrappedUsdcMint: wrappedUsdcMint.publicKey,
        splUsdcMint,
        wrappingVault,
      }),
    ],
    [wrappedUsdcMint],
  );

  const [extraAccountMetaList] = deriveExtraAccountMetaListAddress(
    wrappedUsdcMint.publicKey,
  );
  await sendInstructions(provider, [
    buildInitExtraAccountMetaListInstruction({
      admin: admin.publicKey,
      config,
      extraAccountMetaList,
      wrappedUsdcMint: wrappedUsdcMint.publicKey,
      wrappingVault,
    }),
  ]);

  return {
    config,
    wrappedUsdcMint: wrappedUsdcMint.publicKey,
    wrappingVault,
    extraAccountMetaList,
  };
}

export function insertPullApproval(args: {
  svm: LiteSVM;
  mandate: PublicKey;
  periodStart?: bigint;
  periodEnd?: bigint;
  validUntil: bigint;
  approvedAmount: bigint;
  approved?: boolean;
  createdAt?: bigint;
}): PublicKey {
  const { svm, mandate, validUntil, approvedAmount, approved = true } = args;
  const createdAt = args.createdAt ?? validUntil;
  const [approval, bump] = derivePullApprovalAddress(mandate);
  svm.setAccount(approval, {
    lamports: Number(
      svm.minimumBalanceForRentExemption(BigInt(PULL_APPROVAL_SIZE)),
    ),
    data: serializePullApproval({
      mandate,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      validUntil,
      approved,
      approvedAmount,
      createdAt,
      bump,
    }),
    owner: PROGRAM_ID,
    executable: false,
    rentEpoch: 0,
  });
  return approval;
}

export async function createToken2022Ata(
  provider: LiteSVMProvider,
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const { createAssociatedTokenAccountIdempotentInstruction } = await import(
    "@solana/spl-token"
  );
  await sendInstructions(provider, [
    createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  return ata;
}

export async function bootstrapMerchantCredential(
  provider: LiteSVMProvider,
  program: Program,
  merchant: Keypair,
): Promise<{
  credentialMintAddress: PublicKey;
  merchantStateAddress: PublicKey;
}> {
  const { instruction, credentialMintAddress, merchantStateAddress } =
    await buildInitMerchantCredentialInstruction(program, {
      merchant: merchant.publicKey,
    });
  const tx = new Transaction().add(instruction);
  await provider.sendAndConfirm!(tx, [merchant]);
  return { credentialMintAddress, merchantStateAddress };
}

export async function bootstrapTokenConfig(
  provider: LiteSVMProvider,
  program: Program,
  admin: Keypair,
  mint: PublicKey,
  billingRail: "hook" | "delegate",
  decimals: number,
): Promise<{ tokenConfigAddress: PublicKey }> {
  const { instruction, tokenConfigAddress } =
    await buildInitTokenConfigInstruction(program, {
      admin: admin.publicKey,
      mint,
      billingRail,
      decimals,
    });
  const tx = new Transaction().add(instruction);
  await provider.sendAndConfirm!(tx, [admin]);
  return { tokenConfigAddress };
}

export { USDC_DECIMALS };
