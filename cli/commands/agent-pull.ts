import type { Command } from "commander";
import {
  createCliContext,
  fetchAgentMandateByAddress,
  handleCliError,
  parseOptionalPublicKey,
  parsePublicKey,
  parseUsdcAmount,
  printAgentMandateWriteResult,
} from "./agent-mandate/shared";

export function registerAgentPull(parent: Command): void {
  parent
    .command("agent-pull")
    .description("Execute an agent-authorized pull payment")
    .requiredOption("--mandate <address>", "Agent mandate address")
    .requiredOption(
      "--service <address>",
      "Destination wrapped token account controlled by the service",
    )
    .requiredOption("--amount <amount>", "Pull amount in USDC")
    .option(
      "--authority <address>",
      "Mandate authority pubkey (otherwise fetched from the mandate account)",
    )
    .option("--wrapped-usdc-mint <address>", "Wrapped USDC mint override")
    .option("--wrapping-vault <address>", "Wrapping vault override")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, connection, vela } = await createCliContext(command);
        const mandateAddress = parsePublicKey(opts.mandate, "mandate");
        const authority =
          opts.authority == null
            ? (await fetchAgentMandateByAddress(connection, mandateAddress))
                .authority
            : parsePublicKey(opts.authority, "authority");
        const result = await vela.agentPull({
          mandateAddress,
          authority,
          serviceWrappedAccount: parsePublicKey(opts.service, "service"),
          amount: parseUsdcAmount(opts.amount, "amount"),
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
          "Agent pull executed",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
