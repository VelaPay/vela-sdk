import type { Command } from "commander";
import {
  createCliContext,
  handleCliError,
  parseOptionalPublicKey,
  parsePublicKey,
  parseUsdcAmount,
  printAgentMandateWriteResult,
} from "./shared";

export function registerAgentMandateTopUp(parent: Command): void {
  parent
    .command("top-up")
    .description("Add wrapped funds to an existing agent mandate")
    .requiredOption("--agent <address>", "Agent authority public key")
    .requiredOption("--amount <amount>", "Funding amount in USDC")
    .requiredOption("--spl-usdc-mint <address>", "Source SPL USDC mint")
    .option("--wrapped-usdc-mint <address>", "Wrapped USDC mint override")
    .option("--wrapping-vault <address>", "Wrapping vault override")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const result = await vela.topUpAgentMandate({
          agent: parsePublicKey(opts.agent, "agent"),
          amount: parseUsdcAmount(opts.amount, "amount"),
          splUsdcMint: parsePublicKey(opts.splUsdcMint, "spl-usdc-mint"),
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
          "Agent mandate topped up",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
