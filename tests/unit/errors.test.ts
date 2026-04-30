import { describe, expect, test } from "bun:test";
import {
  AmountExceedsPlanAmountError,
  FrequencyTooLowError,
  InsufficientFundsError,
  MandateExpiredError,
  MandateNotActiveError,
  MaxPullsExceededError,
  MaxPullsTooLowError,
  OverflowError,
  PlanNotActiveError,
  PullTooEarlyError,
  translateError,
  UnauthorizedCancelError,
  VelaError,
} from "../../src/errors";

describe("VelaError base class", () => {
  test("creates error with code, message, and context", () => {
    const error = new VelaError("test message", 1234, { key: "value" });
    expect(error.message).toBe("test message");
    expect(error.code).toBe(1234);
    expect(error.context).toEqual({ key: "value" });
    expect(error.name).toBe("VelaError");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VelaError);
  });
});

describe("Program error classes", () => {
  const errorCases = [
    {
      Class: PullTooEarlyError,
      code: 6000,
      name: "PullTooEarlyError",
      msg: "Pull attempted before next_payment_due",
    },
    {
      Class: MandateNotActiveError,
      code: 6001,
      name: "MandateNotActiveError",
      msg: "Mandate has expired or been cancelled",
    },
    {
      Class: MaxPullsExceededError,
      code: 6002,
      name: "MaxPullsExceededError",
      msg: "Maximum pulls exhausted for this mandate",
    },
    {
      Class: InsufficientFundsError,
      code: 6003,
      name: "InsufficientFundsError",
      msg: "Subscriber has insufficient token balance",
    },
    {
      Class: UnauthorizedCancelError,
      code: 6004,
      name: "UnauthorizedCancelError",
      msg: "Only the subscriber can cancel their mandate",
    },
    {
      Class: FrequencyTooLowError,
      code: 6005,
      name: "FrequencyTooLowError",
      msg: "Plan frequency below minimum (3600 seconds)",
    },
    {
      Class: OverflowError,
      code: 6006,
      name: "OverflowError",
      msg: "Arithmetic overflow",
    },
    {
      Class: PlanNotActiveError,
      code: 6007,
      name: "PlanNotActiveError",
      msg: "Plan is not active",
    },
    {
      Class: MandateExpiredError,
      code: 6008,
      name: "MandateExpiredError",
      msg: "Mandate has expired",
    },
    {
      Class: AmountExceedsPlanAmountError,
      code: 6009,
      name: "AmountExceedsPlanAmountError",
      msg: "Pull amount exceeds plan amount",
    },
    {
      Class: MaxPullsTooLowError,
      code: 6010,
      name: "MaxPullsTooLowError",
      msg: "Plan max_pulls must be at least 1",
    },
  ];

  for (const { Class, code, name, msg } of errorCases) {
    describe(name, () => {
      test("has correct code", () => {
        const error = new Class();
        expect(error.code).toBe(code);
      });

      test("has correct name", () => {
        const error = new Class();
        expect(error.name).toBe(name);
      });

      test("has correct default message", () => {
        const error = new Class();
        expect(error.message).toBe(msg);
      });

      test("is instanceof VelaError", () => {
        const error = new Class();
        expect(error).toBeInstanceOf(VelaError);
      });

      test("is instanceof its own class", () => {
        const error = new Class();
        expect(error).toBeInstanceOf(Class);
      });

      test("is instanceof Error", () => {
        const error = new Class();
        expect(error).toBeInstanceOf(Error);
      });

      test("accepts optional context", () => {
        const ctx = { mandateAddress: "abc123" };
        const error = new Class(ctx);
        expect(error.context).toEqual(ctx);
      });
    });
  }
});

describe("translateError", () => {
  test("maps AnchorError code 6000 to PullTooEarlyError", () => {
    const anchorError = { error: { errorCode: { number: 6000 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(PullTooEarlyError);
    expect(result.code).toBe(6000);
  });

  test("maps AnchorError code 6001 to MandateNotActiveError", () => {
    const anchorError = { error: { errorCode: { number: 6001 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(MandateNotActiveError);
  });

  test("maps AnchorError code 6002 to MaxPullsExceededError", () => {
    const anchorError = { error: { errorCode: { number: 6002 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(MaxPullsExceededError);
  });

  test("maps AnchorError code 6003 to InsufficientFundsError", () => {
    const anchorError = { error: { errorCode: { number: 6003 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(InsufficientFundsError);
  });

  test("maps AnchorError code 6004 to UnauthorizedCancelError", () => {
    const anchorError = { error: { errorCode: { number: 6004 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(UnauthorizedCancelError);
  });

  test("maps AnchorError code 6005 to FrequencyTooLowError", () => {
    const anchorError = { error: { errorCode: { number: 6005 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(FrequencyTooLowError);
  });

  test("maps AnchorError code 6006 to OverflowError", () => {
    const anchorError = { error: { errorCode: { number: 6006 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(OverflowError);
  });

  test("maps AnchorError code 6007 to PlanNotActiveError", () => {
    const anchorError = { error: { errorCode: { number: 6007 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(PlanNotActiveError);
  });

  test("maps AnchorError code 6008 to MandateExpiredError", () => {
    const anchorError = { error: { errorCode: { number: 6008 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(MandateExpiredError);
  });

  test("maps AnchorError code 6009 to AmountExceedsPlanAmountError", () => {
    const anchorError = { error: { errorCode: { number: 6009 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(AmountExceedsPlanAmountError);
  });

  test("maps AnchorError code 6010 to MaxPullsTooLowError", () => {
    const anchorError = { error: { errorCode: { number: 6010 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(MaxPullsTooLowError);
  });

  test("returns generic VelaError with code -1 for unknown error code", () => {
    const anchorError = { error: { errorCode: { number: 9999 } } };
    const result = translateError(anchorError);
    expect(result).toBeInstanceOf(VelaError);
    expect(result.code).toBe(-1);
  });

  test("returns generic VelaError for non-Anchor error", () => {
    const result = translateError(new Error("some random error"));
    expect(result).toBeInstanceOf(VelaError);
    expect(result.code).toBe(-1);
  });

  test("passes context to translated error", () => {
    const anchorError = { error: { errorCode: { number: 6000 } } };
    const ctx = { mandateAddress: "xyz" };
    const result = translateError(anchorError, ctx);
    expect(result.context).toEqual(ctx);
  });
});
