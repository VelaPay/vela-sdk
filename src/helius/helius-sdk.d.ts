/**
 * Minimal type declarations for helius-sdk dynamic import.
 *
 * helius-sdk is an optional peer dependency; this declaration file
 * allows TypeScript to resolve the module at compile time without
 * requiring it to be installed.
 */
declare module "helius-sdk" {
  import type { Connection } from "@solana/web3.js";

  export class Helius {
    connection: Connection;
    rpc: {
      sendSmartTransaction(serialized: any): Promise<string>;
    };
    constructor(apiKey: string, cluster?: string);
  }
}
