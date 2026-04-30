import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PDAFactory } from "../accounts/pda";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../constants";
import type { AgentServiceLimitInput } from "../types";

export function toBn(value: bigint | number): BN {
  return new BN(BigInt(value).toString());
}

export function toOptionalBn(value?: bigint | number): BN | null {
  return value == null ? null : toBn(value);
}

export function mapServiceLimitInputs(
  services: AgentServiceLimitInput[],
): Array<{ service: PublicKey; dailyLimit: BN }> {
  return services.map((serviceLimit) => ({
    service: serviceLimit.service,
    dailyLimit: toBn(serviceLimit.dailyLimit),
  }));
}

export function deriveAgentPullApprovalAddress(
  mandateAddress: PublicKey,
  programId: PublicKey,
): PublicKey {
  return PDAFactory.approval(mandateAddress, programId)[0];
}

export function deriveMintAuthorityAddress(programId: PublicKey): PublicKey {
  return PDAFactory.mintAuthority(programId)[0];
}

export function deriveExtraAccountMetaListAddress(
  wrappedUsdcMint: PublicKey,
  hookProgramId: PublicKey = TRANSFER_HOOK_PROGRAM_ID,
): PublicKey {
  return PDAFactory.extraAccountMetas(wrappedUsdcMint, hookProgramId)[0];
}

export function deriveAuthorityUsdcAccount(
  authority: PublicKey,
  splUsdcMint: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(
    splUsdcMint,
    authority,
    false,
    TOKEN_PROGRAM_ID,
  );
}

export function deriveAgentMandateContext(
  authority: PublicKey,
  agent: PublicKey,
  wrappedUsdcMint: PublicKey,
  programId: PublicKey,
): {
  mandateAddress: PublicKey;
  mandateWrappedAccount: PublicKey;
} {
  const [mandateAddress] = PDAFactory.agentMandate(authority, agent, programId);
  return {
    mandateAddress,
    mandateWrappedAccount: PDAFactory.agentMandateWrappedAta(
      mandateAddress,
      wrappedUsdcMint,
    ),
  };
}

export async function resolveAgentProtocolAccounts(
  program: Program,
  overrides: {
    wrappedUsdcMint?: PublicKey;
    wrappingVault?: PublicKey;
    hookProgramId?: PublicKey;
  } = {},
): Promise<{
  protocolConfig: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
  hookProgramId: PublicKey;
}> {
  const [protocolConfig] = PDAFactory.config(program.programId);

  if (
    overrides.wrappedUsdcMint &&
    overrides.wrappingVault &&
    overrides.hookProgramId
  ) {
    return {
      protocolConfig,
      wrappedUsdcMint: overrides.wrappedUsdcMint,
      wrappingVault: overrides.wrappingVault,
      hookProgramId: overrides.hookProgramId,
    };
  }

  const raw = await (program.account as any).protocolConfig.fetch(
    protocolConfig,
  );
  return {
    protocolConfig,
    wrappedUsdcMint: overrides.wrappedUsdcMint ?? raw.wrappedUsdcMint,
    wrappingVault: overrides.wrappingVault ?? raw.wrappingVault,
    hookProgramId: overrides.hookProgramId ?? raw.transferHookProgramId,
  };
}

export {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
};
