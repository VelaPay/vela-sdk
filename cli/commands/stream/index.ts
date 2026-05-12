import type { Command } from "commander";
import { registerStreamCreate } from "./create";
import { registerStreamLifecycle } from "./lifecycle";
import { registerStreamSettle } from "./settle";
import { registerStreamStatus } from "./status";

export function registerStream(parent: Command): void {
  const stream = parent
    .command("stream")
    .description("Create, settle, pause, resume, cancel, and inspect streams");

  registerStreamCreate(stream);
  registerStreamSettle(stream);
  registerStreamLifecycle(stream);
  registerStreamStatus(stream);
}
