import { Command } from "commander";
import { registerAgentMandateAdjust } from "./commands/agent-mandate/adjust";
import { registerAgentMandateCreate } from "./commands/agent-mandate/create";
import { registerAgentMandateDrain } from "./commands/agent-mandate/drain";
import { registerAgentMandateList } from "./commands/agent-mandate/list";
import { registerAgentMandatePause } from "./commands/agent-mandate/pause";
import { registerAgentMandateResume } from "./commands/agent-mandate/resume";
import { registerAgentMandateRevoke } from "./commands/agent-mandate/revoke";
import { registerAgentMandateStatus } from "./commands/agent-mandate/status";
import { registerAgentMandateTopUp } from "./commands/agent-mandate/top-up";
import { registerAgentPull } from "./commands/agent-pull";
import { registerCancel } from "./commands/cancel";
import { registerCreatePlan } from "./commands/create-plan";
import { registerPull } from "./commands/pull";
import { registerSimulate } from "./commands/simulate";
import { registerStatus } from "./commands/status";
import { registerStream } from "./commands/stream";
import { registerSubscribe } from "./commands/subscribe";

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("vela")
    .description("VelaPay CLI - Subscription billing on Solana")
    .version("0.1.3");

  // Global options available to all subcommands
  program.option("-k, --keypair <path>", "Path to Solana keypair file");
  program.option("-u, --url <url>", "Solana RPC URL (default: devnet)");
  program.option("--json", "Emit structured JSON output for scripts");

  registerCreatePlan(program);
  registerSubscribe(program);
  registerPull(program);
  registerAgentPull(program);
  registerCancel(program);
  registerSimulate(program);
  registerStatus(program);
  registerStream(program);

  const agentMandate = program
    .command("agent-mandate")
    .description("Inspect and manage agent mandates");

  registerAgentMandateStatus(agentMandate);
  registerAgentMandateList(agentMandate);
  registerAgentMandateCreate(agentMandate);
  registerAgentMandatePause(agentMandate);
  registerAgentMandateResume(agentMandate);
  registerAgentMandateAdjust(agentMandate);
  registerAgentMandateTopUp(agentMandate);
  registerAgentMandateRevoke(agentMandate);
  registerAgentMandateDrain(agentMandate);

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createCliProgram().parseAsync(argv);
}

if (import.meta.main) {
  void runCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
