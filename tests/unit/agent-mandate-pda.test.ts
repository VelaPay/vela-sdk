import { describe, expect, test } from "bun:test";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  PROGRAM_ID,
  SEED_PREFIXES,
} from "../../src/index";

describe("agent mandate PDA helpers", () => {
  test("deriveAgentMandateAddress matches the phase 27 seed tuple", () => {
    const authority = new PublicKey("11111111111111111111111111111112");
    const agent = new PublicKey("11111111111111111111111111111113");

    const expected = PublicKey.findProgramAddressSync(
      [SEED_PREFIXES.AGENT_MANDATE, authority.toBuffer(), agent.toBuffer()],
      PROGRAM_ID,
    );

    expect(deriveAgentMandateAddress(authority, agent)).toEqual(expected);
  });

  test("deriveAgentMandateWrappedAta derives the mandate-owned Token-2022 ATA", () => {
    const authority = new PublicKey("11111111111111111111111111111112");
    const agent = new PublicKey("11111111111111111111111111111113");
    const wrappedUsdcMint = new PublicKey("11111111111111111111111111111114");
    const [mandateAddress] = deriveAgentMandateAddress(authority, agent);

    const expected = getAssociatedTokenAddressSync(
      wrappedUsdcMint,
      mandateAddress,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(
      deriveAgentMandateWrappedAta(mandateAddress, wrappedUsdcMint).toBase58(),
    ).toBe(expected.toBase58());
  });

  test("@vela/sdk root exports the agent mandate helpers", async () => {
    const root = await import("../../src/index");
    expect(root.deriveAgentMandateAddress).toBe(deriveAgentMandateAddress);
    expect(root.deriveAgentMandateWrappedAta).toBe(deriveAgentMandateWrappedAta);
  });
});
