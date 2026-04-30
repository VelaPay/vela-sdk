import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import { deserializeMandate } from "../../src/accounts/deserialize";
import { VelaError } from "../../src/errors/base";
import { velaProgramIdl } from "../../src/idl";
import { createConnection } from "../utils/connection";
import { formatMandateStatus } from "../utils/formatting";

/**
 * Registers the `vela status` command (CLI-06, D-09).
 *
 * Fetches a mandate account by address and displays its state
 * in human-readable format. No wallet needed -- this is a read-only operation.
 */
export function registerStatus(parent: Command): void {
  parent
    .command("status <mandate-address>")
    .description("Show mandate status and details")
    .action(async (mandateAddressStr: string) => {
      try {
        const parentOpts = parent.opts();
        const connection = createConnection(parentOpts.url);

        // Create a read-only provider (no wallet needed for fetching)
        const provider = new AnchorProvider(
          connection,
          {
            publicKey: PublicKey.default,
            signTransaction: async (tx: any) => tx,
            signAllTransactions: async (txs: any) => txs,
          } as any,
          { commitment: "confirmed" },
        );
        const program = new Program(velaProgramIdl as any, provider);

        const mandateAddress = new PublicKey(mandateAddressStr);

        console.log("\nFetching mandate status...\n");

        const raw = await (program.account as any).velaMandate.fetch(
          mandateAddress,
        );
        const mandate = deserializeMandate(mandateAddress, raw);

        console.log(formatMandateStatus(mandate));
        console.log("");
      } catch (err) {
        if (err instanceof VelaError) {
          console.error(`\nError [${err.name}]: ${err.message}`);
        } else if (err instanceof Error) {
          if (err.message.includes("Account does not exist")) {
            console.error(`\nError: Mandate not found at ${mandateAddressStr}`);
            console.error(
              "Check that the address is correct and the mandate has been created.",
            );
          } else {
            console.error(`\nError: ${err.message}`);
          }
        } else {
          console.error(
            "\nAn unexpected error occurred. Use --verbose for details.",
          );
        }
        process.exit(1);
      }
    });
}
