async function build() {
  const nodeEntrypoints = [
    "./src/index.ts",
    "./src/accounts/index.ts",
    "./src/errors/index.ts",
    "./src/events/index.ts",
    "./src/inspection/index.ts",
    "./src/instructions/index.ts",
    "./src/protocol/index.ts",
    "./src/security/index.ts",
    "./src/token/index.ts",
    "./src/x402/index.ts",
    "./cli/index.ts",
  ];
  const browserEntrypoints = ["./src/browser/index.ts"];
  const external = [
    "@coral-xyz/anchor",
    "@solana/web3.js",
    "@solana/spl-token",
    "commander",
    "hono",
    "helius-sdk",
    "zod",
    "bn.js",
    "anchor-litesvm",
    "anchor-litesvm/node_modules/litesvm",
  ];

  // Clean dist
  const { rmSync } = await import("node:fs");
  rmSync("./dist", { recursive: true, force: true });

  // ESM build
  const esmNodeResult = await Bun.build({
    entrypoints: nodeEntrypoints,
    outdir: "./dist/esm",
    format: "esm",
    target: "node",
    external,
  });
  const esmBrowserResult = await Bun.build({
    entrypoints: browserEntrypoints,
    outdir: "./dist/esm",
    format: "esm",
    target: "browser",
    external,
  });

  // CJS build
  const cjsNodeResult = await Bun.build({
    entrypoints: nodeEntrypoints,
    outdir: "./dist/cjs",
    format: "cjs",
    target: "node",
    naming: "[dir]/[name].cjs",
    external,
  });
  const cjsBrowserResult = await Bun.build({
    entrypoints: browserEntrypoints,
    outdir: "./dist/cjs",
    format: "cjs",
    target: "browser",
    naming: "[dir]/[name].cjs",
    external,
  });

  if (!esmNodeResult.success || !esmBrowserResult.success) {
    console.error("ESM build failed:", [
      ...esmNodeResult.logs,
      ...esmBrowserResult.logs,
    ]);
    process.exit(1);
  }
  if (!cjsNodeResult.success || !cjsBrowserResult.success) {
    console.error("CJS build failed:", [
      ...cjsNodeResult.logs,
      ...cjsBrowserResult.logs,
    ]);
    process.exit(1);
  }

  // Generate declarations via tsc
  const proc = Bun.spawn(["bunx", "tsc", "-p", "tsconfig.build.json"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("Declaration generation failed");
    process.exit(1);
  }

  // Copy .d.ts → .d.cts so CJS consumers get correct types (require.types must be .d.cts)
  const { readdirSync, copyFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  function copyDtsAsDcts(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        copyDtsAsDcts(full);
      } else if (entry.endsWith(".d.ts") && !entry.endsWith(".d.cts")) {
        copyFileSync(full, full.replace(/\.d\.ts$/, ".d.cts"));
      }
    }
  }
  copyDtsAsDcts("./dist/esm");

  // The browser bundle is emitted at dist/{esm,cjs}/index.* from
  // src/browser/index.ts. Put matching declarations beside it so TS consumers
  // that resolve the concrete browser bundle still get the browser-safe types.
  copyFileSync("./dist/esm/src/browser/index.d.ts", "./dist/esm/index.d.ts");
  copyFileSync("./dist/esm/src/browser/index.d.cts", "./dist/esm/index.d.cts");
  copyFileSync("./dist/esm/src/browser/index.d.cts", "./dist/cjs/index.d.cts");

  console.log(
    "Build complete: dist/esm/ (ESM) + dist/cjs/ (CJS) + .d.ts/.d.cts declarations",
  );
}

build();
