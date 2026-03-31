import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "BhgXzh4E6e9xsgNrsPf9q1JqXKxETxjc9LBqx3D8cAKC",
);

export const SEED_PREFIXES = {
  MERCHANT: Buffer.from("merchant"),
  PLAN: Buffer.from("plan"),
  MANDATE: Buffer.from("mandate"),
  CREDENTIAL: Buffer.from("credential"),
} as const;

// Wrapping-related PDAs
export const MINT_AUTHORITY_SEED = Buffer.from("mint-authority");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");
export const CONFIG_SEED = Buffer.from("config");
export const APPROVAL_SEED = Buffer.from("approval");

// Token constants
export const USDC_DECIMALS = 6;

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };
