import type { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  deriveConfigAddress,
} from "../accounts/pda";
import {
  APPROVAL_SEED,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  EXTRA_ACCOUNT_METAS_SEED,
  MINT_AUTHORITY_SEED,
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
  return PublicKey.findProgramAddressSync(
    [APPROVAL_SEED, mandateAddress.toBuffer()],
    programId,
  )[0];
}

export function deriveMintAuthorityAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], programId)[0];
}

export function deriveExtraAccountMetaListAddress(
  wrappedUsdcMint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, wrappedUsdcMint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID,
  )[0];
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
  const [mandateAddress] = deriveAgentMandateAddress(authority, agent, programId);
  return {
    mandateAddress,
    mandateWrappedAccount: deriveAgentMandateWrappedAta(
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
  } = {},
): Promise<{
  protocolConfig: PublicKey;
  wrappedUsdcMint: PublicKey;
  wrappingVault: PublicKey;
}> {
  const [protocolConfig] = deriveConfigAddress(program.programId);

  if (overrides.wrappedUsdcMint && overrides.wrappingVault) {
    return {
      protocolConfig,
      wrappedUsdcMint: overrides.wrappedUsdcMint,
      wrappingVault: overrides.wrappingVault,
    };
  }

  const raw = await (program.account as any).protocolConfig.fetch(protocolConfig);
  return {
    protocolConfig,
    wrappedUsdcMint: overrides.wrappedUsdcMint ?? raw.wrappedUsdcMint,
    wrappingVault: overrides.wrappingVault ?? raw.wrappingVault,
  };
}

export {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
};
