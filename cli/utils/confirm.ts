import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

type ConfirmAction = typeof defaultConfirmAction;

let confirmActionImpl: ConfirmAction = defaultConfirmAction;

export function setConfirmActionImplementation(
  implementation: ConfirmAction | null,
): void {
  confirmActionImpl = implementation ?? defaultConfirmAction;
}

async function defaultConfirmAction(
  prompt: string,
  options: {
    yes?: boolean;
    input?: Readable;
    output?: Writable;
  } = {},
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  const rl = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
  });

  try {
    const answer = (await rl.question(`${prompt} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function confirmAction(
  prompt: string,
  options: {
    yes?: boolean;
    input?: Readable;
    output?: Writable;
  } = {},
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  return confirmActionImpl(prompt, options);
}
