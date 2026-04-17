/**
 * Minimal type declarations for helius-sdk dynamic import.
 *
 * helius-sdk is an optional peer dependency; this declaration file
 * allows TypeScript to resolve the module at compile time without
 * requiring it to be installed.
 */
declare module "helius-sdk" {
  export type HeliusNetwork = "mainnet" | "devnet";

  export interface HeliusClient {
    webhooks: {
      getAll(): Promise<
        Array<{
          webhookID: string;
          webhookURL: string;
          accountAddresses: string[];
          transactionTypes: string[];
          webhookType: string;
          authHeader?: string;
        }>
      >;
      create(request: {
        webhookURL: string;
        accountAddresses: string[];
        transactionTypes: string[];
        webhookType?: string;
        authHeader?: string;
      }): Promise<{
        webhookID: string;
      }>;
    };
  }

  export function createHelius(options: {
    apiKey?: string;
    network?: HeliusNetwork;
    rebateAddress?: string;
    baseUrl?: string;
    userAgent?: string;
  }): HeliusClient;
}
