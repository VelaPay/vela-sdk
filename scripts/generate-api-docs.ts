import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
) as { exports: Record<string, unknown> };

const descriptions: Record<string, string> = {
  ".": "Main client, account helpers, instruction builders, typed errors, token helpers, and compatibility metadata.",
  "./accounts": "PDA helpers, account deserializers, and read-only fetchers.",
  "./browser":
    "Browser-safe builders and deserializers that avoid Node-only dependencies.",
  "./errors":
    "On-chain and SDK-side typed error classes plus error translation.",
  "./events": "Zod schemas for protocol events and webhook payload parsing.",
  "./inspection":
    "Dry-run transaction explanation helpers for instructions and instruction sets.",
  "./instructions":
    "Raw transaction-instruction builders for protocol operations.",
  "./protocol":
    "Protocol compatibility manifest, cluster program IDs, and compatibility assertions.",
  "./security": "SDK security posture and audit residual allowlist metadata.",
  "./token":
    "Token config resolution, display formatting, parsing, and symbols.",
  "./x402":
    "x402-style challenge, proof, client handler, nonce cache, and Hono middleware.",
};

const rows = Object.keys(packageJson.exports)
  .filter((subpath) => !subpath.startsWith("./idl/"))
  .map((subpath) => {
    const importPath =
      subpath === "." ? "@velapay/sdk" : `@velapay/sdk/${subpath.slice(2)}`;
    return `| \`${importPath}\` | ${descriptions[subpath] ?? "Public SDK surface."} |`;
  });

const content = `# Vela SDK API

This file is generated from \`package.json#exports\` by \`bun run docs:api\`.

## Public Imports

| Import | Purpose |
|---|---|
${rows.join("\n")}

## Release Contract

- The SDK publishes ESM, CommonJS, and declaration files for every public subpath.
- \`@velapay/sdk/protocol\` exposes the protocol IDL hashes and program IDs this SDK was built against.
- \`@velapay/sdk/security\` documents known audit residuals inherited from the Anchor-compatible Solana v1 dependency stack.
- \`@velapay/sdk/inspection\` can explain transaction instructions before signing or sending.
`;

writeFileSync(resolve(packageRoot, "docs/API.md"), content);
console.log("Generated docs/API.md");
