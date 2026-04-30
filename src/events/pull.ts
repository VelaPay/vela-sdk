import { z } from "zod";
import { createEventSchema } from "./base";

export const PullSucceededSchema = createEventSchema("pull.succeeded", {
  amount: z.string(),
  next_payment_due: z.number().int().optional(),
  status: z.string().optional(),
});

export const PullFailedSchema = createEventSchema("pull.failed", {
  amount: z.string(),
  reason: z.string(),
});

export const PULL_EVENT_SCHEMAS = [
  PullSucceededSchema,
  PullFailedSchema,
] as const;

export type PullEvent = z.infer<(typeof PULL_EVENT_SCHEMAS)[number]>;
