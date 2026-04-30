import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { VelaDrainAgentMandateParams } from "../types";
import {
  deriveAgentMandateContext,
  deriveAuthorityUsdcAccount,
  deriveMintAuthorityAddress,
  resolveAgentProtocolAccounts,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./agent-mandate-shared";

export interface BuildDrainAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
}

export async function buildDrainAgentMandateInstruction(
  program: Program,
  params: VelaDrainAgentMandateParams & { authority: PublicKey },
): Promise<BuildDrainAgentMandateResult> {
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
    .drainAgentMandate()
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
