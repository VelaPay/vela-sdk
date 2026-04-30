import type { Command } from "commander";
import {
  createCliContext,
  handleCliError,
  parseOptionalPublicKey,
  parsePublicKey,
  parseServiceLimitInputs,
  parseUint,
  parseUsdcAmount,
  printAgentMandateWriteResult,
} from "./shared";

export function registerAgentMandateCreate(parent: Command): void {
  parent
    .command("create")
    .description("Create and fund an agent mandate")
    .requiredOption("--agent <address>", "Agent authority public key")
    .requiredOption("--spl-usdc-mint <address>", "Source SPL USDC mint")
    .option("--wrapped-usdc-mint <address>", "Wrapped USDC mint override")
    .option("--wrapping-vault <address>", "Wrapping vault override")
    .requiredOption("--daily-limit <amount>", "Daily budget in USDC")
    .requiredOption("--cap <amount>", "Lifetime cap in USDC")
    .requiredOption("--services <addresses>", "Comma-separated service pubkeys")
    .requiredOption(
      "--service-limits <amounts>",
      "Comma-separated per-service daily limits in USDC",
    )
    .requiredOption("--min-pull-amount <amount>", "Minimum pull size in USDC")
    .requiredOption(
      "--min-pull-interval <seconds>",
      "Minimum seconds between pulls",
    )
    .requiredOption(
      "--funded-amount <amount>",
      "Initial funding amount in USDC",
    )
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const result = await vela.createAgentMandate({
          agent: parsePublicKey(opts.agent, "agent"),
          splUsdcMint: parsePublicKey(opts.splUsdcMint, "spl-usdc-mint"),
          wrappedUsdcMint: parseOptionalPublicKey(
            opts.wrappedUsdcMint,
            "wrapped-usdc-mint",
          ),
          wrappingVault: parseOptionalPublicKey(
            opts.wrappingVault,
            "wrapping-vault",
          ),
          dailyLimit: parseUsdcAmount(opts.dailyLimit, "daily-limit"),
          lifetimeCap: parseUsdcAmount(opts.cap, "cap"),
          minPullAmount: parseUsdcAmount(opts.minPullAmount, "min-pull-amount"),
          minPullInterval: parseUint(opts.minPullInterval, "min-pull-interval"),
          services:
            parseServiceLimitInputs(opts.services, opts.serviceLimits) ?? [],
          fundedAmount: parseUsdcAmount(opts.fundedAmount, "funded-amount"),
        });

        printAgentMandateWriteResult(
          "Agent mandate created",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
