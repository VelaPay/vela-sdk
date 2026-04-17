import type { PublicKey } from "@solana/web3.js";
import rawVelaIdl from "../idl/vela_protocol.json";
import { PROGRAM_ID } from "./constants";

type IdlRecord = Record<string, unknown>;

export function withProgramAddress<T extends IdlRecord>(
  idl: T,
  programId: PublicKey = PROGRAM_ID,
): T & { address: string } {
  return {
    ...idl,
    address: programId.toBase58(),
  } as T & { address: string };
}

export const velaProgramIdl = withProgramAddress(rawVelaIdl as IdlRecord);
export { rawVelaIdl };
