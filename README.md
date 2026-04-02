# @vela/sdk

TypeScript SDK for the [Vela](https://velapay.com) subscription billing protocol on Solana. Provides instruction builders, a high-level client, pre-flight validators, and a CLI — all built on Token-2022 transfer hooks.

## Installation

```bash
bun add @vela/sdk
```

Peer dependency (optional — enables priority fee estimation and enhanced RPC):

```bash
bun add helius-sdk
```

## Quick Start

```ts
import { createVelaClient } from "@vela/sdk";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

const vela = createVelaClient({
  connection,
  wallet,                  // any wallet with signTransaction + publicKey
  commitment: "confirmed",
  heliusApiKey: "...",     // optional: upgrades connection to Helius RPC
  keeperEndpoint: "...",   // optional: auto-registers billing schedules
});
```

## API

### Subscription lifecycle

```ts
// Create a billing plan (merchant)
const { signature, address: planAddress } = await vela.createPlan({
  amount: 10_000_000n,          // 10 USDC (6 decimals)
  frequency: 2_592_000,         // 30 days in seconds
  usdcMintAddress,
  wrappedUsdcMint,
});

// Subscribe (subscriber) — wraps SPL USDC and creates mandate atomically
const { signature, address: mandateAddress } = await vela.wrapAndSubscribe({
  planAddress,
  merchantAddress,
  splUsdcMint,
  wrappedUsdcMint,
  wrappingVault,
  amount: 10_000_000n,
});

// Pull payment (keeper / merchant)
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
// Create a usage plan
const { usagePlanAddress } = await vela.createUsagePlan({
  planAddress,
  maxAmountPerPeriod: 100_000_000n,
  periodDuration: 2_592_000,
});

// Submit a usage report (triggers encrypted Arcium computation in Phase 1)
await vela.submitUsageReport({
  usagePlanAddress,
  mandateAddress,
  encryptedUsage: ...,
});
```

### Validators (pre-flight, read-only)

```ts
const result = await vela.validate.pullPayment(mandateAddress);
if (!result.canPull) console.error(result.reason);

const result = await vela.validate.subscribe(planAddress);
const result = await vela.validate.cancel(mandateAddress);
```

### Raw instruction builders

Use `vela.instructions.*` when you need to compose transactions yourself:

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

```ts
// Register a mandate with the keeper for automated pulls
await vela.registerBillingSchedule({
  mandateAddress,
  planAddress,
  subscriberAddress,
  merchantAddress,
  frequency,
  nextPaymentDue,
  billingType: "fixed",
});

// Cancel the keeper schedule on cancellation
await vela.cancelBillingSchedule(mandateAddress);
```

### Address derivation

```ts
import {
  deriveMandateAddress,
  derivePlanAddress,
  deriveCredentialMintAddress,
  deriveUsagePlanAddress,
} from "@vela/sdk";
```

## CLI

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

## Development

```bash
bun install

# Build (dual CJS + ESM output)
bun run build

# Tests
bun test

# Type check
bun run check

# Lint / format
bun run lint
bun run format
```

## License

MIT
