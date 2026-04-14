import { describe, expect, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  deserializeMandate,
  deserializeMerchantState,
  deserializeProtocolConfig,
  deserializeTokenConfig,
} from "../../src/accounts/deserialize";

/**
 * SDK-04 coverage: V2 account types and the deserializer normalization layer.
 *
 * deserializeMandate and deserializeMerchantState auto-detect V1 (no `version`
 * field or version === 0) vs V2 (version >= 1) and normalize both shapes into a
 * unified SDK interface. deserializeProtocolConfig and deserializeTokenConfig
 * are newly added for the dynamic hook-program resolution plumbing.
 *
 * These tests use plain-object "raw" inputs that mirror how Anchor surfaces
 * account fields to the client (PublicKey instances for addresses, BN-ish
 * objects for u64/i64 fields, enum variants as `{ active: {} }` objects).
 */

const addr = () => Keypair.generate().publicKey;

// -- deserializeMandate ------------------------------------------------------

describe("deserializeMandate", () => {
  const baseRawV1 = () => ({
    subscriber: addr(),
    plan: addr(),
    merchant: addr(),
    amount: new BN(1_000_000),
    frequency: new BN(86_400),
    startDate: new BN(1_700_000_000),
    expiry: new BN(1_800_000_000),
    maxPulls: new BN(12),
    pullsExecuted: new BN(0),
    nextPaymentDue: new BN(1_700_000_086),
    status: { active: {} },
    bump: 254,
    billingType: { flat: {} },
    // no version, no mandateIndex, no _reserved
  });

  test("V1 raw (no version) normalizes to version=0 with plan preserved and undefined mandateIndex/_reserved", () => {
    const address = addr();
    const raw = baseRawV1();
    const result = deserializeMandate(address, raw);

    expect(result.address.equals(address)).toBe(true);
    expect(result.version).toBe(0);
    expect(result.plan?.equals(raw.plan)).toBe(true);
    expect(result.mandateIndex).toBeUndefined();
    expect(result._reserved).toBeUndefined();
    expect(result.amount).toBe(1_000_000n);
    expect(result.maxPulls).toBe(12n);
    expect(result.status).toBe("active");
    expect(result.billingType).toBe("flat");
    expect(result.bump).toBe(254);
  });

  test("V2 raw (version=1) populates mandateIndex and keeps merchant; plan may be null", () => {
    const address = addr();
    const raw = {
      ...baseRawV1(),
      plan: null,
      version: 1,
      mandateIndex: new BN(7),
      _reserved: [0, 0, 0, 0],
    };
    const result = deserializeMandate(address, raw);

    expect(result.version).toBe(1);
    expect(result.mandateIndex).toBe(7n);
    expect(result.plan).toBeUndefined();
    expect(result.merchant.equals(raw.merchant)).toBe(true);
    expect(result._reserved).toEqual([0, 0, 0, 0]);
  });

  test("V2 mandateIndex defaults to 0n when field is missing on the raw account", () => {
    const raw = {
      ...baseRawV1(),
      version: 1,
      // mandateIndex intentionally omitted
    };
    const result = deserializeMandate(addr(), raw);
    expect(result.mandateIndex).toBe(0n);
  });
});

// -- deserializeMerchantState ------------------------------------------------

describe("deserializeMerchantState", () => {
  test("V1 raw (no version) normalizes to mandateCounter=0n and undefined credentialMint/version", () => {
    const address = addr();
    const merchant = addr();
    const raw = {
      merchant,
      planCount: new BN(3),
      bump: 250,
      // no version, no mandateCounter, no credentialMint
    };
    const result = deserializeMerchantState(address, raw);

    expect(result.address.equals(address)).toBe(true);
    expect(result.merchant.equals(merchant)).toBe(true);
    expect(result.planCount).toBe(3n);
    expect(result.mandateCounter).toBe(0n);
    expect(result.credentialMint).toBeUndefined();
    expect(result.version).toBeUndefined();
  });

  test("V2 raw (version=1) exposes mandateCounter and credentialMint", () => {
    const credentialMint = addr();
    const raw = {
      merchant: addr(),
      planCount: new BN(5),
      bump: 251,
      version: 1,
      mandateCounter: new BN(17),
      credentialMint,
      _reserved: [0, 0],
    };
    const result = deserializeMerchantState(addr(), raw);

    expect(result.version).toBe(1);
    expect(result.mandateCounter).toBe(17n);
    expect(result.credentialMint?.equals(credentialMint)).toBe(true);
    expect(result._reserved).toEqual([0, 0]);
  });
});

// -- deserializeProtocolConfig ----------------------------------------------

describe("deserializeProtocolConfig", () => {
  test("round-trips core fields (admin, mints, vault, hook, paused, version)", () => {
    const admin = addr();
    const wrappedUsdcMint = addr();
    const wrappingVault = addr();
    const transferHookProgramId = addr();
    const raw = {
      admin,
      wrappedUsdcMint,
      wrappingVault,
      transferHookProgramId,
      paused: false,
      version: 1,
    };
    const result = deserializeProtocolConfig(raw);

    expect(result.admin.equals(admin)).toBe(true);
    expect(result.wrappedUsdcMint.equals(wrappedUsdcMint)).toBe(true);
    expect(result.wrappingVault.equals(wrappingVault)).toBe(true);
    expect(result.transferHookProgramId.equals(transferHookProgramId)).toBe(true);
    expect(result.paused).toBe(false);
    expect(result.version).toBe(1);
  });

  test("version defaults to 0 when raw omits it", () => {
    const raw = {
      admin: addr(),
      wrappedUsdcMint: addr(),
      wrappingVault: addr(),
      transferHookProgramId: addr(),
      paused: true,
    };
    const result = deserializeProtocolConfig(raw);
    expect(result.version).toBe(0);
    expect(result.paused).toBe(true);
  });
});

// -- deserializeTokenConfig --------------------------------------------------

describe("deserializeTokenConfig", () => {
  test("maps billingRail=transferHook variant and decodes primitives", () => {
    const mint = addr();
    const tokenProgram = addr();
    const oracleReference = addr();
    const raw = {
      mint,
      tokenProgram,
      billingRail: { transferHook: {} },
      decimals: 6,
      enabled: true,
      oracleReference,
    };
    const result = deserializeTokenConfig(raw);

    expect(result.mint.equals(mint)).toBe(true);
    expect(result.tokenProgram.equals(tokenProgram)).toBe(true);
    expect(result.billingRail).toBe("transferHook");
    expect(result.decimals).toBe(6);
    expect(result.enabled).toBe(true);
    expect(result.oracleReference.equals(oracleReference)).toBe(true);
  });

  test("maps billingRail=tokenDelegate variant", () => {
    const raw = {
      mint: addr(),
      tokenProgram: addr(),
      billingRail: { tokenDelegate: {} },
      decimals: 9,
      enabled: false,
      oracleReference: PublicKey.default,
    };
    const result = deserializeTokenConfig(raw);
    expect(result.billingRail).toBe("tokenDelegate");
    expect(result.decimals).toBe(9);
    expect(result.enabled).toBe(false);
  });
});
