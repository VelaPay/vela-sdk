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

export function registerAgentMandateAdjust(parent: Command): void {
  parent
    .command("adjust")
    .description("Adjust agent-mandate limits or authorized services")
    .requiredOption("--agent <address>", "Agent authority public key")
    .option("--daily-limit <amount>", "Updated daily limit in USDC")
    .option("--cap <amount>", "Updated lifetime cap in USDC")
    .option("--services <addresses>", "Comma-separated service pubkeys")
    .option(
      "--service-limits <amounts>",
      "Comma-separated per-service daily limits in USDC",
    )
    .option("--min-pull-amount <amount>", "Updated minimum pull size in USDC")
    .option(
      "--min-pull-interval <seconds>",
      "Updated minimum seconds between pulls",
    )
    .option("--wrapped-usdc-mint <address>", "Wrapped USDC mint override")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const services = parseServiceLimitInputs(
          opts.services,
          opts.serviceLimits,
        );
        const updates = {
          agent: parsePublicKey(opts.agent, "agent"),
          dailyLimit:
            opts.dailyLimit == null
              ? undefined
              : parseUsdcAmount(opts.dailyLimit, "daily-limit"),
          lifetimeCap:
            opts.cap == null ? undefined : parseUsdcAmount(opts.cap, "cap"),
          minPullAmount:
            opts.minPullAmount == null
              ? undefined
              : parseUsdcAmount(opts.minPullAmount, "min-pull-amount"),
          minPullInterval:
            opts.minPullInterval == null
              ? undefined
              : parseUint(opts.minPullInterval, "min-pull-interval"),
          services,
          wrappedUsdcMint: parseOptionalPublicKey(
            opts.wrappedUsdcMint,
            "wrapped-usdc-mint",
          ),
        };

        if (
          updates.dailyLimit == null &&
          updates.lifetimeCap == null &&
          updates.minPullAmount == null &&
          updates.minPullInterval == null &&
          updates.services == null
        ) {
          throw new Error(
            "No updates provided. Pass at least one limit or service change.",
          );
        }

        const result = await vela.adjustAgentMandate(updates);
        printAgentMandateWriteResult(
          "Agent mandate adjusted",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
