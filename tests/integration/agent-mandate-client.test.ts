import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Program, Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAccount,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "anchor-litesvm/node_modules/litesvm";
import bs58 from "bs58";
import { velaProgramIdl } from "../../src/idl";
import {
  ALTManager,
  createVelaClient,
  deriveAgentMandateAddress,
  deriveAgentMandateWrappedAta,
  PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  type VelaWallet,
} from "../../src/index";
import {
  hasProtocolBuildArtifacts,
  requireProtocolProgramSo,
} from "../helpers/protocol-artifacts";
import {
  bootstrapTokenConfig,
  createToken2022Ata,
  findHookSo,
  installPhase7AdminState,
  sendInstructions,
} from "./phase7-helpers";

const DECIMALS = 6;

function airdropSol(
  svm: LiteSVM,
  pubkey: PublicKey,
  lamports = BigInt(LAMPORTS_PER_SOL),
): void {
  svm.airdrop(pubkey, lamports);
}

function makeWallet(signer: Keypair): VelaWallet {
  return {
    publicKey: signer.publicKey,
    signTransaction: async (tx: any) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([signer]);
      } else {
        tx.partialSign(signer);
      }
      return tx;
    },
    signAllTransactions: async (txs: any[]) =>
      Promise.all(
        txs.map(async (tx) => {
          if (tx instanceof VersionedTransaction) {
            tx.sign([signer]);
          } else {
            tx.partialSign(signer);
          }
          return tx;
        }),
      ),
  };
}

async function createUsdcMint(
  provider: LiteSVMProvider,
  mintAuthority = provider.wallet.publicKey,
): Promise<PublicKey> {
  const mint = Keypair.generate();
  const lamports =
    await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  await sendInstructions(
    provider,
    [
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mint.publicKey,
        DECIMALS,
        mintAuthority,
        null,
        TOKEN_PROGRAM_ID,
      ),
    ],
    [mint],
  );

  return mint.publicKey;
}

async function createSplTokenAccount(
  provider: LiteSVMProvider,
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
  );

  await sendInstructions(provider, [
    createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
    ),
  ]);

  return ata;
}

async function mintUsdc(
  provider: LiteSVMProvider,
  mint: PublicKey,
  destination: PublicKey,
  amount: bigint,
): Promise<void> {
  await sendInstructions(provider, [
    createMintToInstruction(
      mint,
      destination,
      provider.wallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ]);
}

describe.skipIf(!hasProtocolBuildArtifacts())(
  "agent mandate VelaClient integration",
  () => {
    let svm: LiteSVM;
    let provider: LiteSVMProvider;
    let authority: Keypair;
    let usdcMint: PublicKey;
    let authorityUsdcAccount: PublicKey;
    let wrappedUsdcMint: PublicKey;
    let wrappingVault: PublicKey;
    let adminProgram: Program;
    let clientConnection: any;
    let authorityClient: ReturnType<typeof createVelaClient>;
    let originalGetOrCreateALT: typeof ALTManager.prototype.getOrCreateALT;
    let originalBuildV0Transaction: typeof ALTManager.prototype.buildV0Transaction;

    beforeAll(async () => {
      svm = new LiteSVM().withDefaultPrograms().withTransactionHistory(0n);
      svm.addProgramFromFile(PROGRAM_ID, requireProtocolProgramSo());
      svm.addProgramFromFile(TRANSFER_HOOK_PROGRAM_ID, findHookSo());

      authority = Keypair.generate();
      airdropSol(svm, authority.publicKey, 20n * BigInt(LAMPORTS_PER_SOL));

      provider = new LiteSVMProvider(svm, new Wallet(authority));
      adminProgram = new Program(velaProgramIdl as any, provider);
      usdcMint = await createUsdcMint(provider);
      authorityUsdcAccount = await createSplTokenAccount(
        provider,
        authority.publicKey,
        usdcMint,
      );
      await mintUsdc(provider, usdcMint, authorityUsdcAccount, 20_000_000n);

      const protocolAccounts = await installPhase7AdminState({
        provider,
        svm,
        admin: authority,
        splUsdcMint: usdcMint,
      });
      wrappedUsdcMint = protocolAccounts.wrappedUsdcMint;
      wrappingVault = protocolAccounts.wrappingVault;
      await bootstrapTokenConfig(
        provider,
        adminProgram,
        authority,
        wrappedUsdcMint,
        "hook",
        DECIMALS,
      );

      originalGetOrCreateALT = ALTManager.prototype.getOrCreateALT;
      originalBuildV0Transaction = ALTManager.prototype.buildV0Transaction;

      ALTManager.prototype.getOrCreateALT = async function mockAlt() {
        return {
          key: PublicKey.default,
          state: {
            deactivationSlot: 0n,
            lastExtendedSlot: 0,
            lastExtendedSlotStartIndex: 0,
            authority: null,
            addresses: [],
          },
        } as any;
      };

      ALTManager.prototype.buildV0Transaction =
        function buildWithoutLookupTables(payerKey, instructions, blockhash) {
          const message = new TransactionMessage({
            payerKey,
            recentBlockhash: blockhash,
            instructions,
          }).compileToV0Message();
          return new VersionedTransaction(message);
        };

      clientConnection = {
        getAccountInfo: provider.connection.getAccountInfo.bind(
          provider.connection,
        ),
        getAccountInfoAndContext:
          provider.connection.getAccountInfoAndContext.bind(
            provider.connection,
          ),
        getMinimumBalanceForRentExemption:
          provider.connection.getMinimumBalanceForRentExemption.bind(
            provider.connection,
          ),
        getLatestBlockhash: async () => ({
          blockhash: provider.client.latestBlockhash(),
          lastValidBlockHeight: 0,
        }),
        getSlot: async () => 0,
        getAddressLookupTable: async () => ({
          context: { slot: 0 },
          value: null,
        }),
        sendRawTransaction: async (raw: Buffer | Uint8Array) => {
          const tx = VersionedTransaction.deserialize(Buffer.from(raw));
          const result = provider.client.sendTransaction(tx);
          const meta =
            result &&
            typeof (result as { meta?: () => any }).meta === "function"
              ? (result as { meta: () => { err?: unknown } }).meta()
              : null;
          if (meta?.err != null) {
            throw new Error(JSON.stringify(meta.err));
          }
          return bs58.encode(tx.signatures[0]!);
        },
        confirmTransaction: async () => ({
          context: { slot: 0 },
          value: { err: null },
        }),
      };

      authorityClient = createVelaClient({
        connection: clientConnection,
        wallet: makeWallet(authority),
      });
    });

    afterAll(() => {
      ALTManager.prototype.getOrCreateALT = originalGetOrCreateALT;
      ALTManager.prototype.buildV0Transaction = originalBuildV0Transaction;
    });

    test("createAgentMandate, agentPull, lifecycle methods, and drain/revoke results work end-to-end", async () => {
      const agent = Keypair.generate();
      const service = Keypair.generate();
      airdropSol(svm, agent.publicKey, 5n * BigInt(LAMPORTS_PER_SOL));

      const serviceWrappedAccount = await createToken2022Ata(
        provider,
        service.publicKey,
        wrappedUsdcMint,
      );
      const agentClient = createVelaClient({
        connection: clientConnection,
        wallet: makeWallet(agent),
      });

      const created = await authorityClient.createAgentMandate({
        agent: agent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        dailyLimit: 5_000_000n,
        lifetimeCap: 20_000_000n,
        minPullAmount: 100_000n,
        minPullInterval: 0n,
        services: [{ service: service.publicKey, dailyLimit: 4_000_000n }],
        fundedAmount: 3_000_000n,
      });

      const [mandateAddress] = deriveAgentMandateAddress(
        authority.publicKey,
        agent.publicKey,
      );
      expect(created.address?.toBase58()).toBe(mandateAddress.toBase58());
      expect(created.data?.status).toBe("active");

      const pulled = await agentClient.agentPull({
        authority: authority.publicKey,
        serviceWrappedAccount,
        wrappedUsdcMint,
        wrappingVault,
        amount: 700_000n,
      });
      expect(pulled.address?.toBase58()).toBe(mandateAddress.toBase58());
      expect(pulled.data?.dailySpent).toBe(700_000n);
      expect(pulled.data?.totalSpent).toBe(700_000n);

      const paused = await authorityClient.pauseAgentMandate({
        agent: agent.publicKey,
      });
      expect(paused.data?.status).toBe("paused");

      const resumed = await authorityClient.resumeAgentMandate({
        agent: agent.publicKey,
      });
      expect(resumed.data?.status).toBe("active");

      const adjusted = await authorityClient.adjustAgentMandate({
        agent: agent.publicKey,
        wrappedUsdcMint,
        lifetimeCap: 30_000_000n,
      });
      expect(adjusted.data?.lifetimeCap).toBe(30_000_000n);

      const toppedUp = await authorityClient.topUpAgentMandate({
        agent: agent.publicKey,
        amount: 500_000n,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
      });
      expect(toppedUp.address?.toBase58()).toBe(mandateAddress.toBase58());

      const mandateWrappedAccount = deriveAgentMandateWrappedAta(
        mandateAddress,
        wrappedUsdcMint,
      );
      const balanceBeforeDrain = BigInt(
        (
          await getAccount(
            provider.connection,
            mandateWrappedAccount,
            undefined,
            TOKEN_2022_PROGRAM_ID,
          )
        ).amount.toString(),
      );

      const drained = await authorityClient.drainAgentMandate({
        agent: agent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        authorityUsdcAccount,
      });
      expect(drained.drainedAmount).toBe(balanceBeforeDrain);
      expect(drained.data?.status).toBe("active");

      const balanceAfterDrain = BigInt(
        (
          await getAccount(
            provider.connection,
            mandateWrappedAccount,
            undefined,
            TOKEN_2022_PROGRAM_ID,
          )
        ).amount.toString(),
      );
      expect(balanceAfterDrain).toBe(0n);

      await authorityClient.topUpAgentMandate({
        agent: agent.publicKey,
        amount: 400_000n,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
      });

      const revoked = await authorityClient.revokeAgentMandate({
        agent: agent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        authorityUsdcAccount,
      });
      expect(revoked.reclaimedAmount).toBe(400_000n);
      expect(revoked.data?.status).toBe("revoked");
    });

    test("wrapAndCreateAgentMandate returns the same result shape as createAgentMandate", async () => {
      const aliasAgent = Keypair.generate();
      const aliasService = Keypair.generate();

      const aliased = await authorityClient.wrapAndCreateAgentMandate({
        agent: aliasAgent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        dailyLimit: 2_000_000n,
        lifetimeCap: 8_000_000n,
        minPullAmount: 50_000n,
        minPullInterval: 0n,
        services: [{ service: aliasService.publicKey, dailyLimit: 1_500_000n }],
        fundedAmount: 1_200_000n,
      });

      const [expectedMandate] = deriveAgentMandateAddress(
        authority.publicKey,
        aliasAgent.publicKey,
      );
      expect(aliased.address?.toBase58()).toBe(expectedMandate.toBase58());
      expect(aliased.data?.authority.equals(authority.publicKey)).toBe(true);
      expect(aliased.data?.agent.equals(aliasAgent.publicKey)).toBe(true);
    });

    test("topUpAgentMandate reuses the mandate-owned wrap destination without changing the PDA", async () => {
      const topUpAgent = Keypair.generate();
      const topUpService = Keypair.generate();

      const created = await authorityClient.createAgentMandate({
        agent: topUpAgent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        dailyLimit: 2_000_000n,
        lifetimeCap: 9_000_000n,
        minPullAmount: 50_000n,
        minPullInterval: 0n,
        services: [{ service: topUpService.publicKey, dailyLimit: 1_500_000n }],
        fundedAmount: 900_000n,
      });

      const mandateAddress = created.address!;
      const mandateWrappedAccount = deriveAgentMandateWrappedAta(
        mandateAddress,
        wrappedUsdcMint,
      );
      const balanceBefore = BigInt(
        (
          await getAccount(
            provider.connection,
            mandateWrappedAccount,
            undefined,
            TOKEN_2022_PROGRAM_ID,
          )
        ).amount.toString(),
      );

      const toppedUp = await authorityClient.topUpAgentMandate({
        agent: topUpAgent.publicKey,
        amount: 600_000n,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
      });

      const balanceAfter = BigInt(
        (
          await getAccount(
            provider.connection,
            mandateWrappedAccount,
            undefined,
            TOKEN_2022_PROGRAM_ID,
          )
        ).amount.toString(),
      );

      expect(toppedUp.address?.toBase58()).toBe(mandateAddress.toBase58());
      expect(balanceAfter - balanceBefore).toBe(600_000n);
    });

    test("client.instructions exposes agent mandate raw builders bound to the connected wallet", async () => {
      const builderAgent = Keypair.generate();
      const built = await authorityClient.instructions.createAgentMandate({
        agent: builderAgent.publicKey,
        splUsdcMint: usdcMint,
        wrappedUsdcMint,
        wrappingVault,
        dailyLimit: 1_000_000n,
        lifetimeCap: 5_000_000n,
        minPullAmount: 10_000n,
        minPullInterval: 0n,
        services: [
          { service: Keypair.generate().publicKey, dailyLimit: 900_000n },
        ],
        fundedAmount: 500_000n,
      });

      expect(built.mandateAddress.toBase58()).toBe(
        deriveAgentMandateAddress(
          authority.publicKey,
          builderAgent.publicKey,
        )[0].toBase58(),
      );
      expect(typeof authorityClient.instructions.pauseAgentMandate).toBe(
        "function",
      );
      expect(typeof authorityClient.instructions.revokeAgentMandate).toBe(
        "function",
      );
    });
  },
);
