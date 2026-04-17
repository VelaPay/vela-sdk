import { describe, expect, test } from "bun:test";
import { VelaEventSchema } from "../index";
import { BASE_EVENT, VALID_EVENT_FIXTURES } from "./fixtures";

describe("VelaEventSchema", () => {
  test("parses every supported discriminator", () => {
    const fixtures = Object.entries(VALID_EVENT_FIXTURES) as Array<
      [
        keyof typeof VALID_EVENT_FIXTURES,
        (typeof VALID_EVENT_FIXTURES)[keyof typeof VALID_EVENT_FIXTURES],
      ]
    >;
    for (const [eventType, fixture] of fixtures) {
      const parsed = VelaEventSchema.parse(fixture);
      expect(parsed.event_type).toBe(eventType);
    }
  });

  test("throws on unknown discriminator", () => {
    expect(() =>
      VelaEventSchema.parse({
        ...BASE_EVENT,
        event_type: "unknown.type",
      }),
    ).toThrow();
  });

  test("requires upgrade finalized fields", () => {
    const { old_plan: _oldPlan, ...invalid } =
      VALID_EVENT_FIXTURES["mandate.upgrade_finalized"];

    expect(() => VelaEventSchema.parse(invalid)).toThrow();
  });

  test("rejects schema_version 2", () => {
    expect(() =>
      VelaEventSchema.parse({
        ...VALID_EVENT_FIXTURES["stream.settled"],
        schema_version: 2,
      }),
    ).toThrow();
  });
});
