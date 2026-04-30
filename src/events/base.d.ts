import { z } from "zod";
export declare const baseEnvelope: {
  readonly id: z.ZodString;
  readonly schema_version: z.ZodLiteral<1>;
  readonly event_type: z.ZodString;
  readonly emitted_at: z.ZodNumber;
  readonly signature: z.ZodString;
  readonly slot: z.ZodNumber;
  readonly mandate: z.ZodString;
  readonly mint: z.ZodString;
  readonly token_symbol: z.ZodString;
  readonly subscriber: z.ZodOptional<z.ZodString>;
};
export declare const BaseEventSchema: z.ZodObject<
  {
    id: z.ZodString;
    schema_version: z.ZodLiteral<1>;
    event_type: z.ZodString;
    emitted_at: z.ZodNumber;
    signature: z.ZodString;
    slot: z.ZodNumber;
    mandate: z.ZodString;
    mint: z.ZodString;
    token_symbol: z.ZodString;
    subscriber: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export declare function createEventSchema<
  TEventType extends string,
  TShape extends z.ZodRawShape = z.ZodRawShape,
>(
  eventType: TEventType,
  shape?: TShape,
): z.ZodObject<
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
    event_type: z.ZodLiteral<TEventType>;
  },
  z.core.$strip
>;
export type BaseEvent = z.infer<typeof BaseEventSchema>;
//# sourceMappingURL=base.d.ts.map
