import { describe, expect, test } from "bun:test";
import { EVENT_SCHEMAS } from "../index";
import { VALID_EVENT_FIXTURES } from "./fixtures";

const requiredBaseFields = ["id", "signature", "slot", "mandate", "mint"] as const;

describe("event schema envelope", () => {
  test("every schema requires on-chain refs and id", () => {
    for (const [eventType, schema] of Object.entries(EVENT_SCHEMAS)) {
      const fixture = VALID_EVENT_FIXTURES[eventType as keyof typeof VALID_EVENT_FIXTURES];

      for (const field of requiredBaseFields) {
        const invalid = { ...fixture };
        delete invalid[field];
        expect(schema.safeParse(invalid).success).toBe(false);
      }
    }
  });

  test("every schema locks schema_version to 1", () => {
    for (const [eventType, schema] of Object.entries(EVENT_SCHEMAS)) {
      const fixture = VALID_EVENT_FIXTURES[eventType as keyof typeof VALID_EVENT_FIXTURES];
      expect(schema.safeParse({ ...fixture, schema_version: 2 }).success).toBe(false);
    }
  });
});
