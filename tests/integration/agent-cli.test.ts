import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createCliProgram } from "../../cli/index";
import { setConfirmActionImplementation } from "../../cli/utils/confirm";
import { DEFAULT_KEYPAIR_PATH, resolveKeypairPath } from "../../cli/utils/keypair";
import { renderOutput } from "../../cli/utils/output";
import { setCliVelaClientFactory } from "../../cli/utils/sdk";
import type {
  AgentBudgetSummary,
  AgentMandate,
  AgentMandateDrainResult,
  AgentMandateMethodResult,
  AgentMandateRevokeResult,
} from "../../src/types";

let budgetSummaryFixture: AgentBudgetSummary;
let mandateListFixture: AgentMandate[];
let methodResultFixture: AgentMandateMethodResult;
let drainResultFixture: AgentMandateDrainResult;
let revokeResultFixture: AgentMandateRevokeResult;
const confirmActionMock = mock(async (_prompt: string, _opts?: unknown) => true);
const mockClient = {
  checkAgentBudget: mock(async (_params: unknown) => budgetSummaryFixture),
  listAgentMandates: mock(async (_authority?: unknown) => mandateListFixture),
  createAgentMandate: mock(async (_params: unknown) => methodResultFixture),
  agentPull: mock(async (_params: unknown) => methodResultFixture),
  pauseAgentMandate: mock(async (_params: unknown) => methodResultFixture),
  resumeAgentMandate: mock(async (_params: unknown) => methodResultFixture),
  adjustAgentMandate: mock(async (_params: unknown) => methodResultFixture),
  topUpAgentMandate: mock(async (_params: unknown) => methodResultFixture),
  revokeAgentMandate: mock(async (_params: unknown) => revokeResultFixture),
  drainAgentMandate: mock(async (_params: unknown) => drainResultFixture),
};
const createVelaClientMock = mock(() => mockClient as any);

function writeKeypairFile(directory: string, name: string): Keypair {
  const keypair = Keypair.generate();
  writeFileSync(
    join(directory, name),
    JSON.stringify(Array.from(keypair.secretKey)),
    "utf8",
  );
  return keypair;
}

function createAgentMandate(
  authority: PublicKey,
  agent: PublicKey,
  service: PublicKey,
): AgentMandate {
  return {
    address: Keypair.generate().publicKey,
    authority,
    agent,
    dailyLimit: 50_000_000n,
    dailySpent: 5_000_000n,
    dailyLastReset: 1_700_000_000n,
    lifetimeCap: 500_000_000n,
    totalSpent: 25_000_000n,
    minPullAmount: 1_000_000n,
    minPullInterval: 3_600n,
    lastPullAt: 1_700_000_100n,
    status: "active",
    services: [
      {
        service,
        dailyLimit: 15_000_000n,
        dailySpent: 2_500_000n,
        lastReset: 1_700_000_000n,
      },
    ],
    bump: 255,
  };
}

async function captureOutput(
  run: () => Promise<unknown>,
): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };

  try {
    await run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return {
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
  };
}

describe("agent mandate CLI", () => {
  let tempDir: string;
  let cliKeypair: Keypair;
  let envKeypair: Keypair;
  let explicitKeypair: Keypair;
  let agent: PublicKey;
  let service: PublicKey;
  let originalKeypairEnv: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "vela-agent-cli-"));
    cliKeypair = writeKeypairFile(tempDir, "cli.json");
    envKeypair = writeKeypairFile(tempDir, "env.json");
    explicitKeypair = writeKeypairFile(tempDir, "explicit.json");
    agent = Keypair.generate().publicKey;
    service = Keypair.generate().publicKey;
    budgetSummaryFixture = {
      mandate: createAgentMandate(cliKeypair.publicKey, agent, service),
      status: "active",
      mandateBalance: 120_000_000n,
      globalRemaining: 45_000_000n,
      serviceRemaining: 12_500_000n,
      dailyResetAt: 1_700_086_400n,
      serviceResetAt: 1_700_086_400n,
      serviceAuthorized: true,
      funded: true,
    };
    mandateListFixture = [budgetSummaryFixture.mandate];
    methodResultFixture = {
      signature: "sig-agent-cli",
      address: budgetSummaryFixture.mandate.address,
      data: budgetSummaryFixture.mandate,
    };
    drainResultFixture = {
      ...methodResultFixture,
      drainedAmount: 4_500_000n,
    };
    revokeResultFixture = {
      ...methodResultFixture,
      reclaimedAmount: 2_500_000n,
    };
    createVelaClientMock.mockClear();
    confirmActionMock.mockClear();
    mockClient.checkAgentBudget.mockClear();
    mockClient.listAgentMandates.mockClear();
    mockClient.createAgentMandate.mockClear();
    mockClient.agentPull.mockClear();
    mockClient.pauseAgentMandate.mockClear();
    mockClient.resumeAgentMandate.mockClear();
    mockClient.adjustAgentMandate.mockClear();
    mockClient.topUpAgentMandate.mockClear();
    mockClient.revokeAgentMandate.mockClear();
    mockClient.drainAgentMandate.mockClear();
    setCliVelaClientFactory(createVelaClientMock as any);
    setConfirmActionImplementation(confirmActionMock as any);
    originalKeypairEnv = process.env.KEYPAIR;
    delete process.env.KEYPAIR;
  });

  afterEach(() => {
    if (originalKeypairEnv == null) {
      delete process.env.KEYPAIR;
    } else {
      process.env.KEYPAIR = originalKeypairEnv;
    }
    rmSync(tempDir, { recursive: true, force: true });
    setCliVelaClientFactory(null);
    setConfirmActionImplementation(null);
  });

  test("KEYPAIR resolution prefers explicit path, then env, then Solana default", () => {
    process.env.KEYPAIR = join(tempDir, "env.json");
    expect(resolveKeypairPath(join(tempDir, "explicit.json"))).toBe(
      join(tempDir, "explicit.json"),
    );
    expect(resolveKeypairPath()).toBe(join(tempDir, "env.json"));
    delete process.env.KEYPAIR;
    expect(resolveKeypairPath()).toBe(DEFAULT_KEYPAIR_PATH);
  });

  test("agent-mandate help shows inspection commands", async () => {
    const program = createCliProgram();
    const agentMandateCommand = program.commands.find(
      (command) => command.name() === "agent-mandate",
    );
    const output = agentMandateCommand?.helpInformation() ?? "";

    expect(output).toContain("status");
    expect(output).toContain("list");
    expect(output).toContain("create");
    expect(output).toContain("revoke");
  });

  test("shared output helper renders human and JSON from one data shape", () => {
    const renderedHuman = renderOutput(
      {
        amount: 12_500_000n,
        authority: cliKeypair.publicKey,
      },
      {
        formatHuman: () => "human output",
      },
    );
    const renderedJson = renderOutput(
      {
        amount: 12_500_000n,
        authority: cliKeypair.publicKey,
      },
      {
        json: true,
        formatHuman: () => "unused",
      },
    );

    expect(renderedHuman).toBe("human output");
    expect(JSON.parse(renderedJson)).toEqual({
      amount: "12500000",
      authority: cliKeypair.publicKey.toBase58(),
    });
  });

  test("agent-mandate status prints human output by default", async () => {
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "status",
          "--agent",
          agent.toBase58(),
          "--service",
          service.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.checkAgentBudget).toHaveBeenCalledTimes(1);
    expect(mockClient.checkAgentBudget).toHaveBeenCalledWith({
      authority: cliKeypair.publicKey,
      agent,
      service,
      wrappedUsdcMint: undefined,
    });
    expect(stdout).toContain("Mandate:");
    expect(stdout).toContain("Daily Remaining:");
    expect(stdout).toContain("Lifetime Remaining:");
    expect(stdout).toContain(service.toBase58());
  });

  test("agent-mandate status emits JSON with --json", async () => {
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "--json",
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "status",
          "--agent",
          agent.toBase58(),
        ],
        { from: "user" },
      ),
    );

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("active");
    expect(parsed.globalRemaining).toBe("45000000");
    expect(parsed.mandate.agent).toBe(agent.toBase58());
  });

  test("agent-mandate list defaults to the current authority and prints a human table", async () => {
    process.env.KEYPAIR = join(tempDir, "env.json");
    mandateListFixture = [
      createAgentMandate(envKeypair.publicKey, agent, service),
      createAgentMandate(
        envKeypair.publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ),
    ];
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["agent-mandate", "list"], { from: "user" }),
    );

    expect(mockClient.listAgentMandates).toHaveBeenCalledTimes(1);
    expect(mockClient.listAgentMandates).toHaveBeenCalledWith(envKeypair.publicKey);
    expect(stdout).toContain("MANDATE");
    expect(stdout).toContain("STATUS");
    expect(stdout).toContain("SERVICES");
  });

  test("agent-mandate list emits JSON with --json", async () => {
    mandateListFixture = [createAgentMandate(explicitKeypair.publicKey, agent, service)];
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "--json",
          "-k",
          join(tempDir, "explicit.json"),
          "agent-mandate",
          "list",
        ],
        { from: "user" },
      ),
    );

    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].authority).toBe(explicitKeypair.publicKey.toBase58());
    expect(parsed[0].agent).toBe(agent.toBase58());
  });

  test("agent-mandate create parses flags into createAgentMandate params", async () => {
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "create",
          "--agent",
          agent.toBase58(),
          "--spl-usdc-mint",
          Keypair.generate().publicKey.toBase58(),
          "--daily-limit",
          "25",
          "--cap",
          "250",
          "--services",
          `${service.toBase58()},${Keypair.generate().publicKey.toBase58()}`,
          "--service-limits",
          "5,7.5",
          "--min-pull-amount",
          "0.25",
          "--min-pull-interval",
          "3600",
          "--funded-amount",
          "12.75",
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.createAgentMandate).toHaveBeenCalledTimes(1);
    expect(mockClient.createAgentMandate).toHaveBeenCalledWith({
      agent,
      splUsdcMint: expect.any(PublicKey),
      wrappedUsdcMint: undefined,
      wrappingVault: undefined,
      dailyLimit: 25_000_000n,
      lifetimeCap: 250_000_000n,
      minPullAmount: 250_000n,
      minPullInterval: 3_600n,
      services: [
        { service, dailyLimit: 5_000_000n },
        { service: expect.any(PublicKey), dailyLimit: 7_500_000n },
      ],
      fundedAmount: 12_750_000n,
    });
    expect(stdout).toContain("Transaction: sig-agent-cli");
  });

  test("agent-mandate create fails fast on mismatched service limits", async () => {
    const program = createCliProgram();
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit;
    let exitError = "";
    let stderr = "";

    try {
      ({ stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync(
            [
              "-k",
              join(tempDir, "cli.json"),
              "agent-mandate",
              "create",
              "--agent",
              agent.toBase58(),
              "--spl-usdc-mint",
              Keypair.generate().publicKey.toBase58(),
              "--daily-limit",
              "25",
              "--cap",
              "250",
              "--services",
              `${service.toBase58()},${Keypair.generate().publicKey.toBase58()}`,
              "--service-limits",
              "5",
              "--min-pull-amount",
              "0.25",
              "--min-pull-interval",
              "3600",
              "--funded-amount",
              "12.75",
            ],
            { from: "user" },
          );
        } catch (err) {
          exitError = String(err);
        }
      }));
      expect(stderr).toContain(
        "The number of --services entries must match the number of --service-limits entries.",
      );
      expect(exitError).toContain("process.exit:1");
    } finally {
      process.exit = originalExit;
    }

    expect(mockClient.createAgentMandate).toHaveBeenCalledTimes(0);
  });

  test("agent-pull invokes client.agentPull and prints the signature", async () => {
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-pull",
          "--mandate",
          budgetSummaryFixture.mandate.address.toBase58(),
          "--authority",
          cliKeypair.publicKey.toBase58(),
          "--service",
          Keypair.generate().publicKey.toBase58(),
          "--amount",
          "3.5",
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.agentPull).toHaveBeenCalledTimes(1);
    expect(mockClient.agentPull).toHaveBeenCalledWith({
      mandateAddress: budgetSummaryFixture.mandate.address,
      authority: cliKeypair.publicKey,
      serviceWrappedAccount: expect.any(PublicKey),
      amount: 3_500_000n,
      wrappedUsdcMint: undefined,
      wrappingVault: undefined,
    });
    expect(stdout).toContain("Transaction: sig-agent-cli");
  });

  test("pause and resume map directly to the client methods", async () => {
    const program = createCliProgram();

    await captureOutput(() =>
      program.parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "pause",
          "--agent",
          agent.toBase58(),
        ],
        { from: "user" },
      ),
    );

    await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "resume",
          "--agent",
          agent.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.pauseAgentMandate).toHaveBeenCalledWith({ agent });
    expect(mockClient.resumeAgentMandate).toHaveBeenCalledWith({ agent });
  });

  test("adjust rejects empty updates and forwards partial updates", async () => {
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit;
    let exitError = "";

    try {
      await captureOutput(async () => {
        try {
          await createCliProgram().parseAsync(
            [
              "-k",
              join(tempDir, "cli.json"),
              "agent-mandate",
              "adjust",
              "--agent",
              agent.toBase58(),
            ],
            { from: "user" },
          );
        } catch (err) {
          exitError = String(err);
        }
      });
    } finally {
      process.exit = originalExit;
    }

    expect(exitError).toContain("process.exit:1");
    expect(mockClient.adjustAgentMandate).toHaveBeenCalledTimes(0);

    await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "adjust",
          "--agent",
          agent.toBase58(),
          "--cap",
          "300",
          "--min-pull-interval",
          "7200",
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.adjustAgentMandate).toHaveBeenCalledWith({
      agent,
      dailyLimit: undefined,
      lifetimeCap: 300_000_000n,
      minPullAmount: undefined,
      minPullInterval: 7_200n,
      services: undefined,
      wrappedUsdcMint: undefined,
    });
  });

  test("top-up maps to client.topUpAgentMandate and preserves JSON output", async () => {
    const program = createCliProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(
        [
          "--json",
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "top-up",
          "--agent",
          agent.toBase58(),
          "--amount",
          "4.25",
          "--spl-usdc-mint",
          Keypair.generate().publicKey.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(mockClient.topUpAgentMandate).toHaveBeenCalledWith({
      agent,
      amount: 4_250_000n,
      splUsdcMint: expect.any(PublicKey),
      wrappedUsdcMint: undefined,
      wrappingVault: undefined,
    });
    expect(JSON.parse(stdout).signature).toBe("sig-agent-cli");
  });

  test("revoke and drain prompt by default and bypass with --yes", async () => {
    confirmActionMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "revoke",
          "--agent",
          agent.toBase58(),
          "--spl-usdc-mint",
          Keypair.generate().publicKey.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(confirmActionMock).toHaveBeenCalledTimes(1);
    expect(mockClient.revokeAgentMandate).toHaveBeenCalledTimes(0);

    const { stdout } = await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "--json",
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "revoke",
          "--agent",
          agent.toBase58(),
          "--spl-usdc-mint",
          Keypair.generate().publicKey.toBase58(),
          "--yes",
        ],
        { from: "user" },
      ),
    );

    expect(confirmActionMock).toHaveBeenCalledTimes(1);
    expect(mockClient.revokeAgentMandate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout).reclaimedAmount).toBe("2500000");

    await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "agent-mandate",
          "drain",
          "--agent",
          agent.toBase58(),
          "--spl-usdc-mint",
          Keypair.generate().publicKey.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(confirmActionMock).toHaveBeenCalledTimes(2);
    expect(mockClient.drainAgentMandate).toHaveBeenCalledTimes(1);
  });
});
