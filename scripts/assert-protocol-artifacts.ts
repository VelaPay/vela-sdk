import {
  PROGRAM_SO_CANDIDATES,
  PROTOCOL_IDL_CANDIDATES,
  TRANSFER_HOOK_IDL_CANDIDATES,
  TRANSFER_HOOK_SO_CANDIDATES,
  hasProtocolBuildArtifacts,
  hasProtocolIdlArtifacts,
} from "../tests/helpers/protocol-artifacts";

function renderCandidates(label: string, candidates: string[]): string {
  return `${label}:\n${candidates.map((path) => `  - ${path}`).join("\n")}`;
}

if (!hasProtocolBuildArtifacts() || !hasProtocolIdlArtifacts()) {
  console.error(
    [
      "Protocol build artifacts are required for production-grade SDK verification.",
      "Build the sibling vela-protocol repo first, then rerun `bun run test:protocol`.",
      "",
      renderCandidates("Program .so", PROGRAM_SO_CANDIDATES),
      "",
      renderCandidates("Transfer-hook .so", TRANSFER_HOOK_SO_CANDIDATES),
      "",
      renderCandidates("Program IDL", PROTOCOL_IDL_CANDIDATES),
      "",
      renderCandidates("Transfer-hook IDL", TRANSFER_HOOK_IDL_CANDIDATES),
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Protocol build artifacts detected.");
