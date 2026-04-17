import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import {
  accountDiscriminator,
  concatBytes,
  hexFromBytes,
  i64LE,
  optionI64LE,
  optionU64LE,
  u64LE,
} from "../bytes";
import { PDAFactory } from "../../accounts/pda";
import { PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../../constants";
import type { StreamMandate } from "../../types/stream-mandate";
import type { TokenConfigAccount, VelaMandate } from "../../types";

const subscriber = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const mandateAddress = new PublicKey("11111111111111111111111111111114");
const currentPlan = new PublicKey("11111111111111111111111111111115");
const nextPlan = new PublicKey("11111111111111111111111111111116");
const mint = new PublicKey("11111111111111111111111111111117");
const wrappingVault = new PublicKey("11111111111111111111111111111118");

const tokenConfig: TokenConfigAccount = {
  mint,
  tokenProgram: mint,
  billingRail: "transferHook",
  decimals: 6,
  enabled: true,
  oracleReference: PublicKey.default,
};

function periodicMandate(): VelaMandate {
  const currentNow = BigInt(Math.floor(Date.now() / 1000));
  return {
    address: mandateAddress,
    subscriber,
    plan: currentPlan,
    merchant,
    mandateIndex: 7n,
    amount: 10_000_000n,
    frequency: 30n * 86_400n,
    startDate: currentNow - 15n * 86_400n,
    expiry: 0n,
    maxPulls: 12n,
    pullsExecuted: 3n,
    nextPaymentDue: currentNow + 15n * 86_400n,
    status: "active",
    bump: 255,
    billingType: "flat",
    version: 3,
  };
}

function streamMandate(): StreamMandate {
  return {
    address: mandateAddress,
    version: 2,
    subscriber,
    merchant,
    mint,
    ratePerSecond: 5n,
    authorizedMaxRate: 10n,
    lastSettledTs: 1_700_000_000n,
    totalStreamed: 25n,
    maxStreamed: 100n,
    pausedAt: null,
    minSettleInterval: 60,
    status: "active",
    mandateIndex: 9n,
    bump: 254,
    pendingNewRatePerSecond: 0n,
    pendingNewAuthorizedMaxRate: 0n,
    pendingEffectiveAt: 0n,
    pendingChangeType: 0,
    pendingNonceShort: [],
  };
}

function serializeProtocolConfig(): Uint8Array {
  const data = new Uint8Array(220);
  data.set(Uint8Array.from(wrappingVault.toBytes()), 113);
  data.set(Uint8Array.from(TRANSFER_HOOK_PROGRAM_ID.toBytes()), 154);
  return data;
}

function serializeMandateAccount(): Uint8Array {
  return concatBytes(
    accountDiscriminator("VelaMandate"),
    Uint8Array.from(subscriber.toBytes()),
    Uint8Array.from(currentPlan.toBytes()),
    Uint8Array.from(merchant.toBytes()),
    u64LE(10_000_000n),
    u64LE(30n * 86_400n),
    i64LE(1_700_000_000n),
    i64LE(0n),
    u64LE(12n),
    u64LE(3n),
    i64LE(1_701_296_000n),
    i64LE(1_700_000_000n),
    u64LE(3n),
    u64LE(4n),
    u64LE(5n),
    Uint8Array.of(0, 254, 0),
    u64LE(7n),
    Uint8Array.of(3),
    u64LE(0n),
    Uint8Array.from(PublicKey.default.toBytes()),
    i64LE(0n),
    Uint8Array.of(0),
    new Uint8Array(15),
  );
}

function serializeStreamMandate(): Uint8Array {
  return concatBytes(
    accountDiscriminator("StreamMandate"),
    Uint8Array.of(2),
    Uint8Array.from(subscriber.toBytes()),
    Uint8Array.from(merchant.toBytes()),
    Uint8Array.from(mint.toBytes()),
    u64LE(5n),
    u64LE(10n),
    i64LE(1_700_000_000n),
    u64LE(25n),
    optionU64LE(100n),
    concatBytes(Uint8Array.of(0), new Uint8Array(8)),
    Uint8Array.from([60, 0, 0, 0]),
    Uint8Array.of(0),
    u64LE(9n),
    Uint8Array.of(254),
    u64LE(0n),
    u64LE(0n),
    i64LE(0n),
    Uint8Array.of(0),
    new Uint8Array(46),
  );
}

function browserConnection(accountMap: Record<string, Uint8Array>) {
  return {
    async getAccountInfo(key: PublicKey) {
      const data = accountMap[key.toBase58()];
      return data
        ? {
            data,
            executable: false,
            lamports: 1,
            owner: PROGRAM_ID,
            rentEpoch: 0,
          }
        : null;
    },
  } as any;
}

async function withBufferDisabled<T>(run: () => Promise<T>): Promise<T> {
  const originalBuffer = (globalThis as { Buffer?: unknown }).Buffer;
  // @ts-expect-error intentional browser simulation
  globalThis.Buffer = undefined;
  try {
    return await run();
  } finally {
    // @ts-expect-error restore test global
    globalThis.Buffer = originalBuffer;
  }
}

describe("browser-safe UpgradeBuilder", () => {
  test("keeps D-07 preview shape intact", async () => {
    await withBufferDisabled(async () => {
      const { UpgradeBuilder } = await import("../../builders/upgrade-builder");
      const preview = UpgradeBuilder.previewPlanChange(
        periodicMandate(),
        { address: nextPlan, amount: 20_000_000n },
        tokenConfig,
      );

      expect(preview.outcome).toBe("ChargeNow");
      expect(preview.prorationAmount).toBe(5_000_000n);
      expect(preview.effectiveAt).toBeInstanceOf(Date);
      expect(preview.requiresSubscriberSig).toBe(true);
      expect(preview.newAuthCeiling).toBe(20_000_000n);
      expect(typeof preview.currentPeriodRemaining).toBe("bigint");
      expect(preview.formatted).toEqual({ amount: "5", tokenSymbol: "TOKEN" });
    });
  });

  test("executes immediate periodic, scheduled periodic, and streaming branches without Buffer", async () => {
    await withBufferDisabled(async () => {
      const { UpgradeBuilder } = await import("../../builders/upgrade-builder");
      const [protocolConfig] = PDAFactory.config(PROGRAM_ID);
      const connection = browserConnection({
        [mandateAddress.toBase58()]: serializeStreamMandate(),
        [protocolConfig.toBase58()]: serializeProtocolConfig(),
      });
      const program = {
        programId: PROGRAM_ID,
        account: {
          protocolConfig: {
            fetch: async () => ({
              wrappedUsdcMint: mint,
              wrappingVault,
              transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
            }),
          },
        },
      } as any;

      const immediateInstruction = await new UpgradeBuilder({
        connection: browserConnection({
          [mandateAddress.toBase58()]: serializeMandateAccount(),
        }),
        program,
        mandate: periodicMandate(),
        newPlan: { address: nextPlan, amount: 20_000_000n },
        tokenConfig,
        authority: subscriber,
      }).execute();
      const scheduledInstruction = await new UpgradeBuilder({
        connection,
        program,
        mandate: periodicMandate(),
        newPlan: {
          address: nextPlan,
          amount: 20_000_000n,
          effectiveAt: new Date("2030-01-01T00:00:00.000Z"),
        },
        tokenConfig,
        authority: subscriber,
      }).execute();
      const streamingInstruction = await new UpgradeBuilder({
        connection,
        program,
        mandate: streamMandate(),
        newPlan: { amount: 8n },
        tokenConfig,
        authority: subscriber,
      }).execute();

      expect(hexFromBytes(immediateInstruction.data.subarray(0, 8))).toBe("d3d5ea283a2accf8");
      expect(hexFromBytes(scheduledInstruction.data)).toBe("2a09fad8502d346a");
      expect(hexFromBytes(streamingInstruction.data)).toBe(
        "8ad5eeea7139101b010800000000000000010800000000000000",
      );
    });
  });
});
