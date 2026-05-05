import { describe, expect, test } from "bun:test";
import * as sdk from "../../src/index";

describe("Phase 7 SDK exports", () => {
  test("root index re-exports wrap helpers", () => {
    expect(typeof sdk.buildWrapInstruction).toBe("function");
    expect(typeof sdk.buildUnwrapInstruction).toBe("function");
    expect(typeof sdk.buildWrapAndSubscribeInstructions).toBe("function");
  });

  test("root index re-exports VelaUSD devnet constants", () => {
    expect(sdk.VELAUSD_DECIMALS).toBe(6);
    expect(sdk.VELAUSD_DEVNET_MINT.toBase58()).toBe(
      "Fx217d3isRNyu8VtW7WQvuHwwRWeXbwdXhpAmhT9Xdgx",
    );
  });
});
