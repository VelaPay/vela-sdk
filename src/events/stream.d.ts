import { z } from "zod";
export declare const StreamCreatedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.created">;
  },
  z.core.$strip
>;
export declare const StreamSettledSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.settled">;
  },
  z.core.$strip
>;
export declare const StreamPausedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.paused">;
  },
  z.core.$strip
>;
export declare const StreamResumedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.resumed">;
  },
  z.core.$strip
>;
export declare const StreamRateUpdatedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.rate_updated">;
  },
  z.core.$strip
>;
export declare const StreamCancelledSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.cancelled">;
  },
  z.core.$strip
>;
export declare const StreamAccruedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"stream.accrued">;
  },
  z.core.$strip
>;
export declare const STREAM_EVENT_SCHEMAS: readonly [
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
      event_type: z.ZodLiteral<"stream.created">;
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
      event_type: z.ZodLiteral<"stream.settled">;
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
      event_type: z.ZodLiteral<"stream.paused">;
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
      event_type: z.ZodLiteral<"stream.resumed">;
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
      event_type: z.ZodLiteral<"stream.rate_updated">;
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
      event_type: z.ZodLiteral<"stream.cancelled">;
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
      event_type: z.ZodLiteral<"stream.accrued">;
    },
    z.core.$strip
  >,
];
export type StreamEvent = z.infer<(typeof STREAM_EVENT_SCHEMAS)[number]>;
//# sourceMappingURL=stream.d.ts.map
