import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import { u64LE } from "../browser/bytes";
import {
  APPROVAL_SEED,
  ARCIUM_REQUEST_BILLING_RECORD_SEED,
  ARCIUM_REQUEST_SEED,
  ARCIUM_REQUEST_USAGE_COMPUTATION_SEED,
  ARCIUM_REQUEST_VALIDATION_SEED,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  BILLING_SEED,
  CONFIG_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  KEEPER_CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  PROGRAM_ID,
  SEED_PREFIXES,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_CONFIG_SEED,
} from "../constants";
import {
  USAGE_CREDENTIAL_SEED,
  USAGE_PLAN_SEED,
  USAGE_REPORT_SEED,
} from "../types";

function toLe8(value: BN | bigint | number): Uint8Array {
  return u64LE(typeof value === "object" ? BigInt(value.toString()) : value);
}

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  tokenProgramId: PublicKey = TOKEN_2022_PROGRAM_ID,
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBytes())) {
    throw new Error("Owner is off curve");
  }

  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
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
        subscriber.toBytes(),
        merchant.toBytes(),
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
        SEED_PREFIXES.STREAM,
        subscriber.toBytes(),
        merchant.toBytes(),
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
      [SEED_PREFIXES.MANDATE, subscriber.toBytes(), plan.toBytes()],
      programId,
    );
  }

  static credential(
    merchant: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.MERCHANT_CREDENTIAL, merchant.toBytes()],
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
      [SEED_PREFIXES.CREDENTIAL, merchant.toBytes(), toLe8(planId)],
      programId,
    );
  }

  static tokenConfig(
    mint: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [TOKEN_CONFIG_SEED, mint.toBytes()],
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
      [SEED_PREFIXES.MERCHANT, merchant.toBytes()],
      programId,
    );
  }

  static plan(
    merchant: PublicKey,
    planId: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.PLAN, merchant.toBytes(), toLe8(planId)],
      programId,
    );
  }

  static usagePlan(
    merchant: PublicKey,
    planId: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_PLAN_SEED, merchant.toBytes(), toLe8(planId)],
      programId,
    );
  }

  static usageCredential(
    merchant: PublicKey,
    planId: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_CREDENTIAL_SEED, merchant.toBytes(), toLe8(planId)],
      programId,
    );
  }

  static usageReport(
    mandate: PublicKey,
    periodStart: BN | bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USAGE_REPORT_SEED, mandate.toBytes(), toLe8(periodStart)],
      programId,
    );
  }

  static agentMandate(
    authority: PublicKey,
    agent: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.AGENT_MANDATE, authority.toBytes(), agent.toBytes()],
      programId,
    );
  }

  static approval(
    mandate: PublicKey,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [APPROVAL_SEED, mandate.toBytes()],
      programId,
    );
  }

  static billing(
    mandate: PublicKey,
    pullsExecuted: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [BILLING_SEED, mandate.toBytes(), toLe8(pullsExecuted)],
      programId,
    );
  }

  static arciumValidationRequest(
    mandate: PublicKey,
    nextPaymentDue: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        ARCIUM_REQUEST_SEED,
        ARCIUM_REQUEST_VALIDATION_SEED,
        mandate.toBytes(),
        toLe8(nextPaymentDue),
      ],
      programId,
    );
  }

  static arciumUsageComputationRequest(
    mandate: PublicKey,
    periodStart: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        ARCIUM_REQUEST_SEED,
        ARCIUM_REQUEST_USAGE_COMPUTATION_SEED,
        mandate.toBytes(),
        toLe8(periodStart),
      ],
      programId,
    );
  }

  static arciumBillingRecordRequest(
    mandate: PublicKey,
    pullsExecuted: bigint | number,
    programId: PublicKey = PROGRAM_ID,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        ARCIUM_REQUEST_SEED,
        ARCIUM_REQUEST_BILLING_RECORD_SEED,
        mandate.toBytes(),
        toLe8(pullsExecuted),
      ],
      programId,
    );
  }

  static extraAccountMetas(
    mint: PublicKey,
    hookProgramId: PublicKey,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [EXTRA_ACCOUNT_METAS_SEED, mint.toBytes()],
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
    return getAssociatedTokenAddress(
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

export function deriveArciumValidationRequestAddress(
  mandate: PublicKey,
  nextPaymentDue: bigint | number,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.arciumValidationRequest(mandate, nextPaymentDue, programId);
}

export function deriveArciumUsageComputationRequestAddress(
  mandate: PublicKey,
  periodStart: bigint | number,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.arciumUsageComputationRequest(
    mandate,
    periodStart,
    programId,
  );
}

export function deriveArciumBillingRecordRequestAddress(
  mandate: PublicKey,
  pullsExecuted: bigint | number,
  programId?: PublicKey,
): [PublicKey, number] {
  return PDAFactory.arciumBillingRecordRequest(
    mandate,
    pullsExecuted,
    programId,
  );
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
  return PDAFactory.agentMandateWrappedAta(
    agentMandateAddress,
    wrappedUsdcMint,
  );
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
