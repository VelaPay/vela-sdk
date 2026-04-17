import { z } from "zod";
import { createEventSchema } from "./base";

export const StreamCreatedSchema = createEventSchema("stream.created", {
  subscriber: z.string(),
  merchant: z.string(),
  rate_per_second: z.string(),
  authorized_max_rate: z.string(),
  max_streamed: z.string().nullable().optional(),
  min_settle_interval: z.number().int(),
  timestamp: z.number().int(),
});

export const StreamSettledSchema = createEventSchema("stream.settled", {
  amount: z.string(),
  total_streamed_after: z.string(),
  last_settled_ts: z.number().int(),
  timestamp: z.number().int(),
});

export const StreamPausedSchema = createEventSchema("stream.paused", {
  paused_at: z.number().int(),
  signer: z.string(),
  final_settle_amount: z.string(),
  timestamp: z.number().int(),
});

export const StreamResumedSchema = createEventSchema("stream.resumed", {
  resumed_at: z.number().int(),
  pause_duration_secs: z.string(),
  signer: z.string(),
  timestamp: z.number().int(),
});

export const StreamRateUpdatedSchema = createEventSchema("stream.rate_updated", {
  old_rate_per_second: z.string(),
  new_rate_per_second: z.string(),
  old_authorized_max_rate: z.string(),
  new_authorized_max_rate: z.string(),
  signer: z.string(),
  final_settle_amount: z.string(),
  timestamp: z.number().int(),
});

export const StreamCancelledSchema = createEventSchema("stream.cancelled", {
  cancelled_at: z.number().int(),
  signer: z.string(),
  final_settle_amount: z.string(),
  total_streamed_final: z.string(),
  timestamp: z.number().int(),
});

export const StreamAccruedSchema = createEventSchema("stream.accrued", {
  amount: z.string(),
  accrued_since: z.number().int(),
  accrued_until: z.number().int(),
  timestamp: z.number().int(),
});

export const STREAM_EVENT_SCHEMAS = [
  StreamCreatedSchema,
  StreamSettledSchema,
  StreamPausedSchema,
  StreamResumedSchema,
  StreamRateUpdatedSchema,
  StreamCancelledSchema,
  StreamAccruedSchema,
] as const;

export type StreamEvent = z.infer<(typeof STREAM_EVENT_SCHEMAS)[number]>;
