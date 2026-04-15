import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  accruedNow,
  PDAFactory,
  PROGRAM_ID,
  StreamTerminalStatusError,
} from "../../src/index";
import type { StreamMandate } from "../../src/index";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const mint = new PublicKey("11111111111111111111111111111114");

function makeMandate(
  overrides: Partial<StreamMandate> = {},
): StreamMandate {
  return {
    address: new PublicKey("11111111111111111111111111111115"),
    version: 1,
    subscriber,
    merchant,
    mint,
    ratePerSecond: 5n,
    authorizedMaxRate: 10n,
    lastSettledTs: 100n,
    totalStreamed: 20n,
    maxStreamed: null,
    pausedAt: null,
    minSettleInterval: 60,
    status: "active",
    mandateIndex: 7n,
    bump: 255,
    ...overrides,
  };
}

describe("PDAFactory.stream", () => {
  test("derives the same PDA as the Rust stream seed scheme", () => {
    const [expected] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        subscriber.toBuffer(),
        merchant.toBuffer(),
        Buffer.from([7, 0, 0, 0, 0, 0, 0, 0]),
      ],
      PROGRAM_ID,
    );
    const [derived] = PDAFactory.stream(subscriber, merchant, 7n, PROGRAM_ID);

    expect(derived.toBase58()).toBe(expected.toBase58());
  });
});

describe("accruedNow", () => {
  test("returns elapsed * rate for active uncapped streams", () => {
    expect(accruedNow(makeMandate(), 112n)).toBe(60n);
  });

  test("returns elapsed * rate when capped but under the remaining cap", () => {
    expect(accruedNow(makeMandate({ maxStreamed: 100n }), 110n)).toBe(50n);
  });

  test("clamps to the remaining lifetime cap", () => {
    expect(accruedNow(makeMandate({ maxStreamed: 40n }), 110n)).toBe(20n);
  });

  test("returns 0 for paused streams", () => {
    expect(accruedNow(makeMandate({ status: "paused", pausedAt: 105n }), 110n)).toBe(
      0n,
    );
  });

  test("throws StreamTerminalStatusError for cancelled streams", () => {
    expect(() =>
      accruedNow(makeMandate({ status: "cancelled" }), 110n),
    ).toThrow(StreamTerminalStatusError);
  });

  test("returns 0 on clock regression", () => {
    expect(accruedNow(makeMandate(), 99n)).toBe(0n);
  });
});
