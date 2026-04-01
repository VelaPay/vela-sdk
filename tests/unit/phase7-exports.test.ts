import { describe, expect, test } from "bun:test";
import * as sdk from "../../src/index";

describe("Phase 7 SDK exports", () => {
  test("root index re-exports wrap helpers", () => {
    expect(typeof sdk.buildWrapInstruction).toBe("function");
    expect(typeof sdk.buildUnwrapInstruction).toBe("function");
    expect(typeof sdk.buildWrapAndSubscribeInstructions).toBe("function");
  });
});
