import { Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import { VelaError } from "../../../src/errors/base";
import { createConnection } from "../../utils/connection";
import { formatAgentMandateBudget } from "../../utils/formatting";
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

export function registerAgentMandateStatus(parent: Command): void {
  parent
    .command("status")
    .description("Show agent-mandate budget, balance, and service status")
    .requiredOption("--agent <address>", "Agent authority public key")
    .option("--authority <address>", "Mandate authority public key")
    .option("--service <address>", "Authorized service public key to inspect")
    .option(
      "--wrapped-usdc-mint <address>",
      "Wrapped USDC mint address when protocol config lookup should be skipped",
    )
    .action(async (opts, command: Command) => {
      try {
        const globalOpts = getGlobalOptions(command);
        const keypair = await loadKeypair(globalOpts.keypair);
        const authority = opts.authority
          ? new PublicKey(opts.authority)
          : keypair.publicKey;
        const agent = new PublicKey(opts.agent);
        const service = opts.service ? new PublicKey(opts.service) : undefined;
        const wrappedUsdcMint = opts.wrappedUsdcMint
          ? new PublicKey(opts.wrappedUsdcMint)
          : undefined;
        const connection = createConnection(globalOpts.url);
        const wallet = new Wallet(keypair);
        const vela = createCliVelaClient({
          connection,
          wallet: wallet as any,
        });
        const summary = await vela.checkAgentBudget({
          authority,
          agent,
          service,
          wrappedUsdcMint,
        });

        printOutput(summary, {
          json: globalOpts.json,
          formatHuman: (value) => formatAgentMandateBudget(value, service),
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
