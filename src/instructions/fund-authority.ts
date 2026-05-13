import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  type Commitment,
  type Connection,
  type PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, VELAUSD_DECIMALS } from "../constants";

export interface BuildFundAuthorityFromWalletParams {
  connection: Connection;
  wallet: PublicKey;
  authority: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals?: number;
  commitment?: Commitment;
  tokenProgramId?: PublicKey;
}

export interface BuildFundAuthorityFromWalletResult {
  instructions: TransactionInstruction[];
  sourceTokenAccount: PublicKey;
  authorityTokenAccount: PublicKey;
}

/**
 * Builds the two instructions needed for a wallet to fund a protocol authority
 * PDA, such as a recurring mandate or stream mandate.
 *
 * The transfer uses Token-2022 transfer-hook resolution, so callers get the
 * same extra account metas that will be required on devnet.
 */
export async function buildFundAuthorityFromWalletInstructions(
  params: BuildFundAuthorityFromWalletParams,
): Promise<BuildFundAuthorityFromWalletResult> {
  const {
    connection,
    wallet,
    authority,
    mint,
    amount,
    decimals = VELAUSD_DECIMALS,
    commitment = "confirmed",
    tokenProgramId = TOKEN_2022_PROGRAM_ID,
  } = params;

  const sourceTokenAccount = await getAssociatedTokenAddress(
    mint,
    wallet,
    false,
    tokenProgramId,
  );
  const authorityTokenAccount = await getAssociatedTokenAddress(
    mint,
    authority,
    true,
    tokenProgramId,
  );

  const createAuthorityTokenAccount =
    createAssociatedTokenAccountIdempotentInstruction(
      wallet,
      authorityTokenAccount,
      authority,
      mint,
      tokenProgramId,
    );
  const transfer = await createTransferCheckedWithTransferHookInstruction(
    connection,
    sourceTokenAccount,
    mint,
    authorityTokenAccount,
    wallet,
    amount,
    decimals,
    [],
    commitment,
    tokenProgramId,
  );

  return {
    instructions: [createAuthorityTokenAccount, transfer],
    sourceTokenAccount,
    authorityTokenAccount,
  };
}
