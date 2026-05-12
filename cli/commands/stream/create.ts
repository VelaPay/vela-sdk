import type { Command } from "commander";
import {
  createStreamWriteContext,
  handleCliError,
  parseOptionalUint,
  parsePublicKey,
  parseSettleInterval,
  parseUint,
  printStreamWriteResult,
} from "./shared";

export function registerStreamCreate(parent: Command): void {
  parent
    .command("create")
    .description("Create a per-second stream mandate")
    .requiredOption("--merchant <address>", "Merchant public key")
    .requiredOption("--mint <address>", "Token-2022 billing mint")
    .requiredOption(
      "--rate-per-second <amount>",
      "Stream rate in raw token base units per second",
    )
    .requiredOption(
      "--authorized-max-rate <amount>",
      "Maximum authorized stream rate in raw token base units per second",
    )
    .requiredOption(
      "--min-settle-interval <seconds>",
      "Minimum seconds between settlements",
    )
    .option("--max-streamed <amount>", "Optional cap in raw token base units")
    .action(async (opts, command: Command) => {
      try {
        const { globalOpts, keypair, connection, runtime } =
          await createStreamWriteContext(command);
        const instruction = await runtime.buildCreateStreamMandateInstruction({
          connection,
          subscriber: keypair.publicKey,
          merchant: parsePublicKey(opts.merchant, "merchant"),
          mint: parsePublicKey(opts.mint, "mint"),
          ratePerSecond: parseUint(opts.ratePerSecond, "rate-per-second"),
          authorizedMaxRate: parseUint(
            opts.authorizedMaxRate,
            "authorized-max-rate",
          ),
          maxStreamed: parseOptionalUint(opts.maxStreamed, "max-streamed"),
          minSettleInterval: parseSettleInterval(opts.minSettleInterval),
        });
        const mandate = instruction.keys[2]?.pubkey;
        if (!mandate) {
          throw new Error(
            "Create stream instruction did not include mandate PDA",
          );
        }
        const signature = await runtime.sendInstruction(
          connection,
          keypair,
          instruction,
        );

        printStreamWriteResult(
          { signature, mandate, action: "create" },
          globalOpts.json,
        );
      } catch (err) {
        handleCliError(err);
      }
    });
}
