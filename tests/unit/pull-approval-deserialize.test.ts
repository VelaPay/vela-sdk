import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  deserializePullApprovalAccount,
  isPullApprovalCurrent,
  PULL_APPROVAL_DISCRIMINATOR,
} from "../../src";
import { accountDiscriminator } from "../../src/browser/bytes";

function writeI64LE(data: Uint8Array, offset: number, value: bigint) {
  new DataView(data.buffer, data.byteOffset + offset, 8).setBigInt64(
    0,
    value,
    true,
  );
}

function writeU64LE(data: Uint8Array, offset: number, value: bigint) {
  new DataView(data.buffer, data.byteOffset + offset, 8).setBigUint64(
    0,
    value,
    true,
  );
}

describe("PullApproval decoder", () => {
  test("decodes the hardened period-bound layout", () => {
    const address = PublicKey.unique();
    const mandate = PublicKey.unique();
    const data = new Uint8Array(82);

    data.set(accountDiscriminator("PullApproval"), 0);
    data.set(mandate.toBytes(), 8);
    writeI64LE(data, 40, 1_700_000_000n);
    writeI64LE(data, 48, 1_700_003_600n);
    writeI64LE(data, 56, 1_700_003_900n);
    data[64] = 1;
    writeU64LE(data, 65, 42_000_000n);
    writeI64LE(data, 73, 1_700_003_610n);
    data[81] = 253;

    const approval = deserializePullApprovalAccount(address, data);
    expect(approval.address.equals(address)).toBe(true);
    expect(approval.mandate.equals(mandate)).toBe(true);
    expect(approval.periodStart).toBe(1_700_000_000n);
    expect(approval.periodEnd).toBe(1_700_003_600n);
    expect(approval.validUntil).toBe(1_700_003_900n);
    expect(approval.approved).toBe(true);
    expect(approval.approvedAmount).toBe(42_000_000n);
    expect(approval.createdAt).toBe(1_700_003_610n);
    expect(approval.bump).toBe(253);
    expect(PULL_APPROVAL_DISCRIMINATOR).toEqual(
      accountDiscriminator("PullApproval"),
    );
  });

  test("validates current period, expiry, and minimum amount", () => {
    const mandate = PublicKey.unique();
    const approval = {
      address: PublicKey.unique(),
      mandate,
      periodStart: 10n,
      periodEnd: 20n,
      validUntil: 30n,
      approved: true,
      approvedAmount: 100n,
      createdAt: 21n,
      bump: 1,
    };

    expect(
      isPullApprovalCurrent(approval, {
        expectedMandate: mandate,
        expectedPeriodStart: 10n,
        expectedPeriodEnd: 20n,
        now: 25n,
        minAmount: 100n,
      }),
    ).toBe(true);
    expect(
      isPullApprovalCurrent(approval, {
        expectedMandate: mandate,
        expectedPeriodStart: 9n,
        expectedPeriodEnd: 20n,
        now: 25n,
      }),
    ).toBe(false);
    expect(
      isPullApprovalCurrent(approval, {
        expectedMandate: mandate,
        expectedPeriodStart: 10n,
        expectedPeriodEnd: 20n,
        now: 31n,
      }),
    ).toBe(false);
    expect(
      isPullApprovalCurrent(approval, {
        expectedMandate: mandate,
        expectedPeriodStart: 10n,
        expectedPeriodEnd: 20n,
        now: 25n,
        minAmount: 101n,
      }),
    ).toBe(false);
  });
});
