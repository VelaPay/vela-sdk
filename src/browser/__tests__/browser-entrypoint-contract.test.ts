import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as browser from "@vela/sdk/browser";
import type {
  PreviewPlanChangeResult as BrowserPreviewPlanChangeResult,
  StreamMandate as BrowserStreamMandate,
  TokenConfigAccount as BrowserTokenConfigAccount,
  UpgradePlanInput as BrowserUpgradePlanInput,
  VelaMandate as BrowserVelaMandate,
} from "@vela/sdk/browser";

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

const previewTypeMatchesSource: IsEqual<
  BrowserPreviewPlanChangeResult,
  import("../../builders/upgrade-builder").PreviewPlanChangeResult
> = true;
const inputTypeMatchesSource: IsEqual<
  BrowserUpgradePlanInput,
  import("../../builders/upgrade-builder").UpgradePlanInput
> = true;
const mandateTypeMatchesSource: IsEqual<
  BrowserVelaMandate,
  import("../../types").VelaMandate
> = true;
const streamTypeMatchesSource: IsEqual<
  BrowserStreamMandate,
  import("../../types/stream-mandate").StreamMandate
> = true;
const tokenTypeMatchesSource: IsEqual<
  BrowserTokenConfigAccount,
  import("../../types").TokenConfigAccount
> = true;

void [
  previewTypeMatchesSource,
  inputTypeMatchesSource,
  mandateTypeMatchesSource,
  streamTypeMatchesSource,
  tokenTypeMatchesSource,
];

const packageRoot = resolve(import.meta.dir, "../../..");

function readPackageFile(path: string) {
  return readFileSync(resolve(packageRoot, path), "utf8");
}

describe("@vela/sdk/browser contract", () => {
  test("exports the required browser-safe runtime surface", () => {
    expect(typeof browser.getMerchantState).toBe("function");
    expect(typeof browser.fetchMandate).toBe("function");
    expect(typeof browser.buildCreatePlanInstruction).toBe("function");
    expect(typeof browser.buildCancelPlanChangeInstruction).toBe("function");
    expect(typeof browser.buildSchedulePlanChangeInstruction).toBe("function");
    expect(typeof browser.buildUpdateMandatePlanInstruction).toBe("function");
    expect(typeof browser.buildUpdateStreamRateInstruction).toBe("function");
    expect(typeof browser.buildCancelInstruction).toBe("function");
    expect(typeof browser.buildWrapAndSubscribeInstructions).toBe("function");
    expect(typeof browser.getEnabledTokens).toBe("function");
    expect(typeof browser.resolveTokenConfig).toBe("function");
    expect(typeof browser.formatAmount).toBe("function");
    expect(typeof browser.parseAmount).toBe("function");
    expect(typeof browser.UpgradeBuilder).toBe("function");
    expect(typeof browser.withProgramAddress).toBe("function");
    expect(typeof browser.rawVelaIdl).toBe("object");
    expect(typeof browser.PROGRAM_ID.toBase58()).toBe("string");
  });

  test("stays narrow and does not leak node-oriented root-barrel exports", () => {
    expect("createVelaClient" in browser).toBe(false);
    expect("ALTManager" in browser).toBe(false);
    expect("buildAgentPullInstruction" in browser).toBe(false);
    expect("fetchStreamMandate" in browser).toBe(false);
    expect("TOKEN_PROGRAM_ID" in browser).toBe(false);
  });

  test("wires package exports and browser bundles explicitly", () => {
    const packageJson = readPackageFile("package.json");
    const buildScript = readPackageFile("build.ts");

    expect(packageJson).toContain('"./browser"');
    expect(packageJson).toContain("./dist/esm/index.js");
    expect(packageJson).toContain("./dist/cjs/index.cjs");
    expect(buildScript).toContain('./src/browser/index.ts');
    expect(buildScript).toContain('target: "browser"');
  });

  test("keeps browser adapters off the root SDK barrels", () => {
    const browserIndex = readPackageFile("src/browser/index.ts");
    const browserBuilders = readPackageFile("src/browser/builders.ts");
    const browserInstructions = readPackageFile("src/browser/instructions.ts");
    const browserAccounts = readPackageFile("src/browser/accounts.ts");

    expect(browserIndex).toContain('from "./builders"');
    expect(browserIndex).toContain('from "./instructions"');
    expect(browserIndex).not.toContain("../index");
    expect(browserBuilders).toContain('../builders/upgrade-builder');
    expect(browserBuilders).not.toContain("../builders/index");
    expect(browserInstructions).toContain("../instructions/cancel");
    expect(browserInstructions).not.toContain("../instructions/index");
    expect(browserAccounts).toContain("../accounts/deserialize");
    expect(browserAccounts).not.toContain("../accounts/index");
  });
});
