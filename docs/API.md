# Vela SDK API

This file is generated from `package.json#exports` by `bun run docs:api`.

## Public Imports

| Import | Purpose |
|---|---|
| `@velapay/sdk` | Main client, account helpers, instruction builders, typed errors, token helpers, and compatibility metadata. |
| `@velapay/sdk/accounts` | PDA helpers, account deserializers, and read-only fetchers. |
| `@velapay/sdk/errors` | On-chain and SDK-side typed error classes plus error translation. |
| `@velapay/sdk/x402` | x402-style challenge, proof, client handler, nonce cache, and Hono middleware. |
| `@velapay/sdk/events` | Zod schemas for protocol events and webhook payload parsing. |
| `@velapay/sdk/inspection` | Dry-run transaction explanation helpers for instructions and instruction sets. |
| `@velapay/sdk/instructions` | Raw transaction-instruction builders for protocol operations. |
| `@velapay/sdk/protocol` | Protocol compatibility manifest, cluster program IDs, and compatibility assertions. |
| `@velapay/sdk/security` | SDK security posture and audit residual allowlist metadata. |
| `@velapay/sdk/token` | Token config resolution, display formatting, parsing, and symbols. |
| `@velapay/sdk/browser` | Browser-safe builders and deserializers that avoid Node-only dependencies. |

## Release Contract

- The SDK publishes ESM, CommonJS, and declaration files for every public subpath.
- `@velapay/sdk/protocol` exposes the protocol IDL hashes and program IDs this SDK was built against.
- `@velapay/sdk/security` documents known audit residuals inherited from the Anchor-compatible Solana v1 dependency stack.
- `@velapay/sdk/inspection` can explain transaction instructions before signing or sending.
