import { PublicKey } from "@solana/web3.js";
import { seedBytes } from "./browser/bytes";
import {
  DEFAULT_VELA_PROTOCOL_PROGRAM_ID,
  DEFAULT_VELA_TRANSFER_HOOK_PROGRAM_ID,
} from "./generated/program-ids";

export const PROGRAM_ID = new PublicKey(DEFAULT_VELA_PROTOCOL_PROGRAM_ID);
/** Default hook program ID. SDK fetches dynamically from ProtocolConfig at runtime (SDK-03). Kept as fallback for offline/test scenarios. */
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  DEFAULT_VELA_TRANSFER_HOOK_PROGRAM_ID,
);

export const SEED_PREFIXES = {
  MERCHANT: seedBytes("merchant"),
  PLAN: seedBytes("plan"),
  MANDATE: seedBytes("mandate"),
  CREDENTIAL: seedBytes("credential"),
  AGENT_MANDATE: seedBytes("agent-mandate"),
  MERCHANT_CREDENTIAL: seedBytes("merchant-credential"),
  STREAM: seedBytes("stream"),
  TOKEN_CONFIG: seedBytes("token_config"),
} as const;

// Wrapping-related PDAs
export const MINT_AUTHORITY_SEED = seedBytes("mint-authority");
export const EXTRA_ACCOUNT_METAS_SEED = seedBytes("extra-account-metas");
export const CONFIG_SEED = seedBytes("config");
export const APPROVAL_SEED = seedBytes("approval");
export const BILLING_SEED = seedBytes("billing");
export const KEEPER_CONFIG_SEED = seedBytes("keeper-config");
export const TOKEN_CONFIG_SEED = seedBytes("token_config");

// Token constants
export const USDC_DECIMALS = 6;
export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
export const PYUSD_MINT = new PublicKey(
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
);
export const EURC_MINT = new PublicKey(
  "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
