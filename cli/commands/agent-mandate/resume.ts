import type { Command } from "commander";
import {
  createCliContext,
  handleCliError,
  parsePublicKey,
  printAgentMandateWriteResult,
} from "./shared";

export function registerAgentMandateResume(parent: Command): void {
  parent
    .command("resume")
    .description("Resume a paused agent mandate")
    .requiredOption("--agent <address>", "Agent authority public key")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, vela } = await createCliContext(command);
        const result = await vela.resumeAgentMandate({
          agent: parsePublicKey(opts.agent, "agent"),
        });

        printAgentMandateWriteResult(
          "Agent mandate resumed",
          result,
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
