import { describe, expect, test } from "bun:test";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import idl from "../../../idl/vela_protocol.json";
import { PDAFactory } from "../../../src/accounts/pda";
import { TOKEN_2022_PROGRAM_ID } from "../../../src/constants";
import { buildInitMerchantCredentialInstruction } from "../../../src/instructions/init-merchant-credential";

function createReadOnlyProgram(): Program {
  const provider = new AnchorProvider(
    new Connection("http://127.0.0.1:8899"),
    {
      publicKey: PublicKey.default,
      signTransaction: async (tx: unknown) => tx,
      signAllTransactions: async (txs: unknown[]) => txs,
    } as any,
    { commitment: "confirmed" },
  );

  return new Program(idl as any, provider);
}

function instructionDef(name: string) {
  const definition = (idl as any).instructions.find(
    (entry: { name: string }) => entry.name === name,
  );
  if (!definition) {
    throw new Error(`Missing instruction ${name} in IDL`);
  }
  return definition;
}

describe("buildInitMerchantCredentialInstruction", () => {
  test("derives merchant PDAs and preserves IDL account order", async () => {
    const program = createReadOnlyProgram();
    const merchant = Keypair.generate().publicKey;

    const { instruction, merchantStateAddress, credentialMintAddress } =
      await buildInitMerchantCredentialInstruction(program, { merchant });

    const [expectedMerchantStateAddress] = PDAFactory.merchantState(
      merchant,
      program.programId,
    );
    const [expectedCredentialMintAddress] = PDAFactory.credential(
      merchant,
      program.programId,
    );

    expect(merchantStateAddress.equals(expectedMerchantStateAddress)).toBe(
      true,
    );
    expect(credentialMintAddress.equals(expectedCredentialMintAddress)).toBe(
      true,
    );

    expect(instruction.keys).toHaveLength(6);
    expect(instruction.keys[0]?.pubkey.equals(merchant)).toBe(true);
    expect(instruction.keys[0]?.isSigner).toBe(true);
    expect(instruction.keys[0]?.isWritable).toBe(true);
    expect(instruction.keys[1]?.pubkey.equals(merchantStateAddress)).toBe(true);
    expect(instruction.keys[2]?.pubkey.equals(credentialMintAddress)).toBe(
      true,
    );
    expect(instruction.keys[3]?.pubkey.equals(SystemProgram.programId)).toBe(
      true,
    );
    expect(instruction.keys[4]?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(
      true,
    );
    expect(instruction.keys[5]?.pubkey.equals(SYSVAR_RENT_PUBKEY)).toBe(true);
  });

  test("uses the IDL discriminator for init_merchant_credential", async () => {
    const program = createReadOnlyProgram();
    const merchant = Keypair.generate().publicKey;
    const { instruction } = await buildInitMerchantCredentialInstruction(
      program,
      {
        merchant,
      },
    );

    const definition = instructionDef("init_merchant_credential");
    expect(Array.from(instruction.data.subarray(0, 8))).toEqual(
      definition.discriminator,
    );
  });
});
