import type { Command } from "commander";
import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { loadKeypair } from "../utils/keypair";
import { createConnection } from "../utils/connection";
import { formatMandateStatus } from "../utils/formatting";
import { createVelaClient } from "../../src/client";
import { VelaError } from "../../src/errors/base";

/**
 * Registers the `vela pull` command (CLI-03).
 *
 * Executes a pull payment against a mandate. Pull execution is permissionless --
 * any payer can submit the transaction as long as mandate conditions are met.
 */
export function registerPull(parent: Command): void {
  parent
    .command("pull <mandate-address>")
    .description("Execute a pull payment")
    .requiredOption(
      "--subscriber <address>",
      "Subscriber public key",
    )
    .requiredOption(
      "--merchant <address>",
      "Merchant public key",
    )
    .requiredOption(
      "--plan <address>",
      "Plan public key",
    )
    .requiredOption(
      "--usdc-mint <address>",
      "USDC mint address",
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
        const merchantAddress = new PublicKey(opts.merchant);
        const planAddress = new PublicKey(opts.plan);
        const usdcMintAddress = new PublicKey(opts.usdcMint);

        console.log("\nExecuting pull payment...\n");

        const result = await vela.pullPayment({
          mandateAddress,
          subscriberAddress,
          merchantAddress,
          planAddress,
          usdcMintAddress,
        });

        console.log("Pull payment executed successfully!\n");
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
          console.error("\nAn unexpected error occurred. Use --verbose for details.");
        }
        process.exit(1);
      }
    });
}
