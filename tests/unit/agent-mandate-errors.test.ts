import { describe, expect, test } from "bun:test";
import {
  AgentMandateAlreadyExistsError,
  DailyLimitExceededError,
  InvalidAgentMandateStatusTransitionError,
  MandatePausedError,
  ProtocolPausedError,
  PullCooldownActiveError,
  translateError,
  UnauthorizedAgentError,
  UnauthorizedAgentMandateAuthorityError,
  UnauthorizedServiceError,
  VelaError,
} from "../../src/errors";

describe("agent mandate error translation", () => {
  test("translateError maps agent-mandate codes 6030-6047 to concrete subclasses", () => {
    expect(
      translateError({ error: { errorCode: { number: 6030 } } }),
    ).toBeInstanceOf(UnauthorizedAgentError);
    expect(
      translateError({ error: { errorCode: { number: 6031 } } }),
    ).toBeInstanceOf(UnauthorizedServiceError);
    expect(
      translateError({ error: { errorCode: { number: 6034 } } }),
    ).toBeInstanceOf(MandatePausedError);
    expect(
      translateError({ error: { errorCode: { number: 6036 } } }),
    ).toBeInstanceOf(DailyLimitExceededError);
    expect(
      translateError({ error: { errorCode: { number: 6040 } } }),
    ).toBeInstanceOf(PullCooldownActiveError);
    expect(
      translateError({ error: { errorCode: { number: 6042 } } }),
    ).toBeInstanceOf(AgentMandateAlreadyExistsError);
    expect(
      translateError({ error: { errorCode: { number: 6046 } } }),
    ).toBeInstanceOf(InvalidAgentMandateStatusTransitionError);
    expect(
      translateError({ error: { errorCode: { number: 6047 } } }),
    ).toBeInstanceOf(UnauthorizedAgentMandateAuthorityError);
  });

  test("ProtocolPaused stays mapped at code 6060", () => {
    const translated = translateError({
      error: { errorCode: { number: 6060 } },
    });
    expect(translated).toBeInstanceOf(ProtocolPausedError);
    expect(new ProtocolPausedError().code).toBe(6060);
  });

  test("the new typed errors are importable from @velapay/sdk", async () => {
    const root = await import("../../src/index");
    expect(root.UnauthorizedAgentError).toBe(UnauthorizedAgentError);
    expect(root.AgentMandateAlreadyExistsError).toBe(
      AgentMandateAlreadyExistsError,
    );
    expect(root.ProtocolPausedError).toBe(ProtocolPausedError);
  });

  test("agent mandate errors still inherit from VelaError", () => {
    expect(new UnauthorizedAgentError()).toBeInstanceOf(VelaError);
    expect(new UnauthorizedAgentMandateAuthorityError()).toBeInstanceOf(
      VelaError,
    );
  });
});
