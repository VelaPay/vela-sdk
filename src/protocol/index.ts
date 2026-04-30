import { PublicKey } from "@solana/web3.js";
import { DEFAULT_CLUSTER, VELA_PROGRAM_IDS } from "../generated/program-ids";

export type VelaCluster = keyof typeof VELA_PROGRAM_IDS;

export interface VelaProgramIds {
  velaProtocol: string;
  velaTransferHook: string;
}

export interface VelaProtocolCompatibility {
  sdkPackage: "@velapay/sdk";
  sdkVersion: string;
  defaultCluster: VelaCluster;
  supportedClusters: readonly VelaCluster[];
  protocol: {
    name: "vela_protocol";
    idlVersion: string;
    idlSha256: string;
    instructionCount: number;
    accountCount: number;
  };
  transferHook: {
    name: "vela_transfer_hook";
    idlVersion: string;
    idlSha256: string;
    instructionCount: number;
  };
  generatedFrom: {
    protocolRepo: "vela-protocol";
    protocolCommit: string;
  };
  programIds: typeof VELA_PROGRAM_IDS;
}

export const VELA_PROTOCOL_COMPATIBILITY = {
  sdkPackage: "@velapay/sdk",
  sdkVersion: "0.1.0",
  defaultCluster: DEFAULT_CLUSTER,
  supportedClusters: Object.keys(VELA_PROGRAM_IDS) as VelaCluster[],
  protocol: {
    name: "vela_protocol",
    idlVersion: "0.2.0",
    idlSha256:
      "633bda392a12feddd4ccca45302e4e76d161ae26e2e191f656495a199d2cd3f9",
    instructionCount: 49,
    accountCount: 10,
  },
  transferHook: {
    name: "vela_transfer_hook",
    idlVersion: "0.1.0",
    idlSha256:
      "15e13223280fb597547367731e61a5f76bdc0637edf258693d22d80dcd2ff1af",
    instructionCount: 3,
  },
  generatedFrom: {
    protocolRepo: "vela-protocol",
    protocolCommit: "974673f8e3bb394fc225a45b47f8716b252cf24a",
  },
  programIds: VELA_PROGRAM_IDS,
} as const satisfies VelaProtocolCompatibility;

export function getProtocolCompatibility(): VelaProtocolCompatibility {
  return VELA_PROTOCOL_COMPATIBILITY;
}

export function resolveVelaProgramIds(
  cluster: VelaCluster = DEFAULT_CLUSTER,
): VelaProgramIds {
  return VELA_PROGRAM_IDS[cluster];
}

export function resolveVelaProgramPublicKeys(
  cluster: VelaCluster = DEFAULT_CLUSTER,
): { velaProtocol: PublicKey; velaTransferHook: PublicKey } {
  const ids = resolveVelaProgramIds(cluster);
  return {
    velaProtocol: new PublicKey(ids.velaProtocol),
    velaTransferHook: new PublicKey(ids.velaTransferHook),
  };
}

export function assertVelaProtocolCompatibility(params: {
  protocolIdlSha256?: string;
  transferHookIdlSha256?: string;
  protocolProgramId?: string | PublicKey;
  transferHookProgramId?: string | PublicKey;
  cluster?: VelaCluster;
}): void {
  if (
    params.protocolIdlSha256 &&
    params.protocolIdlSha256 !== VELA_PROTOCOL_COMPATIBILITY.protocol.idlSha256
  ) {
    throw new Error("Vela protocol IDL hash does not match this SDK build");
  }
  if (
    params.transferHookIdlSha256 &&
    params.transferHookIdlSha256 !==
      VELA_PROTOCOL_COMPATIBILITY.transferHook.idlSha256
  ) {
    throw new Error(
      "Vela transfer-hook IDL hash does not match this SDK build",
    );
  }

  const ids = resolveVelaProgramIds(params.cluster);
  const protocolProgramId =
    typeof params.protocolProgramId === "string"
      ? params.protocolProgramId
      : params.protocolProgramId?.toBase58();
  const transferHookProgramId =
    typeof params.transferHookProgramId === "string"
      ? params.transferHookProgramId
      : params.transferHookProgramId?.toBase58();

  if (protocolProgramId && protocolProgramId !== ids.velaProtocol) {
    throw new Error("Vela protocol program ID does not match this SDK build");
  }
  if (transferHookProgramId && transferHookProgramId !== ids.velaTransferHook) {
    throw new Error(
      "Vela transfer-hook program ID does not match this SDK build",
    );
  }
}
