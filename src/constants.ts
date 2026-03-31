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

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };
