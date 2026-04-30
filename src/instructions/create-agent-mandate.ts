import type { Program } from "@coral-xyz/anchor";
import {
  type PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { VelaCreateAgentMandateParams } from "../types";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  deriveAgentMandateContext,
  deriveAuthorityUsdcAccount,
  deriveMintAuthorityAddress,
  mapServiceLimitInputs,
  resolveAgentProtocolAccounts,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  toBn,
} from "./agent-mandate-shared";

export interface BuildCreateAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
}

export async function buildCreateAgentMandateInstruction(
  program: Program,
  params: VelaCreateAgentMandateParams & { authority: PublicKey },
): Promise<BuildCreateAgentMandateResult> {
  const {
    authority,
    agent,
    splUsdcMint,
    dailyLimit,
    lifetimeCap,
    minPullAmount,
    minPullInterval,
    services,
    fundedAmount,
  } = params;
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
    .createAgentMandate(
      toBn(dailyLimit),
      toBn(lifetimeCap),
      toBn(minPullAmount),
      toBn(minPullInterval),
      mapServiceLimitInputs(services),
      toBn(fundedAmount),
    )
    .accounts({
      authority,
      agent,
      agentMandate: mandateAddress,
      authorityUsdcAccount,
      mandateWrappedAccount,
      wrappedUsdcMint,
      protocolConfig,
      splUsdcMint,
      wrappingVault,
      mintAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { instruction, mandateAddress, mandateWrappedAccount };
}
