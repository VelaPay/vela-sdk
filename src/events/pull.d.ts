import { z } from "zod";
export declare const PullSucceededSchema: z.ZodObject<
  {
    id: z.ZodString;
    schema_version: z.ZodLiteral<1>;
    emitted_at: z.ZodNumber;
    signature: z.ZodString;
    slot: z.ZodNumber;
    mandate: z.ZodString;
    mint: z.ZodString;
    token_symbol: z.ZodString;
    subscriber: z.ZodOptional<z.ZodString>;
    event_type: z.ZodLiteral<"pull.succeeded">;
  },
  z.core.$strip
>;
export declare const PullFailedSchema: z.ZodObject<
  {
    id: z.ZodString;
    schema_version: z.ZodLiteral<1>;
    emitted_at: z.ZodNumber;
    signature: z.ZodString;
    slot: z.ZodNumber;
    mandate: z.ZodString;
    mint: z.ZodString;
    token_symbol: z.ZodString;
    subscriber: z.ZodOptional<z.ZodString>;
    event_type: z.ZodLiteral<"pull.failed">;
  },
  z.core.$strip
>;
export declare const PULL_EVENT_SCHEMAS: readonly [
  z.ZodObject<
    {
      id: z.ZodString;
      schema_version: z.ZodLiteral<1>;
      emitted_at: z.ZodNumber;
      signature: z.ZodString;
      slot: z.ZodNumber;
      mandate: z.ZodString;
      mint: z.ZodString;
      token_symbol: z.ZodString;
      subscriber: z.ZodOptional<z.ZodString>;
      event_type: z.ZodLiteral<"pull.succeeded">;
    },
    z.core.$strip
  >,
  z.ZodObject<
    {
      id: z.ZodString;
      schema_version: z.ZodLiteral<1>;
      emitted_at: z.ZodNumber;
      signature: z.ZodString;
      slot: z.ZodNumber;
      mandate: z.ZodString;
      mint: z.ZodString;
      token_symbol: z.ZodString;
      subscriber: z.ZodOptional<z.ZodString>;
      event_type: z.ZodLiteral<"pull.failed">;
    },
    z.core.$strip
  >,
];
export type PullEvent = z.infer<(typeof PULL_EVENT_SCHEMAS)[number]>;
//# sourceMappingURL=pull.d.ts.map
