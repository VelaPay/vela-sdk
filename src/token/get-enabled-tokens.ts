import type { Connection, PublicKey } from "@solana/web3.js";
import { deserializeTokenConfigAccount } from "../accounts/deserialize";
import { PROGRAM_ID } from "../constants";
import type { TokenConfigAccount } from "../types";
import { getTokenSymbol } from "./token-symbols";

const TOKEN_CONFIG_ACCOUNT_SIZE = 213;

export async function getEnabledTokens(
  connection: Connection,
  programId: PublicKey = PROGRAM_ID,
): Promise<TokenConfigAccount[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: TOKEN_CONFIG_ACCOUNT_SIZE }],
  });

  return accounts
    .map(({ pubkey, account }) => {
      const tokenConfig = deserializeTokenConfigAccount(pubkey, account.data);
      return {
        ...tokenConfig,
        tokenSymbol: getTokenSymbol(tokenConfig.mint),
      };
    })
    .filter((tokenConfig) => tokenConfig.enabled);
}
