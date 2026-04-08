import type { Command } from "commander";
import { confirmAction } from "../../utils/confirm";
import {
  createCliContext,
  handleCliError,
  parseOptionalPublicKey,
  parsePublicKey,
  printAgentMandateWriteResult,
} from "./shared";

export function registerAgentMandateDrain(parent: Command): void {
  parent
    .command("drain")
    .description("Drain remaining wrapped funds from an active agent mandate")
    .requiredOption("--agent <address>", "Agent authority public key")
    .requiredOption("--spl-usdc-mint <address>", "Source SPL USDC mint")
    .option(
      "--authority-usdc-account <address>",
      "Destination SPL USDC account for drained funds",
    )
    .option("--wrapped-usdc-mint <address>", "Wrapped USDC mint override")
    .option("--wrapping-vault <address>", "Wrapping vault override")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const agent = parsePublicKey(opts.agent, "agent");
        const confirmed = await confirmAction(
          `Drain agent mandate for ${agent.toBase58()}?`,
          { yes: opts.yes },
        );

        if (!confirmed) {
          console.log("Cancelled.");
          return;
        }

        const result = await vela.drainAgentMandate({
          agent,
          splUsdcMint: parsePublicKey(opts.splUsdcMint, "spl-usdc-mint"),
          authorityUsdcAccount: parseOptionalPublicKey(
            opts.authorityUsdcAccount,
            "authority-usdc-account",
          ),
          wrappedUsdcMint: parseOptionalPublicKey(
            opts.wrappedUsdcMint,
            "wrapped-usdc-mint",
          ),
          wrappingVault: parseOptionalPublicKey(
            opts.wrappingVault,
            "wrapping-vault",
          ),
        });

        printAgentMandateWriteResult(
          "Agent mandate drained",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
