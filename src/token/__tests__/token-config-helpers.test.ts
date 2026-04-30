import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../constants";
import {
  TokenConfigDisabled,
  TokenConfigNotFound,
} from "../../errors/upgrade-errors";
import {
  getEnabledTokens,
  resolveTokenConfig,
  TOKEN_CONFIG_DISCRIMINATOR,
} from "../../index";

function addr(seed: number): PublicKey {
  return new PublicKey(Uint8Array.from({ length: 32 }, () => seed));
}

function serializeTokenConfig(args: {
  mint: PublicKey;
  enabled: boolean;
  decimals?: number;
  billingRail?: 0 | 1;
}): Buffer {
  const data = Buffer.alloc(213);
  let offset = 0;
  data.set(TOKEN_CONFIG_DISCRIMINATOR, offset);
  offset += 8;
  args.mint.toBuffer().copy(data, offset);
  offset += 32;
  TOKEN_2022_PROGRAM_ID.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt8(args.billingRail ?? 0, offset);
  offset += 1;
  data.writeUInt8(args.decimals ?? 6, offset);
  offset += 1;
  data.writeUInt8(args.enabled ? 1 : 0, offset);
  offset += 1;
  PublicKey.default.toBuffer().copy(data, offset);
  offset += 32;
  addr(80).toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigInt64LE(1_700_000_000n, offset);
  offset += 8;
  data.writeUInt8(254, offset);
  offset += 1;
  data.writeUInt8(1, offset);
  return data;
}

describe("token config helpers", () => {
  test("getEnabledTokens filters disabled token configs", async () => {
    const usdc = addr(1);
    const pyusd = addr(2);
    const connection = {
      getProgramAccounts: async () => [
        {
          pubkey: addr(10),
          account: {
            data: serializeTokenConfig({ mint: usdc, enabled: true }),
          },
        },
        {
          pubkey: addr(11),
          account: {
            data: serializeTokenConfig({ mint: pyusd, enabled: false }),
          },
        },
      ],
    } as any;

    const result = await getEnabledTokens(connection, PROGRAM_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.mint.equals(usdc)).toBe(true);
    expect(result[0]?.enabled).toBe(true);
  });

  test("resolveTokenConfig returns enabled token configs and throws typed errors otherwise", async () => {
    const enabledMint = addr(3);
    const disabledMint = addr(4);
    const [enabledAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_config"), enabledMint.toBuffer()],
      PROGRAM_ID,
    );
    const [disabledAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_config"), disabledMint.toBuffer()],
      PROGRAM_ID,
    );
    const accounts = new Map<string, Buffer>([
      [
        enabledAddress.toBase58(),
        serializeTokenConfig({ mint: enabledMint, enabled: true }),
      ],
      [
        disabledAddress.toBase58(),
        serializeTokenConfig({ mint: disabledMint, enabled: false }),
      ],
    ]);
    const connection = {
      getAccountInfo: async (key: PublicKey) => {
        const data = accounts.get(key.toBase58());
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

    const resolved = await resolveTokenConfig(
      connection,
      enabledMint,
      PROGRAM_ID,
    );
    expect(resolved.mint.equals(enabledMint)).toBe(true);

    await expect(
      resolveTokenConfig(connection, disabledMint, PROGRAM_ID),
    ).rejects.toBeInstanceOf(TokenConfigDisabled);
    await expect(
      resolveTokenConfig(connection, addr(9), PROGRAM_ID),
    ).rejects.toBeInstanceOf(TokenConfigNotFound);
  });
});
