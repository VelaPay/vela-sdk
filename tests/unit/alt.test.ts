import { test, expect, describe } from "bun:test";
import { ALTManager } from "../../src/alt/lookup-table";
import {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";

describe("ALTManager", () => {
  test("buildV0Transaction creates a VersionedTransaction with lookup tables", () => {
    const manager = new ALTManager();

    // Mock an AddressLookupTableAccount
    const mockAlt: AddressLookupTableAccount = {
      key: PublicKey.unique(),
      state: {
        addresses: [SystemProgram.programId],
        authority: PublicKey.unique(),
        deactivationSlot: BigInt("18446744073709551615"),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
      },
    } as AddressLookupTableAccount;

    // Build a V0 transaction with a simple instruction
    const payer = PublicKey.unique();
    const instruction = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: PublicKey.unique(),
      lamports: 1000,
    });

    const tx = manager.buildV0Transaction(
      payer,
      [instruction],
      "11111111111111111111111111111111", // mock blockhash
      [mockAlt],
    );

    expect(tx).toBeInstanceOf(VersionedTransaction);
    // V0 messages have a getVersion() that returns 0 on MessageV0
    // The message object itself identifies as version 0
    expect((tx.message as any).version).toBe(0);
  });

  test("buildV0Transaction works without lookup tables", () => {
    const manager = new ALTManager();
    const payer = PublicKey.unique();

    const instruction = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: PublicKey.unique(),
      lamports: 500,
    });

    const tx = manager.buildV0Transaction(
      payer,
      [instruction],
      "22222222222222222222222222222222",
      [], // no lookup tables
    );

    expect(tx).toBeInstanceOf(VersionedTransaction);
  });

  test("buildV0Transaction includes all provided instructions", () => {
    const manager = new ALTManager();
    const payer = PublicKey.unique();

    const ix1 = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: PublicKey.unique(),
      lamports: 1000,
    });
    const ix2 = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: PublicKey.unique(),
      lamports: 2000,
    });

    const tx = manager.buildV0Transaction(
      payer,
      [ix1, ix2],
      "33333333333333333333333333333333",
      [],
    );

    expect(tx).toBeInstanceOf(VersionedTransaction);
    // The compiled message should have 2 instructions
    expect(tx.message.compiledInstructions.length).toBe(2);
  });

  test("getOrCreateALT is not initially cached", () => {
    const manager = new ALTManager();
    // Access private field via type assertion to verify initial state
    expect((manager as any).altAddress).toBeNull();
    expect((manager as any).altAccount).toBeNull();
  });
});
