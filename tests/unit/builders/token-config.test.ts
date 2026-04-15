import { describe, expect, test } from "bun:test";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../idl/vela_protocol.json";
import { PDAFactory } from "../../../src/accounts/pda";
import {
  buildInitTokenConfigInstruction,
  buildUpdateTokenConfigInstruction,
} from "../../../src/instructions";

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

describe("token config builders", () => {
  test("buildInitTokenConfigInstruction serializes hook billing rail and IDL account order", async () => {
    const program = createReadOnlyProgram();
    const admin = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const { instruction, tokenConfigAddress, protocolConfigAddress } =
      await buildInitTokenConfigInstruction(program, {
        admin,
        mint,
        billingRail: "hook",
        decimals: 6,
      });

    const [expectedTokenConfigAddress] = PDAFactory.tokenConfig(
      mint,
      program.programId,
    );
    const [expectedProtocolConfigAddress] = PDAFactory.config(
      program.programId,
    );

    expect(tokenConfigAddress.equals(expectedTokenConfigAddress)).toBe(true);
    expect(protocolConfigAddress.equals(expectedProtocolConfigAddress)).toBe(
      true,
    );
    expect(instruction.keys).toHaveLength(5);
    expect(instruction.keys[0]?.pubkey.equals(admin)).toBe(true);
    expect(instruction.keys[0]?.isSigner).toBe(true);
    expect(instruction.keys[1]?.pubkey.equals(protocolConfigAddress)).toBe(
      true,
    );
    expect(instruction.keys[2]?.pubkey.equals(mint)).toBe(true);
    expect(instruction.keys[3]?.pubkey.equals(tokenConfigAddress)).toBe(true);
    expect(instruction.keys[4]?.pubkey.equals(SystemProgram.programId)).toBe(
      true,
    );

    expect(Array.from(instruction.data.subarray(0, 8))).toEqual(
      instructionDef("init_token_config").discriminator,
    );
    expect(Array.from(instruction.data.subarray(8))).toEqual([0, 6]);
  });

  test("buildInitTokenConfigInstruction serializes delegate billing rail differently", async () => {
    const program = createReadOnlyProgram();
    const admin = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const hook = await buildInitTokenConfigInstruction(program, {
      admin,
      mint,
      billingRail: "hook",
      decimals: 6,
    });
    const delegate = await buildInitTokenConfigInstruction(program, {
      admin,
      mint,
      billingRail: "delegate",
      decimals: 6,
    });

    expect(Array.from(delegate.instruction.data.subarray(8))).toEqual([1, 6]);
    expect(delegate.instruction.data.equals(hook.instruction.data)).toBe(false);
  });

  test("buildUpdateTokenConfigInstruction serializes Some/None options", async () => {
    const program = createReadOnlyProgram();
    const admin = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const oracleReference = Keypair.generate().publicKey;

    const someEnabled = await buildUpdateTokenConfigInstruction(program, {
      admin,
      mint,
      enabled: true,
      oracleReference: null,
    });
    const noneUpdate = await buildUpdateTokenConfigInstruction(program, {
      admin,
      mint,
      enabled: null,
      oracleReference: null,
    });
    const someOracle = await buildUpdateTokenConfigInstruction(program, {
      admin,
      mint,
      enabled: null,
      oracleReference,
    });

    const [expectedProtocolConfigAddress] = PDAFactory.config(
      program.programId,
    );
    const [expectedTokenConfigAddress] = PDAFactory.tokenConfig(
      mint,
      program.programId,
    );

    expect(
      someEnabled.tokenConfigAddress.equals(expectedTokenConfigAddress),
    ).toBe(true);
    expect(someEnabled.instruction.keys).toHaveLength(3);
    expect(someEnabled.instruction.keys[0]?.pubkey.equals(admin)).toBe(true);
    expect(
      someEnabled.instruction.keys[1]?.pubkey.equals(
        expectedProtocolConfigAddress,
      ),
    ).toBe(true);
    expect(
      someEnabled.instruction.keys[2]?.pubkey.equals(
        expectedTokenConfigAddress,
      ),
    ).toBe(true);

    expect(Array.from(someEnabled.instruction.data.subarray(0, 8))).toEqual(
      instructionDef("update_token_config").discriminator,
    );
    expect(Array.from(someEnabled.instruction.data.subarray(8, 11))).toEqual([
      1, 1, 0,
    ]);
    expect(Array.from(noneUpdate.instruction.data.subarray(8, 10))).toEqual([
      0, 0,
    ]);
    expect(
      someEnabled.instruction.data.equals(noneUpdate.instruction.data),
    ).toBe(false);
    expect(
      someOracle.instruction.data.equals(noneUpdate.instruction.data),
    ).toBe(false);
  });
});
