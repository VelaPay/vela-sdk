import type { PublicKey } from "@solana/web3.js";
import {
  DEVNET_USDC_MINT,
  EURC_MINT,
  PYUSD_MINT,
  USDC_MINT,
} from "../constants";

export const TOKEN_SYMBOLS: Record<string, string> = {
  [DEVNET_USDC_MINT.toBase58()]: "USDC",
  [USDC_MINT.toBase58()]: "USDC",
  [PYUSD_MINT.toBase58()]: "PYUSD",
  [EURC_MINT.toBase58()]: "EURC",
};

export function getTokenSymbol(mint: PublicKey | string): string {
  const key = typeof mint === "string" ? mint : mint.toBase58();
  return TOKEN_SYMBOLS[key] ?? "TOKEN";
}
