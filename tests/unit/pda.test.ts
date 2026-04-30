import { describe, expect, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  deriveAgentMandateAddress,
  deriveConfigAddress,
  deriveCredentialMintAddress,
  deriveKeeperConfigAddress,
  deriveMandateAddress,
  deriveMerchantStateAddress,
  derivePlanAddress,
  PDAFactory,
} from "../../src/accounts";
import {
  APPROVAL_SEED,
  BILLING_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  MINT_AUTHORITY_SEED,
  PROGRAM_ID,
  SEED_PREFIXES,
  TOKEN_CONFIG_SEED,
} from "../../src/constants";

// Deterministic keypairs from fixed seeds for reproducible tests
const merchantSeed = new Uint8Array(32).fill(1);
const subscriberSeed = new Uint8Array(32).fill(2);
const agentSeed = new Uint8Array(32).fill(3);
const mintSeed = new Uint8Array(32).fill(4);
const hookProgramSeed = new Uint8Array(32).fill(5);
const merchant = Keypair.fromSeed(merchantSeed);
const subscriber = Keypair.fromSeed(subscriberSeed);
const agent = Keypair.fromSeed(agentSeed);
const mint = Keypair.fromSeed(mintSeed);
const hookProgram = Keypair.fromSeed(hookProgramSeed);

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
    const [address] = deriveMerchantStateAddress(
      merchant.publicKey,
      customProgram,
    );
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
      [
        Buffer.from("mandate"),
        subscriber.publicKey.toBuffer(),
        planAddress.toBuffer(),
      ],
      PROGRAM_ID,
    );
    const [address, bump] = deriveMandateAddress(
      subscriber.publicKey,
      planAddress,
    );
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
    const [address, bump] = deriveCredentialMintAddress(
      merchant.publicKey,
      100n,
    );
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("uses SEED_PREFIXES.CREDENTIAL prefix", () => {
    // Verify that SEED_PREFIXES.CREDENTIAL matches the literal "credential" string
    const [withPrefix] = PublicKey.findProgramAddressSync(
      [
        SEED_PREFIXES.CREDENTIAL,
        merchant.publicKey.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      PROGRAM_ID,
    );
    const [withLiteral] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        merchant.publicKey.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      PROGRAM_ID,
    );
    expect(withPrefix.equals(withLiteral)).toBe(true);
  });
});

describe("PDAFactory.mandate (V2)", () => {
  test("matches manual findProgramAddressSync with mandate, subscriber, merchant, and index", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [
        SEED_PREFIXES.MANDATE,
        subscriber.publicKey.toBuffer(),
        merchant.publicKey.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      PROGRAM_ID,
    );
    const [address, bump] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      0n,
    );
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("is deterministic for the same inputs", () => {
    const first = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      1n,
    );
    const second = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      1n,
    );
    expect(first).toEqual(second);
  });

  test("changes when mandateIndex changes", () => {
    const [first] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      1n,
    );
    const [second] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      2n,
    );
    expect(first.equals(second)).toBe(false);
  });

  test("accepts bigint and number mandateIndex values", () => {
    const [bigintAddress] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      3n,
    );
    const [numberAddress] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      3,
    );
    expect(bigintAddress.equals(numberAddress)).toBe(true);
  });

  test("supports custom programId overrides", () => {
    const customProgram = Keypair.generate().publicKey;
    const [defaultAddress] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      0n,
    );
    const [customAddress] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      0n,
      customProgram,
    );
    expect(defaultAddress.equals(customAddress)).toBe(false);
  });
});

describe("PDAFactory.mandateV1", () => {
  test("matches deprecated deriveMandateAddress output", () => {
    const [planAddress] = derivePlanAddress(merchant.publicKey, 0n);
    expect(PDAFactory.mandateV1(subscriber.publicKey, planAddress)).toEqual(
      deriveMandateAddress(subscriber.publicKey, planAddress),
    );
  });
});

describe("PDAFactory.mandate V2 vs V1", () => {
  test("produces different addresses for the same subscriber under different seed schemes", () => {
    const [planAddress] = derivePlanAddress(merchant.publicKey, 0n);
    const [v2Address] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      0n,
    );
    const [v1Address] = PDAFactory.mandateV1(subscriber.publicKey, planAddress);
    expect(v2Address.equals(v1Address)).toBe(false);
  });
});

describe("PDAFactory.credential (V2 per-merchant)", () => {
  test("matches manual findProgramAddressSync with merchant-credential and merchant", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.MERCHANT_CREDENTIAL, merchant.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    const [address, bump] = PDAFactory.credential(merchant.publicKey);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("changes for different merchants", () => {
    const [first] = PDAFactory.credential(merchant.publicKey);
    const [second] = PDAFactory.credential(subscriber.publicKey);
    expect(first.equals(second)).toBe(false);
  });

  test("supports custom programId overrides", () => {
    const customProgram = Keypair.generate().publicKey;
    const [defaultAddress] = PDAFactory.credential(merchant.publicKey);
    const [customAddress] = PDAFactory.credential(
      merchant.publicKey,
      customProgram,
    );
    expect(defaultAddress.equals(customAddress)).toBe(false);
  });
});

describe("PDAFactory.credentialV1", () => {
  test("matches deprecated deriveCredentialMintAddress output", () => {
    expect(PDAFactory.credentialV1(merchant.publicKey, 0n)).toEqual(
      deriveCredentialMintAddress(merchant.publicKey, 0n),
    );
  });
});

describe("PDAFactory.credential V2 vs V1", () => {
  test("produces different addresses for per-merchant and per-plan credentials", () => {
    const [v2Address] = PDAFactory.credential(merchant.publicKey);
    const [v1Address] = PDAFactory.credentialV1(merchant.publicKey, 0n);
    expect(v2Address.equals(v1Address)).toBe(false);
  });
});

describe("PDAFactory unchanged PDAs", () => {
  test("config matches deriveConfigAddress", () => {
    expect(PDAFactory.config()).toEqual(deriveConfigAddress());
  });

  test("keeperConfig matches deriveKeeperConfigAddress", () => {
    expect(PDAFactory.keeperConfig()).toEqual(deriveKeeperConfigAddress());
  });

  test("merchantState matches deriveMerchantStateAddress", () => {
    expect(PDAFactory.merchantState(merchant.publicKey)).toEqual(
      deriveMerchantStateAddress(merchant.publicKey),
    );
  });

  test("plan matches derivePlanAddress", () => {
    expect(PDAFactory.plan(merchant.publicKey, 7n)).toEqual(
      derivePlanAddress(merchant.publicKey, 7n),
    );
  });

  test("agentMandate matches deriveAgentMandateAddress", () => {
    expect(
      PDAFactory.agentMandate(merchant.publicKey, agent.publicKey),
    ).toEqual(deriveAgentMandateAddress(merchant.publicKey, agent.publicKey));
  });
});

describe("PDAFactory instruction-internal PDAs", () => {
  test("approval matches manual PDA derivation", () => {
    const [mandate] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      9n,
    );
    const [expected] = PublicKey.findProgramAddressSync(
      [APPROVAL_SEED, mandate.toBuffer()],
      PROGRAM_ID,
    );
    const [address] = PDAFactory.approval(mandate);
    expect(address.equals(expected)).toBe(true);
  });

  test("billing matches manual PDA derivation", () => {
    const [mandate] = PDAFactory.mandate(
      subscriber.publicKey,
      merchant.publicKey,
      10n,
    );
    const [expected] = PublicKey.findProgramAddressSync(
      [
        BILLING_SEED,
        mandate.toBuffer(),
        new BN(2).toArrayLike(Buffer, "le", 8),
      ],
      PROGRAM_ID,
    );
    const [address] = PDAFactory.billing(mandate, 2n);
    expect(address.equals(expected)).toBe(true);
  });

  test("extraAccountMetas matches manual PDA derivation", () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [EXTRA_ACCOUNT_METAS_SEED, mint.publicKey.toBuffer()],
      hookProgram.publicKey,
    );
    const [address] = PDAFactory.extraAccountMetas(
      mint.publicKey,
      hookProgram.publicKey,
    );
    expect(address.equals(expected)).toBe(true);
  });

  test("mintAuthority matches manual PDA derivation", () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [MINT_AUTHORITY_SEED],
      PROGRAM_ID,
    );
    const [address] = PDAFactory.mintAuthority();
    expect(address.equals(expected)).toBe(true);
  });
});

describe("PDAFactory.tokenConfig", () => {
  test("matches manual findProgramAddressSync with token_config and mint", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [TOKEN_CONFIG_SEED, mint.publicKey.toBuffer()],
      PROGRAM_ID,
    );
    const [address, bump] = PDAFactory.tokenConfig(mint.publicKey);
    expect(address.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  test("changes for different mints", () => {
    const [first] = PDAFactory.tokenConfig(mint.publicKey);
    const [second] = PDAFactory.tokenConfig(agent.publicKey);
    expect(first.equals(second)).toBe(false);
  });
});
