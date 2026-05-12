import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Keypair,
  type PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createCliProgram } from "../../cli";
import {
  type StreamCliRuntime,
  setStreamCliRuntimeForTests,
} from "../../cli/commands/stream/shared";
import { setCliVelaClientFactory } from "../../cli/utils/sdk";
import type { StreamMandate } from "../../src/types/stream-mandate";

const createVelaClientMock = mock(() => ({}));
const sendInstructionMock = mock(async () => "sig-stream-cli");
const buildCreateMock = mock(async () => instructionWithMandate());
const buildSettleMock = mock(async () => instructionWithMandate());
const buildPauseMock = mock(async () => instructionWithMandate());
const buildResumeMock = mock(async () => instructionWithMandate());
const buildCancelMock = mock(async () => instructionWithMandate());
const fetchStreamMandateMock = mock(async () => streamMandateFixture);

let streamMandateFixture: StreamMandate;
let expectedMandate: PublicKey;

function writeKeypairFile(directory: string, name: string): Keypair {
  const keypair = Keypair.generate();
  writeFileSync(
    join(directory, name),
    JSON.stringify(Array.from(keypair.secretKey)),
    "utf8",
  );
  return keypair;
}

function instructionWithMandate(): TransactionInstruction {
  return new TransactionInstruction({
    programId: SystemProgram.programId,
    keys: [
      {
        pubkey: Keypair.generate().publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: Keypair.generate().publicKey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: expectedMandate, isSigner: false, isWritable: true },
    ],
    data: Buffer.alloc(0),
  });
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

describe("stream CLI", () => {
  let tempDir: string;
  let keypair: Keypair;
  let merchant: PublicKey;
  let mint: PublicKey;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "vela-stream-cli-"));
    keypair = writeKeypairFile(tempDir, "cli.json");
    merchant = Keypair.generate().publicKey;
    mint = Keypair.generate().publicKey;
    expectedMandate = Keypair.generate().publicKey;
    streamMandateFixture = {
      address: expectedMandate,
      version: 2,
      subscriber: keypair.publicKey,
      merchant,
      mint,
      ratePerSecond: 10n,
      authorizedMaxRate: 20n,
      lastSettledTs: 1_700_000_000n,
      totalStreamed: 250n,
      maxStreamed: 10_000n,
      pausedAt: null,
      minSettleInterval: 30,
      status: "active",
      mandateIndex: 7n,
      bump: 255,
      pendingNewRatePerSecond: 0n,
      pendingNewAuthorizedMaxRate: 0n,
      pendingEffectiveAt: 0n,
      pendingChangeType: 0,
      pendingNonceShort: [],
    };

    createVelaClientMock.mockClear();
    sendInstructionMock.mockClear();
    buildCreateMock.mockClear();
    buildSettleMock.mockClear();
    buildPauseMock.mockClear();
    buildResumeMock.mockClear();
    buildCancelMock.mockClear();
    fetchStreamMandateMock.mockClear();
    setCliVelaClientFactory(
      createVelaClientMock as unknown as Parameters<
        typeof setCliVelaClientFactory
      >[0],
    );
    setStreamCliRuntimeForTests({
      buildCreateStreamMandateInstruction:
        buildCreateMock as unknown as StreamCliRuntime["buildCreateStreamMandateInstruction"],
      buildExecuteStreamInstruction:
        buildSettleMock as unknown as StreamCliRuntime["buildExecuteStreamInstruction"],
      buildPauseStreamInstruction:
        buildPauseMock as unknown as StreamCliRuntime["buildPauseStreamInstruction"],
      buildResumeStreamInstruction:
        buildResumeMock as unknown as StreamCliRuntime["buildResumeStreamInstruction"],
      buildCancelStreamInstruction:
        buildCancelMock as unknown as StreamCliRuntime["buildCancelStreamInstruction"],
      fetchStreamMandate:
        fetchStreamMandateMock as unknown as StreamCliRuntime["fetchStreamMandate"],
      sendInstruction:
        sendInstructionMock as unknown as StreamCliRuntime["sendInstruction"],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    setCliVelaClientFactory(null);
    setStreamCliRuntimeForTests(null);
  });

  test("stream help lists all stream commands", () => {
    const streamCommand = createCliProgram().commands.find(
      (command) => command.name() === "stream",
    );
    const output = streamCommand?.helpInformation() ?? "";

    expect(output).toContain("create");
    expect(output).toContain("settle");
    expect(output).toContain("pause");
    expect(output).toContain("resume");
    expect(output).toContain("cancel");
    expect(output).toContain("status");
  });

  test("stream create parses raw-unit flags and prints the derived mandate", async () => {
    const { stdout } = await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "stream",
          "create",
          "--merchant",
          merchant.toBase58(),
          "--mint",
          mint.toBase58(),
          "--rate-per-second",
          "10",
          "--authorized-max-rate",
          "20",
          "--min-settle-interval",
          "30",
          "--max-streamed",
          "10000",
        ],
        { from: "user" },
      ),
    );

    expect(buildCreateMock).toHaveBeenCalledWith({
      connection: expect.anything(),
      subscriber: keypair.publicKey,
      merchant,
      mint,
      ratePerSecond: 10n,
      authorizedMaxRate: 20n,
      maxStreamed: 10_000n,
      minSettleInterval: 30,
    });
    expect(sendInstructionMock).toHaveBeenCalledTimes(1);
    expect(stdout).toContain("Stream create succeeded");
    expect(stdout).toContain(expectedMandate.toBase58());
  });

  test("stream lifecycle commands use keypair as authority and preserve JSON output", async () => {
    const mandate = expectedMandate.toBase58();
    for (const action of ["pause", "resume", "cancel"] as const) {
      const { stdout } = await captureOutput(() =>
        createCliProgram().parseAsync(
          [
            "--json",
            "-k",
            join(tempDir, "cli.json"),
            "stream",
            action,
            mandate,
          ],
          { from: "user" },
        ),
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.action).toBe(action);
      expect(parsed.signature).toBe("sig-stream-cli");
      expect(parsed.mandate).toBe(mandate);
    }

    expect(buildPauseMock).toHaveBeenCalledWith({
      connection: expect.anything(),
      mandate: expectedMandate,
      authority: keypair.publicKey,
    });
    expect(buildResumeMock).toHaveBeenCalledWith({
      connection: expect.anything(),
      mandate: expectedMandate,
      authority: keypair.publicKey,
    });
    expect(buildCancelMock).toHaveBeenCalledWith({
      connection: expect.anything(),
      mandate: expectedMandate,
      authority: keypair.publicKey,
    });
  });

  test("stream settle uses keypair as payer", async () => {
    await captureOutput(() =>
      createCliProgram().parseAsync(
        [
          "-k",
          join(tempDir, "cli.json"),
          "stream",
          "settle",
          expectedMandate.toBase58(),
        ],
        { from: "user" },
      ),
    );

    expect(buildSettleMock).toHaveBeenCalledWith({
      connection: expect.anything(),
      mandate: expectedMandate,
      payer: keypair.publicKey,
    });
  });

  test("stream status is read-only and supports JSON", async () => {
    const { stdout } = await captureOutput(() =>
      createCliProgram().parseAsync(
        ["--json", "stream", "status", expectedMandate.toBase58()],
        { from: "user" },
      ),
    );

    expect(fetchStreamMandateMock).toHaveBeenCalledWith(
      expect.anything(),
      expectedMandate,
    );
    expect(JSON.parse(stdout).mandate.status).toBe("active");
  });
});
