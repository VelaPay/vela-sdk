async function build() {
  const entrypoints = [
    "./src/index.ts",
    "./src/x402/index.ts",
    "./cli/index.ts",
  ];
  const external = [
    "@x402/core",
    "@x402/fetch",
    "@x402/hono",
    "@x402/svm",
    "@coral-xyz/anchor",
    "@solana/web3.js",
    "@solana/spl-token",
    "commander",
    "hono",
    "helius-sdk",
    "bn.js",
    "anchor-litesvm",
    "anchor-litesvm/node_modules/litesvm",
  ];

  // Clean dist
  const { rmSync } = await import("node:fs");
  rmSync("./dist", { recursive: true, force: true });

  // ESM build
  const esmResult = await Bun.build({
    entrypoints,
    outdir: "./dist/esm",
    format: "esm",
    target: "node",
    external,
  });

  // CJS build
  const cjsResult = await Bun.build({
    entrypoints,
    outdir: "./dist/cjs",
    format: "cjs",
    target: "node",
    naming: "[dir]/[name].cjs",
    external,
  });

  if (!esmResult.success) {
    console.error("ESM build failed:", esmResult.logs);
    process.exit(1);
  }
  if (!cjsResult.success) {
    console.error("CJS build failed:", cjsResult.logs);
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

  console.log("Build complete: dist/esm/ (ESM) + dist/cjs/ (CJS) + .d.ts declarations");
}

build();
