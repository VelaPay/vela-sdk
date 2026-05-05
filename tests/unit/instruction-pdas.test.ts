import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for SDK-02: no inline `findProgramAddressSync` calls for Vela
 * PDAs may creep back into `vela-sdk/src/instructions/*.ts`. The centralized
 * PDAFactory is the single source of truth for Vela-owned PDAs.
 *
 * Exceptions: the Arcium bridge builders (request-billing-record, request-validation,
 * request-usage-computation) legitimately derive external-program PDAs
 * (ARCIUM_* clock/fee-pool, mxe, cluster, computation accounts) inline against
 * ARCIUM_PROGRAM_ID. Those derivations are NOT Vela PDAs and must stay local.
 */

const INSTRUCTIONS_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "src",
  "instructions",
);
const SRC_DIR = join(import.meta.dir, "..", "..", "src");

// Files exempt from the zero-findProgramAddressSync rule. These files resolve
// external-program (Arcium) PDAs locally; they do not derive any Vela PDAs via
// findProgramAddressSync (those go through PDAFactory).
const ARCIUM_EXEMPT_FILES = new Set<string>([
  "request-billing-record.ts",
  "request-validation.ts",
  "request-usage-computation.ts",
]);

function listInstructionFiles(): string[] {
  return readdirSync(INSTRUCTIONS_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts",
  );
}

function readSource(path: string): string {
  return readFileSync(join(SRC_DIR, path), "utf8");
}

describe("instructions/ regression: no inline findProgramAddressSync for Vela PDAs", () => {
  test("non-Arcium instruction files have zero findProgramAddressSync calls", () => {
    const offenders: { file: string; matches: number }[] = [];

    for (const file of listInstructionFiles()) {
      if (ARCIUM_EXEMPT_FILES.has(file)) continue;

      const src = readFileSync(join(INSTRUCTIONS_DIR, file), "utf8");
      const matches = src.match(/findProgramAddressSync/g);
      if (matches && matches.length > 0) {
        offenders.push({ file, matches: matches.length });
      }
    }

    expect(offenders).toEqual([]);
  });

  test("Arcium exempt files still exist (sanity — if renamed, update exempt list)", () => {
    const files = new Set(listInstructionFiles());
    for (const exempt of ARCIUM_EXEMPT_FILES) {
      expect(files.has(exempt)).toBe(true);
    }
  });

  test("all non-exempt instruction files covered by the scan", () => {
    // Sanity: the scan sees at least the 20+ instruction files so we know the
    // directory was actually read.
    const files = listInstructionFiles();
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  test("subscribe.ts uses PDAFactory.mandate (V2) and includes merchantState", () => {
    const src = readSource("instructions/subscribe.ts");
    expect(src).toContain("PDAFactory.mandate(");
    expect(src).not.toContain("PDAFactory.mandateV1(");
    expect(src).not.toContain("deriveMandateAddress(");
    expect(src).toMatch(/merchantState:\s*merchantStateAddress/);
  });

  test("cancel.ts uses mandateAddress input and includes merchant + merchantState", () => {
    const src = readSource("instructions/cancel.ts");
    expect(src).not.toContain("PDAFactory.mandateV1(");
    expect(src).not.toContain("deriveMandateAddress(");
    expect(src).toMatch(/merchant:\s*merchantAddress/);
    expect(src).toMatch(/merchantState:\s*merchantStateAddress/);
  });

  test("execute-pull.ts includes tokenConfig + systemProgram and avoids V1 derivation", () => {
    const src = readSource("instructions/execute-pull.ts");
    expect(src).toContain("PDAFactory.tokenConfig(");
    expect(src).toMatch(/tokenConfig:\s*tokenConfigAddress/);
    expect(src).toMatch(/systemProgram:\s*SystemProgram\.programId/);
    expect(src).not.toContain("deriveMandateAddress(");
  });

  test("Arcium request builders include request-state PDAs", () => {
    const validation = readSource("instructions/request-validation.ts");
    expect(validation).toContain("PDAFactory.arciumValidationRequest(");
    expect(validation).toMatch(/requestState(?:,|:\s*requestState)/);
    expect(validation).toContain("params.nextPaymentDue");

    const usage = readSource("instructions/request-usage-computation.ts");
    expect(usage).toContain("PDAFactory.arciumUsageComputationRequest(");
    expect(usage).toMatch(/requestState(?:,|:\s*requestState)/);
    expect(usage).toContain(
      ".requestUsageComputation(new BN(computationOffset.toString()))",
    );
    expect(usage).not.toContain("ciphertextArrays");

    const billing = readSource("instructions/request-billing-record.ts");
    expect(billing).toContain("PDAFactory.arciumBillingRecordRequest(");
    expect(billing).toMatch(/requestState(?:,|:\s*requestState)/);
    expect(billing).toContain(".requestBillingRecord(");
    expect(billing).toContain("new BN(computationOffset.toString())");
    expect(billing).toContain("new BN(pullsExecuted.toString())");
  });

  test("submit-usage-report.ts commits full computation ciphertext and usage plan", () => {
    const src = readSource("instructions/submit-usage-report.ts");
    expect(src).toContain("usagePlanAddress");
    expect(src).toContain("computationCiphertext");
    expect(src).toMatch(/usagePlan:\s*usagePlanAddress/);
    expect(src).not.toContain("encryptedUsage");
  });

  test("preflight.ts uses PDAFactory.mandate and no V1 mandate derivation", () => {
    const src = readSource("validators/preflight.ts");
    expect(src).toContain("PDAFactory.mandate(");
    expect(src).not.toContain("deriveMandateAddress(");
    expect(src).not.toContain("PDAFactory.mandateV1(");
  });
});
