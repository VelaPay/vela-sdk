import { PublicKey } from "@solana/web3.js";
import type {
  AgentBudgetSummary,
  AgentMandateVerificationResult,
} from "../types";
import {
  createPaymentProof,
  decodePaymentChallenge,
  encodePaymentProof,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  parseRawAmount,
  type VelaPaymentChallenge,
} from "./proof";

type PaymentClient = {
  agentPull: (params: {
    authority: PublicKey;
    serviceWrappedAccount: PublicKey;
    amount: bigint;
    wrappedUsdcMint?: PublicKey;
  }) => Promise<{ signature: string }>;
  verifyAgentMandate: (params: {
    authority: PublicKey;
    agent: PublicKey;
    service?: PublicKey;
    wrappedUsdcMint?: PublicKey;
  }) => Promise<AgentMandateVerificationResult>;
  checkAgentBudget: (params: {
    authority: PublicKey;
    agent: PublicKey;
    service?: PublicKey;
    wrappedUsdcMint?: PublicKey;
  }) => Promise<AgentBudgetSummary>;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class VelaPaymentHandler {
  private readonly paymentClient: PaymentClient;

  private readonly fetchImpl: FetchLike;

  constructor(options: {
    client: PaymentClient;
    fetch?: FetchLike;
  }) {
    this.paymentClient = options.client;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async canAfford(challenge: VelaPaymentChallenge): Promise<{
    affordable: boolean;
    verification: AgentMandateVerificationResult;
    budget: AgentBudgetSummary;
    reasons: string[];
  }> {
    const authority = new PublicKey(challenge.authority);
    const agent = new PublicKey(challenge.address);
    const service = challenge.service
      ? new PublicKey(challenge.service)
      : undefined;
    const wrappedUsdcMint = challenge.wrappedUsdcMint
      ? new PublicKey(challenge.wrappedUsdcMint)
      : undefined;
    const amount = parseRawAmount(challenge.amount);
    const [verification, budget] = await Promise.all([
      this.paymentClient.verifyAgentMandate({
        authority,
        agent,
        service,
        wrappedUsdcMint,
      }),
      this.paymentClient.checkAgentBudget({
        authority,
        agent,
        service,
        wrappedUsdcMint,
      }),
    ]);
    const reasons = [...verification.reasons];

    if (budget.globalRemaining < amount) {
      reasons.push("Insufficient global remaining budget");
    }
    if (budget.serviceRemaining != null && budget.serviceRemaining < amount) {
      reasons.push("Insufficient service remaining budget");
    }
    if (budget.mandateBalance < amount) {
      reasons.push("Insufficient mandate wrapped balance");
    }

    return {
      affordable: reasons.length === 0,
      verification,
      budget,
      reasons,
    };
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const initialRequest = new Request(input, init);
    const response = await this.fetchImpl(initialRequest.clone());
    if (response.status !== 402) {
      return response;
    }

    const challengeHeader = response.headers.get(PAYMENT_REQUIRED_HEADER);
    if (challengeHeader == null) {
      return response;
    }

    const challenge = decodePaymentChallenge(challengeHeader);
    const affordability = await this.canAfford(challenge);
    if (!affordability.affordable) {
      throw new Error(
        `Agent mandate cannot satisfy x402 challenge: ${affordability.reasons.join(
          "; ",
        )}`,
      );
    }

    const payment = await this.paymentClient.agentPull({
      authority: new PublicKey(challenge.authority),
      serviceWrappedAccount: new PublicKey(challenge.destination),
      amount: parseRawAmount(challenge.amount),
      wrappedUsdcMint: challenge.wrappedUsdcMint
        ? new PublicKey(challenge.wrappedUsdcMint)
        : undefined,
    });
    const proof = createPaymentProof(challenge, payment.signature);
    const retryHeaders = new Headers(initialRequest.headers);
    retryHeaders.set(PAYMENT_SIGNATURE_HEADER, encodePaymentProof(proof));

    const retryRequest = new Request(initialRequest, {
      headers: retryHeaders,
    });

    return this.fetchImpl(retryRequest);
  }
}
