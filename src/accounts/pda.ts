import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG_SEED, KEEPER_CONFIG_SEED, PROGRAM_ID, SEED_PREFIXES } from "../constants";

/**
 * Derives the MerchantState PDA address.
 * Seeds: ["merchant", merchant.pubkey]
 */
export function deriveMerchantStateAddress(
  merchant: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIXES.MERCHANT, merchant.toBuffer()],
    programId,
  );
}

/**
 * Derives the VelaPlan PDA address.
 * Seeds: ["plan", merchant.pubkey, plan_id.to_le_bytes()]
 */
export function derivePlanAddress(
  merchant: PublicKey,
  planId: bigint | number,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const planIdBuffer = new BN(planId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIXES.PLAN, merchant.toBuffer(), planIdBuffer],
    programId,
  );
}

/**
 * Derives the VelaMandate PDA address.
 * Seeds: ["mandate", subscriber.pubkey, plan.pubkey]
 */
export function deriveMandateAddress(
  subscriber: PublicKey,
  plan: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIXES.MANDATE, subscriber.toBuffer(), plan.toBuffer()],
    programId,
  );
}

/**
 * Derives the CredentialMint PDA address.
 * Seeds: ["credential", merchant.pubkey, plan_id.to_le_bytes()]
 */
export function deriveCredentialMintAddress(
  merchant: PublicKey,
  planId: bigint | number,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const planIdBuffer = new BN(planId.toString()).toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [SEED_PREFIXES.CREDENTIAL, merchant.toBuffer(), planIdBuffer],
    programId,
  );
}

/**
 * Derives the KeeperConfig PDA address.
 * Seeds: ["keeper-config"]
 * Singleton PDA -- one per program deployment
 */
export function deriveKeeperConfigAddress(
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [KEEPER_CONFIG_SEED],
    programId,
  );
}

/**
 * Derives the ProtocolConfig PDA address.
 * Seeds: ["config"]
 * Singleton PDA -- one per program deployment
 */
export function deriveConfigAddress(
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    programId,
  );
}
