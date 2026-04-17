import { Wallet } from "@coral-xyz/anchor";
import type { Command } from "commander";
import { createVelaClient } from "../../src/client";
import { USDC_DECIMALS } from "../../src/constants";
import { VelaError } from "../../src/errors/base";
import { parseAmount } from "../../src/token/parse-amount";
import { createConnection } from "../utils/connection";
import { formatPlanDetails } from "../utils/formatting";
import { loadKeypair } from "../utils/keypair";

const USDC_TOKEN = { decimals: USDC_DECIMALS } as const;

/**
 * Registers the `vela create-plan` command (CLI-01).
 *
 * Creates a new subscription plan on-chain with the specified amount,
 * billing frequency, max pulls, and optional trial period.
 */
export function registerCreatePlan(parent: Command): void {
  parent
    .command("create-plan")
    .description("Create a new subscription plan")
    .requiredOption(
      "-a, --amount <amount>",
      "Amount in USDC (e.g., 25 for 25 USDC)",
    )
    .requiredOption(
      "-f, --frequency <seconds>",
      "Billing frequency in seconds (e.g., 2592000 for monthly)",
    )
    .requiredOption("-m, --max-pulls <count>", "Maximum number of pulls")
    .option("-t, --trial-period <seconds>", "Trial period in seconds", "0")
    .action(async (opts) => {
      try {
        const parentOpts = parent.opts();
        const keypair = await loadKeypair(parentOpts.keypair);
        const connection = createConnection(parentOpts.url);
        const wallet = new Wallet(keypair);

        const vela = createVelaClient({ connection, wallet: wallet as any });

        const amount = parseAmount(opts.amount, USDC_TOKEN);
        const frequency = BigInt(opts.frequency);
        const trialPeriod = BigInt(opts.trialPeriod);
        const maxPulls = BigInt(opts.maxPulls);

        if (maxPulls < 1n) {
          throw new Error("Max pulls must be at least 1.");
        }

        console.log("\nCreating subscription plan...\n");

        const result = await vela.createPlan({
          amount,
          frequency,
          trialPeriod,
          maxPulls,
        });

        console.log("Plan created successfully!\n");
        console.log(`Transaction: ${result.signature}`);
        if (result.data) {
          console.log("");
          console.log(formatPlanDetails(result.data));
        }
        console.log("");
      } catch (err) {
        if (err instanceof VelaError) {
          console.error(`\nError [${err.name}]: ${err.message}`);
          if (err.context) {
            console.error("Context:", JSON.stringify(err.context, null, 2));
          }
        } else if (err instanceof Error) {
          console.error(`\nError: ${err.message}`);
        } else {
          console.error(
            "\nAn unexpected error occurred. Use --verbose for details.",
          );
        }
        process.exit(1);
      }
    });
}
