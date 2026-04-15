import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  StreamInsufficientBalanceError,
  StreamMinIntervalError,
  StreamTerminalStatusError,
  WrongAccountTypeError,
} from "../../src/index";

const mandate = new PublicKey("11111111111111111111111111111112");
const address = new PublicKey("11111111111111111111111111111113");

describe("stream error classes", () => {
  test("StreamInsufficientBalanceError preserves details and message", () => {
    const error = new StreamInsufficientBalanceError(mandate, 10n, 3n);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StreamInsufficientBalanceError);
    expect(error.mandate.toBase58()).toBe(mandate.toBase58());
    expect(error.required).toBe(10n);
    expect(error.available).toBe(3n);
    expect(error.message).toContain(mandate.toBase58());
    expect(error.message).toContain("need 10");
    expect(error.message).toContain("have 3");
  });

  test("StreamMinIntervalError preserves details and message", () => {
    const error = new StreamMinIntervalError(mandate, 30n, 60n);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StreamMinIntervalError);
    expect(error.elapsed).toBe(30n);
    expect(error.minInterval).toBe(60n);
    expect(error.message).toContain("30s < 60s");
  });

  test("StreamTerminalStatusError preserves details and message", () => {
    const error = new StreamTerminalStatusError(mandate, "cancelled");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StreamTerminalStatusError);
    expect(error.status).toBe("cancelled");
    expect(error.message).toContain("cancelled");
    expect(error.message).toContain(mandate.toBase58());
  });

  test("WrongAccountTypeError preserves details and message", () => {
    const error = new WrongAccountTypeError(
      address,
      "StreamMandate",
      "deadbeef00000000",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WrongAccountTypeError);
    expect(error.address.toBase58()).toBe(address.toBase58());
    expect(error.expected).toBe("StreamMandate");
    expect(error.gotDiscriminator).toBe("deadbeef00000000");
    expect(error.message).toContain("Expected StreamMandate");
    expect(error.message).toContain("deadbeef00000000");
  });
});
