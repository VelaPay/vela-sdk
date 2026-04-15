import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(path: string) {
  return JSON.parse(readFileSync(join(import.meta.dir, path), "utf8")) as {
    instructions: Array<{ name: string }>;
    accounts?: Array<{ name: string }>;
  };
}

describe("IDL sync with vela-protocol", () => {
  test("vela_protocol.json matches protocol source of truth", () => {
    const sdkIdl = readJson("../../idl/vela_protocol.json");
    const protocolIdl = readJson(
      "../../../vela-protocol/target/idl/vela_protocol.json",
    );
    expect(sdkIdl).toEqual(protocolIdl);
  });

  test("vela_transfer_hook.json matches protocol source of truth", () => {
    const sdkHookIdl = readJson("../../idl/vela_transfer_hook.json");
    const protocolHookIdl = readJson(
      "../../../vela-protocol/target/idl/vela_transfer_hook.json",
    );
    expect(sdkHookIdl).toEqual(protocolHookIdl);
  });

  test("SDK IDL exposes all Phase 43 V2 instructions", () => {
    const sdkIdl = readJson("../../idl/vela_protocol.json");
    const names = new Set(
      sdkIdl.instructions.map((instruction) => instruction.name),
    );

    for (const required of [
      "init_merchant_credential",
      "init_token_config",
      "update_token_config",
      "close_mandate",
      "migrate_mandate",
      "migrate_plan",
      "update_mandate",
      "update_plan",
      "update_usage_plan",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });

  test("SDK account types remain a subset of the protocol IDL", () => {
    const sdkIdl = readJson("../../idl/vela_protocol.json");
    const protocolIdl = readJson(
      "../../../vela-protocol/target/idl/vela_protocol.json",
    );
    const protocolAccountNames = new Set(
      (protocolIdl.accounts ?? []).map((account) => account.name),
    );

    for (const account of sdkIdl.accounts ?? []) {
      expect(protocolAccountNames.has(account.name)).toBe(true);
    }
  });
});
