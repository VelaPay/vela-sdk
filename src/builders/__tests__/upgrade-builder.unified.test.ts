import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import { UpgradeBuilder } from "../upgrade-builder";
import type { TokenConfigAccount, VelaMandate } from "../../types";
import type { StreamMandate } from "../../types/stream-mandate";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const mint = new PublicKey("11111111111111111111111111111114");

const tokenConfig: TokenConfigAccount = {
  mint,
  tokenProgram: mint,
  billingRail: "transferHook",
  decimals: 6,
  enabled: true,
  oracleReference: PublicKey.default,
};

function periodicMandate(): VelaMandate {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    address: new PublicKey("11111111111111111111111111111115"),
    subscriber,
    plan: new PublicKey("11111111111111111111111111111116"),
    merchant,
    mandateIndex: 7n,
    amount: 10_000_000n,
    frequency: 30n * 86_400n,
    startDate: now - 15n * 86_400n,
    expiry: 0n,
    maxPulls: 12n,
    pullsExecuted: 3n,
    nextPaymentDue: now + 15n * 86_400n,
    status: "active",
    bump: 255,
    billingType: "flat",
    version: 3,
  };
}

function streamMandate(): StreamMandate {
  return {
    address: new PublicKey("11111111111111111111111111111117"),
    version: 2,
    subscriber,
    merchant,
    mint,
    ratePerSecond: 5n,
    authorizedMaxRate: 10n,
    lastSettledTs: 1_700_000_000n,
    totalStreamed: 25n,
    maxStreamed: 100n,
    pausedAt: null,
    minSettleInterval: 60,
    status: "active",
    mandateIndex: 9n,
    bump: 254,
    pendingNewRatePerSecond: 0n,
    pendingNewAuthorizedMaxRate: 0n,
    pendingEffectiveAt: 0n,
    pendingChangeType: 0,
    pendingNonceShort: [],
  };
}

describe("UpgradeBuilder unified preview surface", () => {
  test("returns ChargeNow across periodic and streaming upward changes", () => {
    const periodic = UpgradeBuilder.previewPlanChange(
      periodicMandate(),
      {
        address: new PublicKey("11111111111111111111111111111118"),
        amount: 20_000_000n,
      },
      tokenConfig,
    );
    const streaming = UpgradeBuilder.previewPlanChange(
      streamMandate(),
      { amount: 10n },
      tokenConfig,
    );

    expect(periodic.outcome).toBe("ChargeNow");
    expect(periodic.prorationAmount > 0n).toBe(true);
    expect(streaming.outcome).toBe("ChargeNow");
    expect(streaming.prorationAmount > 0n).toBe(true);
  });
});
