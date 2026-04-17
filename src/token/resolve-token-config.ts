import type { Connection, PublicKey } from "@solana/web3.js";
import { fetchTokenConfig } from "../accounts";
import { PDAFactory } from "../accounts/pda";
import { PROGRAM_ID } from "../constants";
import {
  TokenConfigDisabled,
  TokenConfigNotFound,
} from "../errors/upgrade-errors";
import type { TokenConfigAccount } from "../types";
import { getTokenSymbol } from "./token-symbols";

export async function resolveTokenConfig(
  connection: Connection,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): Promise<TokenConfigAccount> {
  const [tokenConfigAddress] = PDAFactory.tokenConfig(mint, programId);

  try {
    const tokenConfig = await fetchTokenConfig(connection, tokenConfigAddress);
    const withSymbol = {
      ...tokenConfig,
      tokenSymbol: getTokenSymbol(tokenConfig.mint),
    };
    if (!withSymbol.enabled) {
      throw new TokenConfigDisabled(mint);
    }
    return withSymbol;
  } catch (error) {
    if (error instanceof TokenConfigDisabled) {
      throw error;
    }
    throw new TokenConfigNotFound(mint);
  }
}
