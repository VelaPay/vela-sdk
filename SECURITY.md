# Security

VelaPay SDK releases are checked with `bun run release:preflight` and `bun run release:verify`.

## Current Audit Posture

The direct Hono advisory `GHSA-458j-xx4x-4375` is fixed by requiring `hono >=4.12.15`.

Two known advisories remain in the Anchor-compatible Solana v1 dependency stack:

| Package | Severity | Path | Status |
|---|---|---|---|
| `bigint-buffer` | high | `@solana/spl-token -> @solana/buffer-layout-utils` | No patched `bigint-buffer` release exists. The SDK does not call it directly. |
| `uuid` | moderate | `@solana/web3.js -> rpc-websockets` | Waiting on a compatible Solana v1 upstream update. The SDK does not call uuid v3/v5/v6 with caller-supplied buffers. |

Do not silence new audit findings. Add only reviewed upstream residuals to `src/security/index.ts`, and keep `release:preflight` passing.

## Reporting

Please report suspected vulnerabilities privately to the maintainers before public disclosure.
