import { describe, test, expect } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  derivePlanAddress,
  deriveMandateAddress,
  deriveMerchantStateAddress,
  deriveCredentialMintAddress,
} from "../../src/accounts";
import { PROGRAM_ID, SEED_PREFIXES } from "../../src/constants";

// Deterministic keypairs from fixed seeds for reproducible tests
const merchantSeed = new Uint8Array(32).fill(1);
const subscriberSeed = new Uint8Array(32).fill(2);
const merchant = Keypair.fromSeed(merchantSeed);
const subscriber = Keypair.fromSeed(subscriberSeed);

describe("deriveMerchantStateAddress", () => {
  test("matches manual PDA derivation", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), merchant.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    const [address, bump] = deriveMerchantStateAddress(merchant.publicKey);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("accepts custom programId", () => {
    const customProgram = Keypair.generate().publicKey;
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), merchant.publicKey.toBuffer()],
      customProgram,
    );
    const [address] = deriveMerchantStateAddress(merchant.publicKey, customProgram);
    expect(address.equals(expected)).toBe(true);
  });
});

describe("derivePlanAddress", () => {
  test("matches manual PDA derivation for planId 0", () => {
    const planIdBuffer = new BN(0).toArrayLike(Buffer, "le", 8);
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );
    const [address, bump] = derivePlanAddress(merchant.publicKey, 0n);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("matches manual PDA derivation for planId 42", () => {
    const planIdBuffer = new BN(42).toArrayLike(Buffer, "le", 8);
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );
    const [address, bump] = derivePlanAddress(merchant.publicKey, 42n);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("accepts number type for planId", () => {
    const planIdBuffer = new BN(5).toArrayLike(Buffer, "le", 8);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );
    const [address] = derivePlanAddress(merchant.publicKey, 5);
    expect(address.equals(expected)).toBe(true);
  });
});

describe("deriveMandateAddress", () => {
  test("matches manual PDA derivation", () => {
    // First derive a plan address to use as input
    const planIdBuffer = new BN(0).toArrayLike(Buffer, "le", 8);
    const [planAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );

    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mandate"), subscriber.publicKey.toBuffer(), planAddress.toBuffer()],
      PROGRAM_ID,
    );
    const [address, bump] = deriveMandateAddress(subscriber.publicKey, planAddress);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("produces different addresses for different subscribers", () => {
    const planIdBuffer = new BN(0).toArrayLike(Buffer, "le", 8);
    const [planAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );

    const [addr1] = deriveMandateAddress(subscriber.publicKey, planAddress);
    const [addr2] = deriveMandateAddress(merchant.publicKey, planAddress);
    expect(addr1.equals(addr2)).toBe(false);
  });
});

describe("deriveCredentialMintAddress", () => {
  test("matches manual PDA derivation for planId 0", () => {
    const planIdBuffer = new BN(0).toArrayLike(Buffer, "le", 8);
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("credential"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );
    const [address, bump] = deriveCredentialMintAddress(merchant.publicKey, 0n);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("matches manual PDA derivation for planId 100", () => {
    const planIdBuffer = new BN(100).toArrayLike(Buffer, "le", 8);
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("credential"), merchant.publicKey.toBuffer(), planIdBuffer],
      PROGRAM_ID,
    );
    const [address, bump] = deriveCredentialMintAddress(merchant.publicKey, 100n);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("uses SEED_PREFIXES.CREDENTIAL prefix", () => {
    // Verify that SEED_PREFIXES.CREDENTIAL matches the literal "credential" string
    const [withPrefix] = PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.CREDENTIAL, merchant.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID,
    );
    const [withLiteral] = PublicKey.findProgramAddressSync(
      [Buffer.from("credential"), merchant.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID,
    );
    expect(withPrefix.equals(withLiteral)).toBe(true);
  });
});
