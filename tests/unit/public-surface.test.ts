import { describe, expect, test } from "bun:test";
import { Keypair, TransactionInstruction } from "@solana/web3.js";
import * as accounts from "../../src/accounts";
import * as errors from "../../src/errors";
import * as inspection from "../../src/inspection";
import * as instructions from "../../src/instructions";
import * as protocol from "../../src/protocol";
import * as security from "../../src/security";
import * as token from "../../src/token";

describe("public package subpaths", () => {
  test("publish focused public surfaces", () => {
    expect(typeof accounts.PDAFactory).toBe("function");
    expect(typeof errors.VelaError).toBe("function");
    expect(typeof inspection.explainInstructions).toBe("function");
    expect(typeof instructions.buildCreatePlanInstruction).toBe("function");
    expect(typeof protocol.getProtocolCompatibility).toBe("function");
    expect(typeof security.getSecurityPosture).toBe("function");
    expect(typeof token.parseAmount).toBe("function");
  });

  test("protocol compatibility manifest matches generated IDs", () => {
    const compatibility = protocol.getProtocolCompatibility();
    expect(compatibility.protocol.idlSha256).toHaveLength(64);
    expect(compatibility.transferHook.idlSha256).toHaveLength(64);
    expect(compatibility.generatedFrom.protocolCommit).toHaveLength(40);
    expect(protocol.resolveVelaProgramIds("devnet")).toEqual(
      compatibility.programIds.devnet,
    );
    expect(() =>
      protocol.assertVelaProtocolCompatibility({
        protocolIdlSha256: compatibility.protocol.idlSha256,
        transferHookIdlSha256: compatibility.transferHook.idlSha256,
        protocolProgramId: compatibility.programIds.devnet.velaProtocol,
        transferHookProgramId: compatibility.programIds.devnet.velaTransferHook,
        cluster: "devnet",
      }),
    ).not.toThrow();
  });

  test("inspection explains signer and writable accounts without RPC", () => {
    const signer = Keypair.generate().publicKey;
    const writable = Keypair.generate().publicKey;
    const readonly = Keypair.generate().publicKey;
    const instruction = new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: [
        { pubkey: signer, isSigner: true, isWritable: true },
        { pubkey: writable, isSigner: false, isWritable: true },
        { pubkey: readonly, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, 2, 3]),
    });

    const plan = inspection.explainInstructions([instruction]);
    expect(plan.instructionCount).toBe(1);
    expect(plan.signers).toEqual([signer.toBase58()]);
    expect(plan.writableAccounts).toContain(writable.toBase58());
    expect(plan.readonlyAccounts).toContain(readonly.toBase58());
    expect(plan.instructions[0]?.dataLength).toBe(3);
  });

  test("security posture makes upstream audit residuals explicit", () => {
    expect(security.getAllowedAuditResiduals()).toEqual([
      "bigint-buffer",
      "uuid",
    ]);
  });
});
