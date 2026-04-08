import { createVelaClient } from "../../src/client";

type CliVelaClientFactory = typeof createVelaClient;

let cliVelaClientFactory: CliVelaClientFactory = createVelaClient;

export function setCliVelaClientFactory(
  factory: CliVelaClientFactory | null,
): void {
  cliVelaClientFactory = factory ?? createVelaClient;
}

export function createCliVelaClient(
  ...args: Parameters<typeof createVelaClient>
): ReturnType<typeof createVelaClient> {
  return cliVelaClientFactory(...args);
}
