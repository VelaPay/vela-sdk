import type { Program } from "@coral-xyz/anchor";
import { SystemProgram, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { VelaAgentPullParams } from "../types";
import {
  TOKEN_2022_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  deriveAgentMandateContext,
  deriveAgentPullApprovalAddress,
  deriveExtraAccountMetaListAddress,
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
  const { payer, agent, authority, mandateAddress: expectedMandateAddress, serviceWrappedAccount, amount } = params;
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
  if (
    expectedMandateAddress &&
    !expectedMandateAddress.equals(mandateAddress)
  ) {
    throw new Error(
      `Provided mandate ${expectedMandateAddress.toBase58()} does not match the authority/agent-derived mandate ${mandateAddress.toBase58()}.`,
    );
  }
  const pullApprovalAddress = deriveAgentPullApprovalAddress(
    mandateAddress,
    program.programId,
  );
  const extraAccountMetaList = deriveExtraAccountMetaListAddress(wrappedUsdcMint);

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
      wrappedUsdcMint,
      protocolConfig,
      wrappingVault,
      hookProgram: TRANSFER_HOOK_PROGRAM_ID,
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
