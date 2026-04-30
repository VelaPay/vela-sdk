import type { Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { deriveConfigAddress } from "../accounts/pda";
import type { VelaAdjustAgentMandateParams } from "../types";
import {
  deriveAgentMandateContext,
  mapServiceLimitInputs,
  TOKEN_2022_PROGRAM_ID,
  toOptionalBn,
} from "./agent-mandate-shared";

export interface BuildAdjustAgentMandateResult {
  instruction: TransactionInstruction;
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
}

export async function buildAdjustAgentMandateInstruction(
  program: Program,
  params: VelaAdjustAgentMandateParams & { authority: PublicKey },
): Promise<BuildAdjustAgentMandateResult> {
  const { authority, agent } = params;
  const [protocolConfig] = deriveConfigAddress(program.programId);
  const wrappedUsdcMint =
    params.wrappedUsdcMint ??
    (await (program.account as any).protocolConfig.fetch(protocolConfig))
      .wrappedUsdcMint;
  const { mandateAddress, mandateWrappedAccount } = deriveAgentMandateContext(
    authority,
    agent,
    wrappedUsdcMint,
    program.programId,
  );

  const instruction = await (program.methods as any)
    .adjustAgentMandate(
      toOptionalBn(params.dailyLimit),
      toOptionalBn(params.lifetimeCap),
      toOptionalBn(params.minPullAmount),
      toOptionalBn(params.minPullInterval),
      params.services == null ? null : mapServiceLimitInputs(params.services),
    )
    .accounts({
      authority,
      agent,
      agentMandate: mandateAddress,
      mandateWrappedAccount,
      wrappedUsdcMint,
      protocolConfig,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();

  return { instruction, mandateAddress, mandateWrappedAccount };
}
