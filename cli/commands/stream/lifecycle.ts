import type { Command } from "commander";
import {
  createStreamWriteContext,
  handleCliError,
  parsePublicKey,
  printStreamWriteResult,
  type StreamWriteResult,
} from "./shared";

type LifecycleAction = Extract<
  StreamWriteResult["action"],
  "pause" | "resume" | "cancel"
>;

export function registerStreamLifecycle(parent: Command): void {
  for (const action of ["pause", "resume", "cancel"] as const) {
    parent
      .command(`${action} <mandate>`)
      .description(`${label(action)} a stream mandate`)
      .action(async (mandateValue: string, _opts, command: Command) => {
        await runLifecycleAction(action, mandateValue, command);
      });
  }
}

async function runLifecycleAction(
  action: LifecycleAction,
  mandateValue: string,
  command: Command,
): Promise<void> {
  try {
    const { globalOpts, keypair, connection, runtime } =
      await createStreamWriteContext(command);
    const mandate = parsePublicKey(mandateValue, "mandate");
    const builder = {
      pause: runtime.buildPauseStreamInstruction,
      resume: runtime.buildResumeStreamInstruction,
      cancel: runtime.buildCancelStreamInstruction,
    }[action];
    const instruction = await builder({
      connection,
      mandate,
      authority: keypair.publicKey,
    });
    const signature = await runtime.sendInstruction(
      connection,
      keypair,
      instruction,
    );

    printStreamWriteResult({ signature, mandate, action }, globalOpts.json);
  } catch (err) {
    handleCliError(err);
  }
}

function label(action: LifecycleAction): string {
  return `${action.slice(0, 1).toUpperCase()}${action.slice(1)}`;
}
