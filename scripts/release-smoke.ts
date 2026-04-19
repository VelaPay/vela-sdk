import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const packageRoot = resolve(import.meta.dir, "..");

async function run(
  cmd: string[],
  cwd: string,
  label: string,
): Promise<string> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
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
      ["npm", "pack", "--pack-destination", packDir],
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
        'import { VelaEventSchema } from "@velapay/sdk/events";',
        'import { UpgradeBuilder } from "@velapay/sdk/browser";',
        'import { VelaPaymentHandler } from "@velapay/sdk/x402";',
        "",
        "void createVelaClient;",
        "void VelaEventSchema;",
        "void UpgradeBuilder;",
        "void VelaPaymentHandler;",
      ].join("\n"),
    );

    writeFileSync(
      join(consumerDir, "runtime.mjs"),
      [
        'import { createRequire } from "node:module";',
        'const require = createRequire(import.meta.url);',
        'const root = await import("@velapay/sdk");',
        'const events = await import("@velapay/sdk/events");',
        'const x402 = await import("@velapay/sdk/x402");',
        'const cjsRoot = require("@velapay/sdk");',
        'const cjsEvents = require("@velapay/sdk/events");',
        'const cjsX402 = require("@velapay/sdk/x402");',
        'if (typeof root.createVelaClient !== "function") throw new Error("Missing ESM root export");',
        'if (!events.VelaEventSchema) throw new Error("Missing ESM events export");',
        'if (typeof x402.VelaPaymentHandler !== "function") throw new Error("Missing ESM x402 export");',
        'if (typeof cjsRoot.createVelaClient !== "function") throw new Error("Missing CJS root export");',
        'if (!cjsEvents.VelaEventSchema) throw new Error("Missing CJS events export");',
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
