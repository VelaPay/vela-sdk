import { existsSync } from "node:fs";
import { resolve } from "node:path";

function uniqueCandidates(paths: string[]): string[] {
  return [...new Set(paths)];
}

function firstExisting(paths: string[]): string | null {
  return paths.find((path) => existsSync(path)) ?? null;
}

const PROTOCOL_ROOT_CANDIDATES = uniqueCandidates([
  resolve(process.cwd(), "../vela-protocol"),
  resolve(import.meta.dir, "../../../vela-protocol"),
  "/Users/laitsky/Developments/vela-labs/vela-protocol",
]);

function candidatePaths(relativePath: string): string[] {
  return PROTOCOL_ROOT_CANDIDATES.map((root) => resolve(root, relativePath));
}

export const PROGRAM_SO_CANDIDATES = candidatePaths("target/deploy/vela_protocol.so");
export const TRANSFER_HOOK_SO_CANDIDATES = candidatePaths(
  "target/deploy/vela_transfer_hook.so",
);
export const PROTOCOL_IDL_CANDIDATES = candidatePaths("target/idl/vela_protocol.json");
export const TRANSFER_HOOK_IDL_CANDIDATES = candidatePaths(
  "target/idl/vela_transfer_hook.json",
);

export function findProtocolProgramSo(): string | null {
  return firstExisting(PROGRAM_SO_CANDIDATES);
}

export function findProtocolHookSo(): string | null {
  return firstExisting(TRANSFER_HOOK_SO_CANDIDATES);
}

export function findProtocolIdl(): string | null {
  return firstExisting(PROTOCOL_IDL_CANDIDATES);
}

export function findTransferHookIdl(): string | null {
  return firstExisting(TRANSFER_HOOK_IDL_CANDIDATES);
}

export function hasProtocolBuildArtifacts(): boolean {
  return findProtocolProgramSo() !== null && findProtocolHookSo() !== null;
}

export function hasProtocolIdlArtifacts(): boolean {
  return findProtocolIdl() !== null && findTransferHookIdl() !== null;
}

export function requireProtocolProgramSo(): string {
  const path = findProtocolProgramSo();
  if (path) {
    return path;
  }
  throw new Error(
    `vela_protocol.so not found. Tried: ${PROGRAM_SO_CANDIDATES.join(", ")}`,
  );
}

export function requireProtocolHookSo(): string {
  const path = findProtocolHookSo();
  if (path) {
    return path;
  }
  throw new Error(
    `vela_transfer_hook.so not found. Tried: ${TRANSFER_HOOK_SO_CANDIDATES.join(", ")}`,
  );
}

export function requireProtocolIdl(): string {
  const path = findProtocolIdl();
  if (path) {
    return path;
  }
  throw new Error(
    `vela_protocol.json not found. Tried: ${PROTOCOL_IDL_CANDIDATES.join(", ")}`,
  );
}

export function requireTransferHookIdl(): string {
  const path = findTransferHookIdl();
  if (path) {
    return path;
  }
  throw new Error(
    `vela_transfer_hook.json not found. Tried: ${TRANSFER_HOOK_IDL_CANDIDATES.join(", ")}`,
  );
}
