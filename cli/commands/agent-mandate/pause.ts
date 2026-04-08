import type { Command } from "commander";
import {
  createCliContext,
  handleCliError,
  parsePublicKey,
  printAgentMandateWriteResult,
} from "./shared";

export function registerAgentMandatePause(parent: Command): void {
  parent
    .command("pause")
    .description("Pause an agent mandate")
    .requiredOption("--agent <address>", "Agent authority public key")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const result = await vela.pauseAgentMandate({
          agent: parsePublicKey(opts.agent, "agent"),
        });

        printAgentMandateWriteResult(
          "Agent mandate paused",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
