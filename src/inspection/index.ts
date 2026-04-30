import type { PublicKey, TransactionInstruction } from "@solana/web3.js";

export interface ExplainedAccountMeta {
  index: number;
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
  role: "signer-writable" | "signer-readonly" | "writable" | "readonly";
}

export interface ExplainedInstruction {
  label?: string;
  programId: string;
  accountCount: number;
  dataLength: number;
  signers: string[];
  writableAccounts: string[];
  readonlyAccounts: string[];
  accounts: ExplainedAccountMeta[];
}

export interface ExplainedTransactionPlan {
  instructionCount: number;
  programs: string[];
  signers: string[];
  writableAccounts: string[];
  readonlyAccounts: string[];
  instructions: ExplainedInstruction[];
}

function publicKeyToString(key: PublicKey): string {
  return key.toBase58();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function accountRole(
  meta: Pick<ExplainedAccountMeta, "isSigner" | "isWritable">,
): ExplainedAccountMeta["role"] {
  if (meta.isSigner && meta.isWritable) return "signer-writable";
  if (meta.isSigner) return "signer-readonly";
  if (meta.isWritable) return "writable";
  return "readonly";
}

export function explainInstruction(
  instruction: TransactionInstruction,
  label?: string,
): ExplainedInstruction {
  const accounts = instruction.keys.map((meta, index) => {
    const explained = {
      index,
      pubkey: publicKeyToString(meta.pubkey),
      isSigner: meta.isSigner,
      isWritable: meta.isWritable,
    };
    return {
      ...explained,
      role: accountRole(explained),
    };
  });

  return {
    label,
    programId: publicKeyToString(instruction.programId),
    accountCount: accounts.length,
    dataLength: instruction.data.length,
    signers: unique(
      accounts.filter((meta) => meta.isSigner).map((meta) => meta.pubkey),
    ),
    writableAccounts: unique(
      accounts.filter((meta) => meta.isWritable).map((meta) => meta.pubkey),
    ),
    readonlyAccounts: unique(
      accounts.filter((meta) => !meta.isWritable).map((meta) => meta.pubkey),
    ),
    accounts,
  };
}

export function explainInstructions(
  instructions: readonly TransactionInstruction[],
): ExplainedTransactionPlan {
  const explained = instructions.map((instruction, index) =>
    explainInstruction(instruction, `instruction-${index}`),
  );
  return {
    instructionCount: explained.length,
    programs: unique(explained.map((instruction) => instruction.programId)),
    signers: unique(explained.flatMap((instruction) => instruction.signers)),
    writableAccounts: unique(
      explained.flatMap((instruction) => instruction.writableAccounts),
    ),
    readonlyAccounts: unique(
      explained.flatMap((instruction) => instruction.readonlyAccounts),
    ),
    instructions: explained,
  };
}
