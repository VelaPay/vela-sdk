import type { Command } from "commander";
import {
  createReadOnlyConnection,
  getStreamCliRuntime,
  handleCliError,
  parsePublicKey,
  printStreamStatusResult,
} from "./shared";

export function registerStreamStatus(parent: Command): void {
  parent
    .command("status <mandate>")
    .description("Show stream mandate status and accounting details")
    .action(async (mandateValue: string, _opts, command: Command) => {
      try {
        const { globalOpts, connection } = createReadOnlyConnection(command);
        const mandateAddress = parsePublicKey(mandateValue, "mandate");
        const mandate = await getStreamCliRuntime().fetchStreamMandate(
          connection,
          mandateAddress,
        );

        printStreamStatusResult({ mandate }, globalOpts.json);
      } catch (err) {
        handleCliError(err);
      }
    });
}
