import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import { createVelaClient } from "../../src/client";
import { VelaError } from "../../src/errors/base";
import { createConnection } from "../utils/connection";
import { formatMandateStatus } from "../utils/formatting";
import { loadKeypair } from "../utils/keypair";

/**
 * Registers the `vela subscribe` command (CLI-02).
 *
 * Subscribes to an existing plan, creating a mandate PDA and minting
 * a subscription credential to the subscriber.
 */
export function registerSubscribe(parent: Command): void {
  parent
    .command("subscribe <plan-address>")
    .description("Subscribe to a plan")
    .requiredOption("--merchant <address>", "Merchant public key")
    .requiredOption(
      "--usdc-mint <address>",
      "USDC mint address on the target cluster",
    )
    .action(async (planAddressStr: string, opts) => {
      try {
        const parentOpts = parent.opts();
        const keypair = await loadKeypair(parentOpts.keypair);
        const connection = createConnection(parentOpts.url);
        const wallet = new Wallet(keypair);

        const vela = createVelaClient({ connection, wallet: wallet as any });

        const planAddress = new PublicKey(planAddressStr);
        const merchantAddress = new PublicKey(opts.merchant);
        const usdcMintAddress = new PublicKey(opts.usdcMint);

        console.log("\nSubscribing to plan...\n");

        const result = await vela.createSubscription({
          planAddress,
          merchantAddress,
          usdcMintAddress,
        });

        console.log("Subscription created successfully!\n");
        console.log(`Transaction: ${result.signature}`);
        if (result.data) {
          console.log("");
          console.log(formatMandateStatus(result.data));
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
