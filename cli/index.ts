import { Command } from "commander";
import { registerCancel } from "./commands/cancel";
import { registerCreatePlan } from "./commands/create-plan";
import { registerPull } from "./commands/pull";
import { registerSimulate } from "./commands/simulate";
import { registerStatus } from "./commands/status";
import { registerSubscribe } from "./commands/subscribe";

const program = new Command();

program
  .name("vela")
  .description("VelaPay CLI - Subscription billing on Solana")
  .version("0.1.0");

// Global options available to all subcommands
program.option("-k, --keypair <path>", "Path to Solana keypair file");
program.option("-u, --url <url>", "Solana RPC URL (default: devnet)");

registerCreatePlan(program);
registerSubscribe(program);
registerPull(program);
registerCancel(program);
registerSimulate(program);
registerStatus(program);

program.parse();
