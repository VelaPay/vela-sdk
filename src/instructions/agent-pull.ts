import type { Program } from "@coral-xyz/anchor";
import {
  SystemProgram,
  type PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PDAFactory } from "../accounts/pda";
import type { VelaAgentPullParams } from "../types";
import {
  TOKEN_2022_PROGRAM_ID,
  deriveAgentMandateContext,
  resolveAgentProtocolAccounts,
  toBn,
} from "./agent-mandate-shared";

export interface BuildAgentPullResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
  pullApprovalAddress: PublicKey;
}

export async function buildAgentPullInstruction(
  program: Program,
  params: VelaAgentPullParams & { payer: PublicKey; agent: PublicKey },
): Promise<BuildAgentPullResult> {
  const {
    payer,
    agent,
    authority,
    mandateAddress: expectedMandateAddress,
    serviceWrappedAccount,
    amount,
  } = params;
  const { protocolConfig, wrappedUsdcMint, wrappingVault, hookProgramId } =
    await resolveAgentProtocolAccounts(program, {
      wrappedUsdcMint: params.wrappedUsdcMint,
      wrappingVault: params.wrappingVault,
      hookProgramId: params.hookProgramId,
    });
  const { mandateAddress, mandateWrappedAccount } = deriveAgentMandateContext(
    authority,
    agent,
    wrappedUsdcMint,
    program.programId,
  );
  if (
    expectedMandateAddress &&
    !expectedMandateAddress.equals(mandateAddress)
  ) {
    throw new Error(
      `Provided mandate ${expectedMandateAddress.toBase58()} does not match the authority/agent-derived mandate ${mandateAddress.toBase58()}.`,
    );
  }
  const [pullApprovalAddress] = PDAFactory.approval(
    mandateAddress,
    program.programId,
  );
  const [tokenConfigAddress] = PDAFactory.tokenConfig(
    wrappedUsdcMint,
    program.programId,
  );
  const [extraAccountMetaList] = PDAFactory.extraAccountMetas(
    wrappedUsdcMint,
    hookProgramId,
  );

  const instruction = await (program.methods as any)
    .agentPull(toBn(amount))
    .accounts({
      payer,
      agent,
      authority,
      agentMandate: mandateAddress,
      mandateWrappedAccount,
      serviceWrappedAccount,
      pullApproval: pullApprovalAddress,
      tokenConfig: tokenConfigAddress,
      wrappedUsdcMint,
      protocolConfig,
      wrappingVault,
      hookProgram: hookProgramId,
      extraAccountMetaList,
      protocolProgram: program.programId,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return {
    instruction,
    mandateAddress,
    mandateWrappedAccount,
    pullApprovalAddress,
  };
}
