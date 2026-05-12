<!-- markdownlint-disable MD013 -->

# @velapay/sdk

[![npm](https://img.shields.io/npm/v/@velapay/sdk)](https://www.npmjs.com/package/@velapay/sdk)
[![license](https://img.shields.io/npm/l/@velapay/sdk)](./LICENSE)

TypeScript SDK for VelaPay, a private, programmable payment authority on Solana. The SDK is the compatibility layer between applications and the Vela Protocol programs: it builds Anchor instructions, resolves PDAs, deserializes accounts, validates pre-flight state, parses public events, and exposes a browser-safe entrypoint for checkout and embedded flows.

> Devnet only. Mainnet deployment is not live yet. All examples target the current devnet programs.

## Protocol Programs

| Program | Devnet address |
| --- | --- |
| Vela Protocol | `CVM6UqbwKgHckZzm8R2qbN3BWhCTdk1PsSeEQLchkwKT` |
| Vela Transfer Hook | `3agVoFp4NZFuKbVqCV8HbjSZn1xW4Utk4U1Wir3TKjZ9` |

## Installation

```sh
bun add @velapay/sdk
```

Other package managers are supported by the published package:

```sh
npm install @velapay/sdk
```

`helius-sdk` is an optional peer dependency. Install it only when you want Helius RPC helpers, priority fee estimation, or webhook utilities.

```sh
bun add helius-sdk
```

## Quick Start

```ts
import { Connection } from "@solana/web3.js";
import { createVelaClient } from "@velapay/sdk";

const vela = createVelaClient({
  connection: new Connection("https://api.devnet.solana.com", "confirmed"),
  wallet, // any wallet with publicKey + signTransaction
  commitment: "confirmed",
  heliusApiKey: process.env.HELIUS_API_KEY, // optional
  keeperEndpoint: process.env.VELA_KEEPER_URL, // optional
});
```

The client has three layers:

| Layer | Use when |
| --- | --- |
| Top-level client methods | You want the SDK to build, sign, send, confirm, and return enriched data |
| `vela.instructions.*` | You need raw `TransactionInstruction` objects for custom transactions |
| `vela.validate.*` | You need read-only checks before asking a wallet to sign |

## Multi-Token Billing

Periodic plans and stream mandates are not USDC-only. A merchant may bind a plan to any enabled Token-2022 billing mint registered in the protocol through `TokenConfig`.

`billingMint` is optional for backwards compatibility. If omitted, the SDK resolves the protocol's wrapped-USDC mint from `ProtocolConfig`.

```ts
import { PYUSD_MINT } from "@velapay/sdk";

const { signature, address: planAddress, data: plan } = await vela.createPlan({
  amount: 10_000_000n,
  frequency: 2_592_000,
  trialPeriod: 0,
  maxPulls: 12n,
  billingMint: PYUSD_MINT,
});

console.log(signature, planAddress.toBase58(), plan.billingMint?.toBase58());
```

For display and amount parsing, resolve the token config first:

```ts
const tokenConfig = await vela.resolveTokenConfig(PYUSD_MINT);

const rawAmount = vela.parseAmount("10.00", tokenConfig);
const displayAmount = vela.formatAmount(rawAmount, tokenConfig);
```

## Subscription Lifecycle

For Token-2022 billing mints that are already funded in the subscriber's mandate-owned token account, create the mandate directly:

```ts
const { address: mandateAddress } = await vela.createSubscription({
  planAddress,
  merchantAddress,
});
```

For the wrapped-USDC compatibility path, wrap SPL USDC and subscribe atomically:

```ts
const { address: mandateAddress } = await vela.wrapAndSubscribe({
  planAddress,
  merchantAddress,
  splUsdcMint,
  wrappedUsdcMint,
  wrappingVault,
  amount: 10_000_000n,
});
```

Execute a pull by passing the billing mint used by the plan. `wrappedUsdcMint` is still accepted for legacy wrapped-USDC callers, but new integrations should use `billingMint`.

```ts
await vela.pullPayment({
  mandateAddress,
  subscriberAddress,
  merchantAddress,
  planAddress,
  billingMint: PYUSD_MINT,
});
```

Usage-based pulls must also pass the writable `usageReportAddress` for the
current closed period. The protocol marks that report settled only after the
pull succeeds.

Cancel the mandate when the subscriber revokes authority:

```ts
await vela.cancelSubscription({
  mandateAddress,
  subscriberAddress,
  planAddress,
  usdcMintAddress,
});
```

## Raw Instruction Builders

Raw builders return unsigned instructions plus the PDAs they derive. They are useful for batching, address lookup tables, simulations, and server-side transaction assembly.

```ts
const { instruction, planAddress, billingMintAddress, tokenConfigAddress } =
  await vela.instructions.createPlan({
    planId,
    amount: 10_000_000n,
    frequency: 2_592_000,
    maxPulls: 12n,
    billingMint: PYUSD_MINT,
  });
```

Token admins can build token-config instructions directly from the package export:

```ts
import { buildInitTokenConfigInstruction } from "@velapay/sdk";

const { instruction, tokenConfigAddress } =
  await buildInitTokenConfigInstruction(vela.program, {
    admin,
    mint: PYUSD_MINT,
    billingRail: "hook",
    decimals: 6,
  });
```

## Accounts and Discovery

The SDK exports PDA helpers, account fetchers, and deserializers so downstream services can index protocol state without duplicating layouts.

```ts
import {
  derivePlanAddress,
  deserializePlan,
  deserializePullApprovalAccount,
  fetchTokenConfig,
  getActiveSubscriptions,
  isPullApprovalCurrent,
  getSubscribablePlan,
} from "@velapay/sdk";
```

Plan deserialization exposes `billingMint` for flat plans. Consumers should treat the mint as authoritative for settlement and token identity.

`PullApproval` accounts are period-bound. Keepers and indexers should use
`deserializePullApprovalAccount` and `isPullApprovalCurrent` instead of hardcoded
byte offsets.

## Breaking Protocol Notes

Version `0.2.0` targets the hardened devnet protocol:

- `demo_approve_pull` is removed from the production IDL.
- Usage reports are merchant-only and contain exactly one encrypted field:
  `usage_units`.
- Usage pricing terms come from the on-chain `UsagePlan`; clients must not
  submit encrypted pricing terms.
- Usage `execute_pull` requires the current `UsageReport` as a writable
  remaining account.
- `ProtocolConfig.mxeProgramId` is the Arcium MXE namespace for request
  builders; legacy zero configs fall back to the Vela program ID.
- Arcium computation definitions must be rebuilt, initialized, and uploaded for
  `usage_charge` and `tiered_pricing` before usage billing can settle.

## Events

Event schemas are available from `@velapay/sdk/events` and are re-exported by `@velapay/webhook`.

```ts
import { VelaEventSchema } from "@velapay/sdk/events";

const event = VelaEventSchema.parse(payload);
```

For token events, `mint` is authoritative. `token_symbol` is display metadata and may be an empty string for non-USDC stream events. Consumers may enrich display labels from a local mint map or `TokenConfig`, but should not rewrite protocol event truth.

## Browser Entrypoint

Browser applications should import from the browser-safe subpath. It excludes Node-only helpers and keeps transaction-building code available for checkout and embedded widgets.

```ts
import {
  buildCreatePlanInstruction,
  buildSubscribeInstruction,
} from "@velapay/sdk/browser";
```

## CLI

The package includes a `vela` CLI for local development and operator workflows.

```sh
bun install -g @velapay/sdk

export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>"

vela create-plan --amount 10000000 --frequency 2592000 --max-pulls 12 --keypair ~/.config/solana/id.json
vela subscribe <plan> --merchant <merchant> --usdc-mint <mint> --keypair ~/.config/solana/id.json
vela pull <mandate> --subscriber <subscriber> --merchant <merchant> --plan <plan> --usdc-mint <mint>
vela cancel <mandate> --subscriber <subscriber> --plan <plan> --usdc-mint <mint>
vela status <mandate>
vela simulate
```

Stream mandates are available under the `stream` command group. Amounts are raw
token base units.

```sh
vela stream create \
  --merchant <merchant> \
  --mint <token-2022-mint> \
  --rate-per-second 1000 \
  --authorized-max-rate 1000 \
  --min-settle-interval 30

vela stream settle <stream-mandate>
vela stream pause <stream-mandate>
vela stream resume <stream-mandate>
vela stream cancel <stream-mandate>
vela stream status <stream-mandate>
```

## Subpath Exports

| Import path | Contents |
| --- | --- |
| `@velapay/sdk` | Client, builders, validators, account helpers, constants, and types |
| `@velapay/sdk/browser` | Browser-safe instruction builders and constants |
| `@velapay/sdk/events` | Zod event schemas and event types |
| `@velapay/sdk/x402` | x402 payment protocol helpers |
| `@velapay/sdk/idl/vela_protocol.json` | Generated Vela Protocol IDL |

## Development

```sh
bun install

bun run check
bun test
bun run build
bun run smoke:package
```

Protocol-backed tests require built artifacts from the sibling `vela-protocol` repository:

```text
../vela-protocol/target/deploy/vela_protocol.so
../vela-protocol/target/deploy/vela_transfer_hook.so
../vela-protocol/target/idl/vela_protocol.json
../vela-protocol/target/idl/vela_transfer_hook.json
```

Run the full release gate before publishing:

```sh
bun run release:verify
```

`prepublishOnly` runs `bun run release:verify`, so publishing fails if type checks, tests, protocol-backed integration coverage, build output, or package smoke checks fail.

## Rollout Compatibility

The SDK must be released in the same rollout window as protocol upgrades that change instruction accounts, account layouts, event schemas, token semantics, or program ids.

Before updating runtime consumers:

1. Regenerate or copy the final protocol IDL into `idl/vela_protocol.json`.
2. Update generated program ids if the protocol addresses changed.
3. Run `bun run release:verify`.
4. Pin downstream runtime repos to the verified SDK version.

For this multi-token rollout, downstream code must rely on `mint` as canonical and preserve raw `token_symbol` values when decoding stream and pull events.

## License

[MIT](./LICENSE)
