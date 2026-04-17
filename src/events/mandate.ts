import { z } from "zod";
import { createEventSchema } from "./base";

const ChangeTypeSchema = z.enum(["upgrade", "downgrade", "token_switch"]);

export const MandateCreatedSchema = createEventSchema("mandate.created", {
  subscriber: z.string(),
  merchant: z.string(),
  plan: z.string(),
  amount: z.string(),
  frequency: z.number().int(),
  status: z.enum(["active", "paused", "cancelled"]),
  started_at: z.number().int(),
  next_payment_due: z.number().int().optional(),
});

export const MandateUpdatedSchema = createEventSchema("mandate.updated", {
  subscriber: z.string(),
  merchant: z.string().optional(),
  plan: z.string(),
  amount: z.string(),
  frequency: z.number().int().optional(),
  status: z.enum(["active", "paused", "cancelled"]),
  updated_at: z.number().int(),
});

export const MandateCancelledSchema = createEventSchema("mandate.cancelled", {
  subscriber: z.string(),
  merchant: z.string().optional(),
  plan: z.string().optional(),
  cancelled_at: z.number().int(),
  status: z.literal("cancelled"),
});

const mandateUpgradeShape = {
  old_plan: z.string(),
  new_plan: z.string(),
  proration_amount: z.string(),
  change_type: ChangeTypeSchema,
  applied_at: z.number().int(),
} as const;

export const MandateUpgradeInitiatedSchema = createEventSchema(
  "mandate.upgrade_initiated",
  {
    ...mandateUpgradeShape,
    signer: z.string(),
    timestamp: z.number().int(),
  },
);

export const MandateUpgradeFinalizedSchema = createEventSchema(
  "mandate.upgrade_finalized",
  {
    ...mandateUpgradeShape,
    timestamp: z.number().int(),
  },
);

export const MandateUpgradeCancelledSchema = createEventSchema(
  "mandate.upgrade_cancelled",
  {
    ...mandateUpgradeShape,
    signer: z.string(),
    timestamp: z.number().int(),
  },
);

export const MANDATE_EVENT_SCHEMAS = [
  MandateCreatedSchema,
  MandateUpdatedSchema,
  MandateCancelledSchema,
  MandateUpgradeInitiatedSchema,
  MandateUpgradeFinalizedSchema,
  MandateUpgradeCancelledSchema,
] as const;

export type MandateEvent = z.infer<(typeof MANDATE_EVENT_SCHEMAS)[number]>;
export type MandateChangeType = z.infer<typeof ChangeTypeSchema>;
