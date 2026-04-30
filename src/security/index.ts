export type AdvisoryRisk = "direct-fixed" | "transitive-upstream";

export interface VelaSecurityAdvisory {
  packageName: string;
  advisory: string;
  severity: "moderate" | "high";
  via: string;
  status: AdvisoryRisk;
  mitigation: string;
}

export const VELA_SECURITY_ADVISORIES = [
  {
    packageName: "hono",
    advisory: "GHSA-458j-xx4x-4375",
    severity: "moderate",
    via: "direct dependency",
    status: "direct-fixed",
    mitigation: "SDK requires hono >=4.12.15.",
  },
  {
    packageName: "bigint-buffer",
    advisory: "GHSA-3gc7-fjrx-p6mg",
    severity: "high",
    via: "@solana/spl-token -> @solana/buffer-layout-utils",
    status: "transitive-upstream",
    mitigation:
      "No patched bigint-buffer release exists. The SDK does not call bigint-buffer directly; monitor @solana/spl-token for an upstream replacement.",
  },
  {
    packageName: "uuid",
    advisory: "GHSA-w5hq-g745-h8pq",
    severity: "moderate",
    via: "@solana/web3.js -> rpc-websockets",
    status: "transitive-upstream",
    mitigation:
      "Anchor-compatible @solana/web3.js v1 still carries this path. The SDK does not call uuid v3/v5/v6 with caller-supplied buffers.",
  },
] as const satisfies readonly VelaSecurityAdvisory[];

export function getSecurityPosture(): readonly VelaSecurityAdvisory[] {
  return VELA_SECURITY_ADVISORIES;
}

export function getAllowedAuditResiduals(): readonly string[] {
  return VELA_SECURITY_ADVISORIES.filter(
    (entry) => entry.status === "transitive-upstream",
  ).map((entry) => entry.packageName);
}
