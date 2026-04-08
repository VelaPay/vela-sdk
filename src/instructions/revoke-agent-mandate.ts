import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { VelaRevokeAgentMandateParams } from "../types";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  deriveAgentMandateContext,
  deriveAuthorityUsdcAccount,
  deriveMintAuthorityAddress,
  resolveAgentProtocolAccounts,
} from "./agent-mandate-shared";

export interface BuildRevokeAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
}

export async function buildRevokeAgentMandateInstruction(
  program: Program,
  params: VelaRevokeAgentMandateParams & { authority: PublicKey },
): Promise<BuildRevokeAgentMandateResult> {
  const { authority, agent, splUsdcMint } = params;
  const { protocolConfig, wrappedUsdcMint, wrappingVault } =
    await resolveAgentProtocolAccounts(program, {
      wrappedUsdcMint: params.wrappedUsdcMint,
      wrappingVault: params.wrappingVault,
    });
  const { mandateAddress, mandateWrappedAccount } = deriveAgentMandateContext(
    authority,
    agent,
    wrappedUsdcMint,
    program.programId,
  );
  const authorityUsdcAccount =
    params.authorityUsdcAccount ??
    deriveAuthorityUsdcAccount(authority, splUsdcMint);
  const mintAuthority = deriveMintAuthorityAddress(program.programId);

  const instruction = await (program.methods as any)
    .revokeAgentMandate()
    .accounts({
      authority,
      agent,
      agentMandate: mandateAddress,
      mandateWrappedAccount,
      authorityUsdcAccount,
      wrappedUsdcMint,
      protocolConfig,
      splUsdcMint,
      wrappingVault,
      mintAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction, mandateAddress, mandateWrappedAccount };
}
