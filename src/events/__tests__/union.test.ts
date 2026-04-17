import { describe, expect, test } from "bun:test";
import { VelaEventSchema } from "../index";
import { BASE_EVENT, VALID_EVENT_FIXTURES } from "./fixtures";

describe("VelaEventSchema", () => {
  test("parses every supported discriminator", () => {
    for (const [eventType, fixture] of Object.entries(VALID_EVENT_FIXTURES)) {
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
    const invalid = { ...VALID_EVENT_FIXTURES["mandate.upgrade_finalized"] };
    delete invalid.old_plan;

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
