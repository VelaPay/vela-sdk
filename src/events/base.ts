import { z } from "zod";

export const baseEnvelope = {
  id: z.string().uuid(),
  schema_version: z.literal(1),
  event_type: z.string(),
  emitted_at: z.number().int(),
  signature: z.string(),
  slot: z.number().int(),
  mandate: z.string(),
  mint: z.string(),
  token_symbol: z.string(),
  subscriber: z.string().optional(),
} as const;

export const BaseEventSchema = z.object(baseEnvelope);

export function createEventSchema<
  TEventType extends string,
  TShape extends z.ZodRawShape = z.ZodRawShape,
>(eventType: TEventType, shape?: TShape) {
  return BaseEventSchema.extend({
    event_type: z.literal(eventType),
    ...(shape ?? {}),
  });
}

export type BaseEvent = z.infer<typeof BaseEventSchema>;
