import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");

async function run(cmd: string[], cwd: string, label: string): Promise<string> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, npm_config_dry_run: "false" },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${label} failed (exit ${exitCode})\n${stdout}${stderr}`.trim(),
    );
  }

  return stdout.trim();
}

async function main(): Promise<void> {
  const tempRoot = mkdtempSync(join(tmpdir(), "vela-sdk-release-"));
  const packDir = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");

  try {
    mkdirSync(packDir, { recursive: true });
    mkdirSync(consumerDir, { recursive: true });

    await run(
      ["npm", "pack", "--dry-run=false", "--pack-destination", packDir],
      packageRoot,
      "npm pack",
    );

    const tarball = readdirSync(packDir).find((file) => file.endsWith(".tgz"));
    if (!tarball) {
      throw new Error("npm pack did not produce a tarball");
    }

    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "vela-sdk-release-smoke",
          private: true,
          type: "module",
          dependencies: {
            "@velapay/sdk": `file:../pack/${tarball}`,
            typescript: "^5.8.0",
          },
        },
        null,
        2,
      ),
    );

    writeFileSync(
      join(consumerDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "bundler",
            target: "ES2022",
            strict: true,
            skipLibCheck: true,
          },
        },
        null,
        2,
      ),
    );

    writeFileSync(
      join(consumerDir, "index.ts"),
      [
        'import { createVelaClient } from "@velapay/sdk";',
        'import { PDAFactory } from "@velapay/sdk/accounts";',
        'import { VelaError } from "@velapay/sdk/errors";',
        'import { VelaEventSchema } from "@velapay/sdk/events";',
        'import { explainInstructions } from "@velapay/sdk/inspection";',
        'import { buildCreatePlanInstruction } from "@velapay/sdk/instructions";',
        'import { getProtocolCompatibility } from "@velapay/sdk/protocol";',
        'import { getSecurityPosture } from "@velapay/sdk/security";',
        'import { parseAmount } from "@velapay/sdk/token";',
        'import { UpgradeBuilder } from "@velapay/sdk/browser";',
        'import { VelaPaymentHandler } from "@velapay/sdk/x402";',
        "",
        "void createVelaClient;",
        "void PDAFactory;",
        "void VelaError;",
        "void VelaEventSchema;",
        "void explainInstructions;",
        "void buildCreatePlanInstruction;",
        "void getProtocolCompatibility;",
        "void getSecurityPosture;",
        "void parseAmount;",
        "void UpgradeBuilder;",
        "void VelaPaymentHandler;",
      ].join("\n"),
    );

    writeFileSync(
      join(consumerDir, "runtime.mjs"),
      [
        'import { createRequire } from "node:module";',
        "const require = createRequire(import.meta.url);",
        'const root = await import("@velapay/sdk");',
        'const accounts = await import("@velapay/sdk/accounts");',
        'const errors = await import("@velapay/sdk/errors");',
        'const events = await import("@velapay/sdk/events");',
        'const inspection = await import("@velapay/sdk/inspection");',
        'const instructions = await import("@velapay/sdk/instructions");',
        'const protocol = await import("@velapay/sdk/protocol");',
        'const security = await import("@velapay/sdk/security");',
        'const token = await import("@velapay/sdk/token");',
        'const x402 = await import("@velapay/sdk/x402");',
        'const cjsRoot = require("@velapay/sdk");',
        'const cjsAccounts = require("@velapay/sdk/accounts");',
        'const cjsErrors = require("@velapay/sdk/errors");',
        'const cjsEvents = require("@velapay/sdk/events");',
        'const cjsInspection = require("@velapay/sdk/inspection");',
        'const cjsInstructions = require("@velapay/sdk/instructions");',
        'const cjsProtocol = require("@velapay/sdk/protocol");',
        'const cjsSecurity = require("@velapay/sdk/security");',
        'const cjsToken = require("@velapay/sdk/token");',
        'const cjsX402 = require("@velapay/sdk/x402");',
        'if (typeof root.createVelaClient !== "function") throw new Error("Missing ESM root export");',
        'if (typeof accounts.PDAFactory !== "function") throw new Error("Missing ESM accounts export");',
        'if (typeof errors.VelaError !== "function") throw new Error("Missing ESM errors export");',
        'if (!events.VelaEventSchema) throw new Error("Missing ESM events export");',
        'if (typeof inspection.explainInstructions !== "function") throw new Error("Missing ESM inspection export");',
        'if (typeof instructions.buildCreatePlanInstruction !== "function") throw new Error("Missing ESM instructions export");',
        'if (typeof protocol.getProtocolCompatibility !== "function") throw new Error("Missing ESM protocol export");',
        'if (typeof security.getSecurityPosture !== "function") throw new Error("Missing ESM security export");',
        'if (typeof token.parseAmount !== "function") throw new Error("Missing ESM token export");',
        'if (typeof x402.VelaPaymentHandler !== "function") throw new Error("Missing ESM x402 export");',
        'if (typeof cjsRoot.createVelaClient !== "function") throw new Error("Missing CJS root export");',
        'if (typeof cjsAccounts.PDAFactory !== "function") throw new Error("Missing CJS accounts export");',
        'if (typeof cjsErrors.VelaError !== "function") throw new Error("Missing CJS errors export");',
        'if (!cjsEvents.VelaEventSchema) throw new Error("Missing CJS events export");',
        'if (typeof cjsInspection.explainInstructions !== "function") throw new Error("Missing CJS inspection export");',
        'if (typeof cjsInstructions.buildCreatePlanInstruction !== "function") throw new Error("Missing CJS instructions export");',
        'if (typeof cjsProtocol.getProtocolCompatibility !== "function") throw new Error("Missing CJS protocol export");',
        'if (typeof cjsSecurity.getSecurityPosture !== "function") throw new Error("Missing CJS security export");',
        'if (typeof cjsToken.parseAmount !== "function") throw new Error("Missing CJS token export");',
        'if (typeof cjsX402.VelaPaymentHandler !== "function") throw new Error("Missing CJS x402 export");',
        'console.log("Release smoke passed");',
      ].join("\n"),
    );

    await run(["npm", "install", "--silent"], consumerDir, "npm install");
    await run(
      ["npx", "tsc", "--noEmit"],
      consumerDir,
      "TypeScript consumer smoke",
    );
    await run(["node", "runtime.mjs"], consumerDir, "Runtime consumer smoke");

    console.log("Packaged SDK consumer smoke passed.");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
