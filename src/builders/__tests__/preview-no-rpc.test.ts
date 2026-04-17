import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import { UpgradeBuilder } from "../upgrade-builder";
import type { TokenConfigAccount, VelaMandate } from "../../types";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const plan = new PublicKey("11111111111111111111111111111114");
const nextPlan = new PublicKey("11111111111111111111111111111115");
const mint = new PublicKey("11111111111111111111111111111116");

function mandateFixture(): VelaMandate {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    address: new PublicKey("11111111111111111111111111111117"),
    subscriber,
    plan,
    merchant,
    mandateIndex: 1n,
    amount: 10_000_000n,
    frequency: 30n * 86_400n,
    startDate: now - 15n * 86_400n,
    expiry: 0n,
    maxPulls: 12n,
    pullsExecuted: 0n,
    nextPaymentDue: now + 15n * 86_400n,
    status: "active",
    bump: 255,
    billingType: "flat",
    version: 3,
  };
}

describe("UpgradeBuilder.previewPlanChange", () => {
  test("is zero-RPC", () => {
    const connection = {
      calls: 0,
      getAccountInfo() {
        this.calls += 1;
        return null;
      },
    };
    const tokenConfig: TokenConfigAccount = {
      mint,
      tokenProgram: mint,
      billingRail: "transferHook",
      decimals: 6,
      enabled: true,
      oracleReference: PublicKey.default,
    };

    const result = UpgradeBuilder.previewPlanChange(
      mandateFixture(),
      {
        address: nextPlan,
        amount: 20_000_000n,
      },
      tokenConfig,
    );

    expect(result.outcome).toBe("ChargeNow");
    expect(connection.calls).toBe(0);
  });
});
