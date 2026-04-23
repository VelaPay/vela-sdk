# @velapay/sdk

[![npm](https://img.shields.io/npm/v/@velapay/sdk)](https://www.npmjs.com/package/@velapay/sdk)
[![license](https://img.shields.io/npm/l/@velapay/sdk)](./LICENSE)

TypeScript SDK for [Vela](https://velapay.com) — private, programmable payment authority on Solana, built on Token-2022 transfer hooks. Subscriptions, streams, usage, and agent budgets on one authorization primitive. Provides instruction builders, a high-level client, pre-flight validators, and a CLI.

> **Devnet only.** Mainnet deployment is not yet live. All examples target the current devnet program.

## Installation

```bash
bun add @velapay/sdk
# or: npm install @velapay/sdk
```

Optional peer dependency — enables Helius RPC, priority fee estimation, and enhanced transaction landing:

```bash
bun add helius-sdk
```

## Quick start

```ts
import { createVelaClient, DEVNET_USDC_MINT } from "@velapay/sdk";
import { Connection } from "@solana/web3.js";

const vela = createVelaClient({
  connection: new Connection("https://api.devnet.solana.com"),
  wallet,                  // any wallet with signTransaction + publicKey
  commitment: "confirmed",
  heliusApiKey: "...",     // optional — upgrades to Helius RPC
  keeperEndpoint: "...",   // optional — auto-registers billing schedules
});
```

## API

### Subscription lifecycle

```ts
// Create a billing plan (merchant)
const { signature, address: planAddress } = await vela.createPlan({
  amount: 10_000_000n,     // 10 USDC (6 decimals)
  frequency: 2_592_000,    // seconds — 30 days
  usdcMintAddress,
  wrappedUsdcMint,
});

// Subscribe — wraps SPL USDC and creates a mandate atomically
const { signature, address: mandateAddress } = await vela.wrapAndSubscribe({
  planAddress,
  merchantAddress,
  splUsdcMint,
  wrappedUsdcMint,
  wrappingVault,
  amount: 10_000_000n,
});

// Pull payment (keeper or merchant)
await vela.pullPayment({
  mandateAddress,
  subscriberAddress,
  merchantAddress,
  planAddress,
  wrappedUsdcMint,
});

// Cancel
await vela.cancelSubscription({
  mandateAddress,
  subscriberAddress,
  planAddress,
  usdcMintAddress,
});
```

### Usage-based billing

```ts
const { usagePlanAddress } = await vela.createUsagePlan({
  planAddress,
  maxAmountPerPeriod: 100_000_000n,
  periodDuration: 2_592_000,
});

await vela.submitUsageReport({
  usagePlanAddress,
  mandateAddress,
  encryptedUsage: ...,
});
```

### Pre-flight validators

Read-only checks before submitting a transaction:

```ts
const result = await vela.validate.pullPayment(mandateAddress);
if (!result.canPull) console.error(result.reason);

await vela.validate.subscribe(planAddress);
await vela.validate.cancel(mandateAddress);
```

### Raw instruction builders

Compose your own transactions when you need full control:

```ts
const { instruction, mandateAddress } = await vela.instructions.subscribe({
  planAddress,
  planId,
  merchantAddress,
  wrappedUsdcMint,
  credentialMintAddress,
});
```

### Keeper / billing schedule

Register mandates with the keeper service for automated recurring pulls:

```ts
await vela.registerBillingSchedule({
  mandateAddress,
  planAddress,
  subscriberAddress,
  merchantAddress,
  frequency,
  nextPaymentDue,
  billingType: "fixed",
});

await vela.cancelBillingSchedule(mandateAddress);
```

### Address derivation

```ts
import {
  deriveMandateAddress,
  derivePlanAddress,
  deriveCredentialMintAddress,
  deriveUsagePlanAddress,
} from "@velapay/sdk";
```

## CLI

Install globally or run with `bunx`:

```bash
bun install -g @velapay/sdk
```

```bash
# Create a billing plan
vela create-plan --amount 10000000 --frequency 2592000 --keypair ~/.config/solana/id.json

# Subscribe to a plan
vela subscribe --plan <address> --merchant <address> --keypair ~/.config/solana/id.json

# Pull payment
vela pull --mandate <address> --keypair ~/.config/solana/id.json

# Cancel subscription
vela cancel --mandate <address> --keypair ~/.config/solana/id.json

# Check mandate status
vela status --mandate <address>

# Simulate a pull (dry-run)
vela simulate --mandate <address>
```

## Subpath exports

| Import path | Contents |
|-------------|----------|
| `@velapay/sdk` | Full client, builders, validators, types |
| `@velapay/sdk/events` | Zod event schemas (re-exported by `@velapay/webhook`) |
| `@velapay/sdk/x402` | x402 payment protocol helpers |
| `@velapay/sdk/browser` | Browser-safe bundle (no Node.js APIs) |

## Development

```bash
bun install

bun run build   # dual ESM + CJS output with type declarations
bun test        # run tests
bun run test:protocol # requires sibling vela-protocol build artifacts
bun run check   # TypeScript type check
bun run lint    # Biome lint
bun run smoke:package  # verify the packed npm artifact in a fresh consumer
bun run release:verify # production-grade release gate
bun run format  # Biome format
```

`bun run test:protocol` and `bun run release:verify` expect built artifacts from the sibling
`vela-protocol` repo. Build that repo first so these files exist:

- `../vela-protocol/target/deploy/vela_protocol.so`
- `../vela-protocol/target/deploy/vela_transfer_hook.so`
- `../vela-protocol/target/idl/vela_protocol.json`
- `../vela-protocol/target/idl/vela_transfer_hook.json`

`prepublishOnly` runs `bun run release:verify`, so publishing now refuses to proceed if the
protocol-backed integration coverage or packaged-consumer smoke checks are missing.

## Related packages

- [`@velapay/webhook`](https://www.npmjs.com/package/@velapay/webhook) — isomorphic webhook event verifier

## License

[MIT](./LICENSE)
