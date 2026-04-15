import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  APPROVAL_SEED,
  BILLING_SEED,
  CONFIG_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  KEEPER_CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  PROGRAM_ID,
  SEED_PREFIXES,
  TOKEN_CONFIG_SEED,
} from "../constants";
import {
  USAGE_CREDENTIAL_SEED,
  USAGE_PLAN_SEED,
  USAGE_REPORT_SEED,
} from "../types";

function toLe8(value: BN | bigint | number): Buffer {
  return new BN(value.toString()).toArrayLike(Buffer, "le", 8);
}

export class PDAFactory {
  static mandate(
    subscriber: PublicKey,
    merchant: PublicKey,
    mandateIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        SEED_PREFIXES.MANDATE,
        subscriber.toBuffer(),
        merchant.toBuffer(),
        toLe8(mandateIndex),
      ],
      programId,
    );
  }

  static stream(
    subscriber: PublicKey,
    merchant: PublicKey,
    mandateIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        subscriber.toBuffer(),
        merchant.toBuffer(),
        toLe8(mandateIndex),
      ],
      programId,
    );
  }

  /**
   * @deprecated Use PDAFactory.mandate() with V2 seed scheme.
   */
  static mandateV1(
    subscriber: PublicKey,
    plan: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.MANDATE, subscriber.toBuffer(), plan.toBuffer()],
      programId,
    );
  }

  static credential(
    merchant: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.MERCHANT_CREDENTIAL, merchant.toBuffer()],
      programId,
    );
  }

  /**
   * @deprecated Use PDAFactory.credential() for per-merchant credential.
   */
  static credentialV1(
    merchant: PublicKey,
    planId: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.CREDENTIAL, merchant.toBuffer(), toLe8(planId)],
      programId,
    );
  }

  static tokenConfig(
    mint: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [TOKEN_CONFIG_SEED, mint.toBuffer()],
      programId,
    );
  }

  static config(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  }

  static keeperConfig(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([KEEPER_CONFIG_SEED], programId);
  }

  static merchantState(
    merchant: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.MERCHANT, merchant.toBuffer()],
      programId,
    );
  }

  static plan(
    merchant: PublicKey,
    planId: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.PLAN, merchant.toBuffer(), toLe8(planId)],
      programId,
    );
  }

  static usagePlan(
    merchant: PublicKey,
    planId: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_PLAN_SEED, merchant.toBuffer(), toLe8(planId)],
      programId,
    );
  }

  static usageCredential(
    merchant: PublicKey,
    planId: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_CREDENTIAL_SEED, merchant.toBuffer(), toLe8(planId)],
      programId,
    );
  }

  static usageReport(
    mandate: PublicKey,
    periodStart: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_REPORT_SEED, mandate.toBuffer(), toLe8(periodStart)],
      programId,
    );
  }

  static agentMandate(
    authority: PublicKey,
    agent: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.AGENT_MANDATE, authority.toBuffer(), agent.toBuffer()],
      programId,
    );
  }

  static approval(
    mandate: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [APPROVAL_SEED, mandate.toBuffer()],
      programId,
    );
  }

  static billing(
    mandate: PublicKey,
    pullsExecuted: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [BILLING_SEED, mandate.toBuffer(), toLe8(pullsExecuted)],
      programId,
    );
  }

  static extraAccountMetas(
    mint: PublicKey,
    hookProgramId: PublicKey,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
      hookProgramId,
    );
  }

  static mintAuthority(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], programId);
  }

  static agentMandateWrappedAta(
    agentMandateAddress: PublicKey,
    wrappedUsdcMint: PublicKey,
  ): PublicKey {
    return getAssociatedTokenAddressSync(
      wrappedUsdcMint,
      agentMandateAddress,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
  }
}

/** @deprecated Use PDAFactory.merchantState(). */
export function deriveMerchantStateAddress(
  merchant: PublicKey,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.merchantState(merchant, programId);
}

/** @deprecated Use PDAFactory.plan(). */
export function derivePlanAddress(
  merchant: PublicKey,
  planId: bigint | number,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.plan(merchant, planId, programId);
}

/** @deprecated Use PDAFactory.mandateV1() or PDAFactory.mandate() for V2 seeds. */
export function deriveMandateAddress(
  subscriber: PublicKey,
  plan: PublicKey,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.mandateV1(subscriber, plan, programId);
}

/** @deprecated Use PDAFactory.credentialV1() or PDAFactory.credential() for V2 seeds. */
export function deriveCredentialMintAddress(
  merchant: PublicKey,
  planId: bigint | number,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.credentialV1(merchant, planId, programId);
}

/** @deprecated Use PDAFactory.agentMandate(). */
export function deriveAgentMandateAddress(
  authority: PublicKey,
  agent: PublicKey,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.agentMandate(authority, agent, programId);
}

/** @deprecated Use PDAFactory.agentMandateWrappedAta(). */
export function deriveAgentMandateWrappedAta(
  agentMandateAddress: PublicKey,
  wrappedUsdcMint: PublicKey,
): PublicKey {
  return PDAFactory.agentMandateWrappedAta(agentMandateAddress, wrappedUsdcMint);
}

/** @deprecated Use PDAFactory.keeperConfig(). */
export function deriveKeeperConfigAddress(
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.keeperConfig(programId);
}

/** @deprecated Use PDAFactory.config(). */
export function deriveConfigAddress(
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.config(programId);
}
