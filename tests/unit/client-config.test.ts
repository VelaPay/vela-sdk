import { describe, expect, test } from "bun:test";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { createVelaClient } from "../../src/client";
import { VELA_PROGRAM_IDS } from "../../src/generated/program-ids";

const wallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends { serialize(): Buffer }>(tx: T) => tx,
};

describe("createVelaClient config", () => {
  test("resolves program ID from explicit cluster", () => {
    const client = createVelaClient({
      connection: new Connection("http://127.0.0.1:8899"),
      wallet,
      cluster: "localnet",
    });

    expect(client.program.programId.toBase58()).toBe(
      VELA_PROGRAM_IDS.localnet.velaProtocol,
    );
  });

  test("explicit programId overrides cluster defaults", () => {
    const programId = Keypair.generate().publicKey;
    const client = createVelaClient({
      connection: new Connection("http://127.0.0.1:8899"),
      wallet,
      cluster: "localnet",
      programId,
    });

    expect(client.program.programId.toBase58()).toBe(programId.toBase58());
    expect(client.program.provider).toBeInstanceOf(AnchorProvider);
  });
});
