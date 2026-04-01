import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import type { LiteSVMProvider } from "anchor-litesvm";
import type { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import {
  APPROVAL_SEED,
  CONFIG_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  MINT_AUTHORITY_SEED,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  USDC_DECIMALS,
} from "../../src/constants";

const EMPTY_PUBKEY = new PublicKey(new Uint8Array(32));
const PROTOCOL_CONFIG_SIZE = 146;
const PULL_APPROVAL_SIZE = 66;

function discriminator(namespace: "global" | "account", name: string): Buffer {
  return createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

export function findHookSo(): string {
  const candidates = [
    resolve(
      __dirname,
      "../../../../vela-protocol/target/deploy/vela_transfer_hook.so",
    ),
    "/Users/laitsky/Developments/vela-labs/vela-protocol/target/deploy/vela_transfer_hook.so",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    `vela_transfer_hook.so not found. Tried: ${candidates.join(", ")}`,
  );
}

export function deriveConfigAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
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
  discriminator("account", "ProtocolConfig").copy(data, 0);
  admin.toBuffer().copy(data, 8);
  EMPTY_PUBKEY.toBuffer().copy(data, 40);
  data.writeUInt8(0, 72);
  data.writeBigUInt64LE(0n, 73);
  EMPTY_PUBKEY.toBuffer().copy(data, 81);
  EMPTY_PUBKEY.toBuffer().copy(data, 113);
  data.writeUInt8(bump, 145);
  return data;
}

function serializePullApproval(args: {
  mandate: PublicKey;
  validUntil: bigint;
  approved: boolean;
  approvedAmount: bigint;
  createdAt: bigint;
  bump: number;
}): Uint8Array {
  const data = Buffer.alloc(PULL_APPROVAL_SIZE);
  discriminator("account", "PullApproval").copy(data, 0);
  args.mandate.toBuffer().copy(data, 8);
  data.writeBigInt64LE(args.validUntil, 40);
  data.writeUInt8(args.approved ? 1 : 0, 48);
  data.writeBigUInt64LE(args.approvedAmount, 49);
  data.writeBigInt64LE(args.createdAt, 57);
  data.writeUInt8(args.bump, 65);
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
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
  const [mintAuthority] = deriveMintAuthorityAddress();
  const wrappingVault = getAssociatedTokenAddressSync(
    splUsdcMint,
    mintAuthority,
    true,
    TOKEN_PROGRAM_ID,
  );

  svm.setAccount(config, {
    lamports: Number(svm.minimumBalanceForRentExemption(BigInt(PROTOCOL_CONFIG_SIZE))),
    data: serializeProtocolConfig(admin.publicKey, configBump),
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
  validUntil: bigint;
  approvedAmount: bigint;
  approved?: boolean;
  createdAt?: bigint;
}): PublicKey {
  const { svm, mandate, validUntil, approvedAmount, approved = true } = args;
  const createdAt = args.createdAt ?? validUntil;
  const [approval, bump] = derivePullApprovalAddress(mandate);
  svm.setAccount(approval, {
    lamports: Number(svm.minimumBalanceForRentExemption(BigInt(PULL_APPROVAL_SIZE))),
    data: serializePullApproval({
      mandate,
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

export { USDC_DECIMALS };
