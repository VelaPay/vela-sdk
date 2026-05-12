# Changelog

## 0.2.0 - 2026-05-10

- Breaking: removed support for the production `demo_approve_pull` bypass.
- Breaking: usage reports now submit exactly one encrypted `usage_units`
  ciphertext; pricing terms are read from the on-chain `UsagePlan`.
- Breaking: usage `execute_pull` calls must include the current writable
  `UsageReport` account via `usageReportAddress`.
- Added `ProtocolConfig.mxeProgramId` decoding and request-builder support for
  externally configured Arcium MXE namespaces, with legacy fallback to the Vela
  program ID.
- Added `deserializePullApprovalAccount`, `fetchPullApproval`, and
  `isPullApprovalCurrent` for the period-bound `PullApproval` layout.
- Added IDL coverage for `init_usage_charge_comp_def` and
  `init_tiered_pricing_comp_def` so devnet operators can initialize/upload the
  usage-pricing Arcium definitions.
- Synced protocol IDL/types for the hardened devnet upgrade.

## 0.1.3 - 2026-05-09

- Added `vela stream` CLI commands for creating, settling, pausing, resuming,
  cancelling, and inspecting stream mandates on devnet.
- Exposed browser-safe stream lifecycle builders from `@velapay/sdk/browser`:
  `buildPauseStreamInstruction`, `buildResumeStreamInstruction`, and
  `buildCancelStreamInstruction`.
- Rebuilt package artifacts so browser, ESM, CJS, and type declarations include
  the stream lifecycle surface.

## 0.1.2

- Previous devnet SDK release.
