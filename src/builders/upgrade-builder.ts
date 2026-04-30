import type { Program } from "@coral-xyz/anchor";
import type {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TokenChangeNotSupported } from "../errors/upgrade-errors";
import { buildSchedulePlanChangeInstruction } from "../instructions/schedule-plan-change";
import { buildUpdateMandatePlanInstruction } from "../instructions/update-mandate-plan";
import { buildUpdateStreamRateInstruction } from "../instructions/update-stream-rate";
import { computeProration, type ProrationOutcome } from "../proration";
import { formatAmount } from "../token/format-amount";
import { getTokenSymbol } from "../token/token-symbols";
import type { TokenConfigAccount, VelaMandate } from "../types";
import type { StreamMandate } from "../types/stream-mandate";

export interface PreviewPlanChangeResult {
  outcome: ProrationOutcome;
  prorationAmount: bigint;
  effectiveAt: Date;
  requiresSubscriberSig: boolean;
  newAuthCeiling: bigint;
  currentPeriodRemaining: bigint;
  formatted: {
    amount: string;
    tokenSymbol: string;
  };
}

export interface PeriodicUpgradePlanInput {
  address: PublicKey;
  amount: bigint | number;
  effectiveAt?: Date | bigint | number;
  mint?: PublicKey;
}

export interface StreamRatePlanInput {
  amount: bigint | number;
  authorizedMaxRate?: bigint | number;
  mint?: PublicKey;
}

export type UpgradePlanInput = PeriodicUpgradePlanInput | StreamRatePlanInput;

export interface UpgradeBuilderArgs {
  connection: Connection;
  program: Program;
  mandate: VelaMandate | StreamMandate;
  newPlan: UpgradePlanInput;
  tokenConfig: TokenConfigAccount;
  authority: PublicKey;
}

function toBigInt(value: bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function resolveEffectiveAt(value?: Date | bigint | number): Date | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  const numeric = typeof value === "bigint" ? Number(value) : value;
  return new Date(numeric * 1000);
}

function isStreamMandateAccount(
  mandate: VelaMandate | StreamMandate,
): mandate is StreamMandate {
  return "ratePerSecond" in mandate;
}

function assertTokenMatch(
  tokenConfig: TokenConfigAccount,
  candidateMint?: PublicKey,
  mandateMint?: PublicKey,
) {
  if (candidateMint && !candidateMint.equals(tokenConfig.mint)) {
    throw new TokenChangeNotSupported(tokenConfig.mint, candidateMint);
  }
  if (mandateMint && !mandateMint.equals(tokenConfig.mint)) {
    throw new TokenChangeNotSupported(mandateMint, tokenConfig.mint);
  }
}

function previewPeriodicPlanChange(
  mandate: VelaMandate,
  newPlan: PeriodicUpgradePlanInput,
  tokenConfig: TokenConfigAccount,
): PreviewPlanChangeResult {
  assertTokenMatch(tokenConfig, newPlan.mint);

  const now = nowSeconds();
  const effectiveAt = resolveEffectiveAt(newPlan.effectiveAt);
  const scheduled =
    effectiveAt != null &&
    BigInt(Math.floor(effectiveAt.getTime() / 1000)) > now;
  const newAmount = toBigInt(newPlan.amount);
  const newAuthCeiling = newAmount;
  const remainingSeconds =
    mandate.nextPaymentDue > now ? mandate.nextPaymentDue - now : 0n;

  let outcome: ProrationOutcome;
  let prorationAmount = 0n;
  if (scheduled) {
    outcome = "ScheduledChange";
  } else if (
    mandate.plan?.equals(newPlan.address) &&
    newAmount === mandate.amount
  ) {
    outcome = "NoOp";
  } else {
    const periodStart = mandate.nextPaymentDue - mandate.frequency;
    const elapsed =
      now <= periodStart
        ? 0n
        : now >= mandate.nextPaymentDue
          ? mandate.frequency
          : now - periodStart;
    const preview = computeProration(
      mandate.amount,
      newAmount,
      elapsed,
      mandate.frequency,
    );
    outcome = preview.outcome;
    prorationAmount = preview.prorationAmount;
  }

  const tokenSymbol =
    tokenConfig.tokenSymbol ?? getTokenSymbol(tokenConfig.mint);
  return {
    outcome,
    prorationAmount,
    effectiveAt: effectiveAt ?? new Date(Number(now) * 1000),
    requiresSubscriberSig: newAmount > mandate.amount,
    newAuthCeiling,
    currentPeriodRemaining: remainingSeconds * 1000n,
    formatted: {
      amount: formatAmount(prorationAmount, tokenConfig),
      tokenSymbol,
    },
  };
}

function previewStreamRateChange(
  mandate: StreamMandate,
  newPlan: StreamRatePlanInput,
  tokenConfig: TokenConfigAccount,
): PreviewPlanChangeResult {
  assertTokenMatch(tokenConfig, newPlan.mint, mandate.mint);

  const newRate = toBigInt(newPlan.amount);
  const newAuthCeiling = toBigInt(newPlan.authorizedMaxRate ?? newPlan.amount);
  const settleWindow = BigInt(Math.max(mandate.minSettleInterval, 1));
  const prorationAmount = (newRate - mandate.ratePerSecond) * settleWindow;
  const tokenSymbol =
    tokenConfig.tokenSymbol ?? getTokenSymbol(tokenConfig.mint);

  return {
    outcome:
      prorationAmount > 0n
        ? "ChargeNow"
        : prorationAmount < 0n
          ? "CreditNow"
          : "NoOp",
    prorationAmount,
    effectiveAt: new Date(Number(nowSeconds()) * 1000),
    requiresSubscriberSig:
      newAuthCeiling > mandate.authorizedMaxRate ||
      newRate > mandate.authorizedMaxRate,
    newAuthCeiling,
    currentPeriodRemaining: 0n,
    formatted: {
      amount: formatAmount(prorationAmount, tokenConfig),
      tokenSymbol,
    },
  };
}

export class UpgradeBuilder {
  static previewPlanChange(
    mandate: VelaMandate | StreamMandate,
    newPlan: UpgradePlanInput,
    tokenConfig: TokenConfigAccount,
  ): PreviewPlanChangeResult {
    if (isStreamMandateAccount(mandate)) {
      return previewStreamRateChange(mandate, newPlan, tokenConfig);
    }
    return previewPeriodicPlanChange(
      mandate,
      newPlan as PeriodicUpgradePlanInput,
      tokenConfig,
    );
  }

  constructor(private readonly args: UpgradeBuilderArgs) {}

  async execute(): Promise<TransactionInstruction> {
    const preview = UpgradeBuilder.previewPlanChange(
      this.args.mandate,
      this.args.newPlan,
      this.args.tokenConfig,
    );

    if (
      preview.requiresSubscriberSig &&
      this.args.authority.toBase58() !== this.args.mandate.subscriber.toBase58()
    ) {
      throw new Error("Subscriber signature required for this change");
    }

    if (isStreamMandateAccount(this.args.mandate)) {
      const newPlan = this.args.newPlan as StreamRatePlanInput;
      const nextRate = toBigInt(newPlan.amount);
      const nextAuthorizedMaxRate = toBigInt(
        newPlan.authorizedMaxRate ?? newPlan.amount,
      );
      if (
        nextRate === this.args.mandate.ratePerSecond &&
        nextAuthorizedMaxRate === this.args.mandate.authorizedMaxRate
      ) {
        throw new Error("No stream rate change required");
      }
      return buildUpdateStreamRateInstruction({
        connection: this.args.connection,
        mandate: this.args.mandate.address,
        authority: this.args.authority,
        newRate:
          nextRate === this.args.mandate.ratePerSecond ? undefined : nextRate,
        newAuthorizedMaxRate:
          nextAuthorizedMaxRate === this.args.mandate.authorizedMaxRate
            ? undefined
            : nextAuthorizedMaxRate,
        programId: this.args.program.programId,
      });
    }

    const newPlan = this.args.newPlan as PeriodicUpgradePlanInput;
    if (
      this.args.mandate.plan?.equals(newPlan.address) &&
      preview.outcome === "NoOp"
    ) {
      throw new Error("No plan change required");
    }
    if (preview.outcome === "ScheduledChange") {
      return (
        await buildSchedulePlanChangeInstruction(
          this.args.program,
          this.args.connection,
          {
            mandate: this.args.mandate.address,
            authority: this.args.authority,
            newPlan: newPlan.address,
          },
        )
      ).instruction;
    }
    return (
      await buildUpdateMandatePlanInstruction(
        this.args.program,
        this.args.connection,
        {
          mandate: this.args.mandate.address,
          authority: this.args.authority,
          newPlan: newPlan.address,
        },
      )
    ).instruction;
  }
}
