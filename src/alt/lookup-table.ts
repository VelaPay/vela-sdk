import {
  type Connection,
  type PublicKey,
  type TransactionInstruction,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "../constants";

/**
 * Manages Address Lookup Table creation and caching for Versioned Transactions.
 *
 * ALTs reduce transaction size by replacing 32-byte addresses with 1-byte indices.
 * The ALT is created lazily on first use and cached for subsequent transactions.
 */
export class ALTManager {
  private altAddress: PublicKey | null = null;
  private altAccount: AddressLookupTableAccount | null = null;

  /**
   * Returns a cached ALT or creates one with common Vela program addresses.
   *
   * The ALT includes: PROGRAM_ID, SystemProgram, TOKEN_PROGRAM_ID,
   * TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSVAR_RENT_PUBKEY.
   *
   * NOTE: Creating an ALT requires sending a transaction. The caller must provide
   * a sign-and-send function since this class does not hold a wallet reference.
   */
  async getOrCreateALT(
    connection: Connection,
    payer: PublicKey,
    signAndSend: (tx: VersionedTransaction) => Promise<string>,
  ): Promise<AddressLookupTableAccount> {
    if (this.altAccount) {
      return this.altAccount;
    }

    const recentSlot = await connection.getSlot();

    // Create the lookup table
    const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
      authority: payer,
      payer,
      recentSlot,
    });

    // Extend with common addresses used across Vela instructions
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer,
      authority: payer,
      lookupTable: altAddress,
      addresses: [
        PROGRAM_ID,
        SystemProgram.programId,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        SYSVAR_RENT_PUBKEY,
      ],
    });

    // Build and send the create+extend transaction
    const blockhash = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash.blockhash,
      instructions: [createIx, extendIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    await signAndSend(tx);

    // Wait for the ALT to be available (needs 1 slot)
    // Fetch with retry
    let altAccountResult: AddressLookupTableAccount | null = null;
    for (let i = 0; i < 5; i++) {
      const result = await connection.getAddressLookupTable(altAddress);
      if (result.value) {
        altAccountResult = result.value;
        break;
      }
      // Wait a bit for the ALT to become available
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!altAccountResult) {
      throw new Error("Failed to fetch Address Lookup Table after creation");
    }

    this.altAddress = altAddress;
    this.altAccount = altAccountResult;
    return this.altAccount;
  }

  /**
   * Builds a VersionedTransaction (V0) with the given instructions and lookup tables.
   */
  buildV0Transaction(
    payerKey: PublicKey,
    instructions: TransactionInstruction[],
    blockhash: string,
    lookupTables: AddressLookupTableAccount[],
  ): VersionedTransaction {
    const message = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(lookupTables);

    return new VersionedTransaction(message);
  }
}
