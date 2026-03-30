import type { Command } from "commander";
import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { loadKeypair } from "../utils/keypair";
import { createConnection } from "../utils/connection";
import { createVelaClient } from "../../src/client";
import { VelaError } from "../../src/errors/base";

/**
 * Registers the `vela cancel` command (CLI-04).
 *
 * Cancels an active subscription mandate. Only the subscriber
 * (or authorized authority) can cancel.
 */
export function registerCancel(parent: Command): void {
  parent
    .command("cancel <mandate-address>")
    .description("Cancel a subscription")
    .requiredOption(
      "--subscriber <address>",
      "Subscriber public key",
    )
    .requiredOption(
      "--plan <address>",
      "Plan public key",
    )
    .requiredOption(
      "--usdc-mint <address>",
      "USDC mint address (needed for delegate revoke)",
    )
    .action(async (mandateAddressStr: string, opts) => {
      try {
        const parentOpts = parent.opts();
        const keypair = await loadKeypair(parentOpts.keypair);
        const connection = createConnection(parentOpts.url);
        const wallet = new Wallet(keypair);

        const vela = createVelaClient({ connection, wallet: wallet as any });

        const mandateAddress = new PublicKey(mandateAddressStr);
        const subscriberAddress = new PublicKey(opts.subscriber);
        const planAddress = new PublicKey(opts.plan);
        const usdcMintAddress = new PublicKey(opts.usdcMint);

        console.log("\nCancelling subscription...\n");

        const result = await vela.cancelSubscription({
          mandateAddress,
          subscriberAddress,
          planAddress,
          usdcMintAddress,
        });

        console.log("Subscription cancelled successfully!\n");
        console.log(`Transaction: ${result.signature}`);
        console.log(`Mandate: ${mandateAddressStr}`);
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
          console.error("\nAn unexpected error occurred. Use --verbose for details.");
        }
        process.exit(1);
      }
    });
}
