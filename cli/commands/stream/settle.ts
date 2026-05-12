import type { Command } from "commander";
import {
  createStreamWriteContext,
  handleCliError,
  parsePublicKey,
  printStreamWriteResult,
} from "./shared";

export function registerStreamSettle(parent: Command): void {
  parent
    .command("settle <mandate>")
    .description("Settle accrued stream payments")
    .action(async (mandateValue: string, _opts, command: Command) => {
      try {
        const { globalOpts, keypair, connection, runtime } =
          await createStreamWriteContext(command);
        const mandate = parsePublicKey(mandateValue, "mandate");
        const instruction = await runtime.buildExecuteStreamInstruction({
          connection,
          mandate,
          payer: keypair.publicKey,
        });
        const signature = await runtime.sendInstruction(
          connection,
          keypair,
          instruction,
        );

        printStreamWriteResult(
          { signature, mandate, action: "settle" },
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
