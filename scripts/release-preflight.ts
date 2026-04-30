import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAllowedAuditResiduals, VELA_PROTOCOL_COMPATIBILITY } from "../src";
import {
  hasProtocolBuildArtifacts,
  hasProtocolIdlArtifacts,
  requireProtocolIdl,
  requireTransferHookIdl,
} from "../tests/helpers/protocol-artifacts";

const packageRoot = resolve(import.meta.dir, "..");

function readPackageJson(): {
  exports: Record<string, unknown>;
  files: string[];
} {
  return JSON.parse(
    readFileSync(resolve(packageRoot, "package.json"), "utf8"),
  ) as {
    exports: Record<string, unknown>;
    files: string[];
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function run(
  cmd: string[],
  label: string,
): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = `${stdout}${stderr}`;
  if (exitCode !== 0 && label !== "bun audit") {
    throw new Error(`${label} failed (exit ${exitCode})\n${output}`.trim());
  }
  return { exitCode, output };
}

function assertProtocolArtifacts(): void {
  if (!hasProtocolBuildArtifacts() || !hasProtocolIdlArtifacts()) {
    throw new Error("Protocol build and IDL artifacts are required");
  }

  const protocolHash = sha256File(requireProtocolIdl());
  const transferHookHash = sha256File(requireTransferHookIdl());
  if (protocolHash !== VELA_PROTOCOL_COMPATIBILITY.protocol.idlSha256) {
    throw new Error("Protocol IDL hash does not match SDK manifest");
  }
  if (transferHookHash !== VELA_PROTOCOL_COMPATIBILITY.transferHook.idlSha256) {
    throw new Error("Transfer-hook IDL hash does not match SDK manifest");
  }
}

function assertPackageExports(): void {
  const packageJson = readPackageJson();
  const requiredSubpaths = [
    ".",
    "./accounts",
    "./browser",
    "./errors",
    "./events",
    "./inspection",
    "./instructions",
    "./protocol",
    "./security",
    "./token",
    "./x402",
    "./idl/vela_protocol.json",
  ];
  for (const subpath of requiredSubpaths) {
    if (!(subpath in packageJson.exports)) {
      throw new Error(`Missing package export ${subpath}`);
    }
  }
  if (packageJson.files.includes("cli")) {
    throw new Error("Raw CLI TypeScript sources must not be published");
  }
}

function assertApiDocs(): void {
  const docsPath = resolve(packageRoot, "docs/API.md");
  if (!existsSync(docsPath)) {
    throw new Error("docs/API.md is missing");
  }
  const docs = readFileSync(docsPath, "utf8");
  for (const subpath of Object.keys(readPackageJson().exports)) {
    if (subpath.startsWith("./idl/")) {
      continue;
    }
    const label =
      subpath === "." ? "@velapay/sdk" : `@velapay/sdk/${subpath.slice(2)}`;
    if (!docs.includes(label)) {
      throw new Error(`docs/API.md is missing ${label}`);
    }
  }
}

async function assertAuditResiduals(): Promise<void> {
  const { exitCode, output } = await run(["bun", "audit"], "bun audit");
  if (exitCode === 0) {
    return;
  }

  const allowed = new Set(getAllowedAuditResiduals());
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([a-z0-9@/_-][a-z0-9@/._-]*)\s+(?:<=|<)/i);
    if (match) {
      seen.add(match[1]);
    }
  }
  const unexpected = [...seen].filter((name) => !allowed.has(name));
  if (unexpected.length > 0 || seen.size === 0) {
    throw new Error(
      `Unexpected audit findings: ${unexpected.join(", ") || "unparseable audit output"}`,
    );
  }
}

async function main(): Promise<void> {
  assertProtocolArtifacts();
  assertPackageExports();
  assertApiDocs();
  await assertAuditResiduals();
  console.log("Release preflight passed.");
}

await main();
