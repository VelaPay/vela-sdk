import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import { VelaError } from "../../../src/errors/base";
import { createConnection } from "../../utils/connection";
import { formatAgentMandateList } from "../../utils/formatting";
import { printOutput } from "../../utils/output";
import { loadKeypair } from "../../utils/keypair";
import { createCliVelaClient } from "../../utils/sdk";

type GlobalCliOptions = {
  keypair?: string;
  url?: string;
  json?: boolean;
};

function getGlobalOptions(command: Command): GlobalCliOptions {
  let current: Command | null = command;
  while (current?.parent) {
    current = current.parent;
  }
  return (current?.opts() ?? {}) as GlobalCliOptions;
}

export function registerAgentMandateList(parent: Command): void {
  parent
    .command("list")
    .description("List agent mandates for an authority")
    .option("--authority <address>", "Mandate authority public key")
    .action(async (opts, command: Command) => {
      try {
        const globalOpts = getGlobalOptions(command);
        const keypair = await loadKeypair(globalOpts.keypair);
        const authority = opts.authority
          ? new PublicKey(opts.authority)
          : keypair.publicKey;
        const connection = createConnection(globalOpts.url);
        const wallet = new Wallet(keypair);
        const vela = createCliVelaClient({
          connection,
          wallet: wallet as any,
        });
        const mandates = await vela.listAgentMandates(authority);

        printOutput(mandates, {
          json: globalOpts.json,
          formatHuman: (value) => formatAgentMandateList(value, authority),
        });
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
