import { z } from "zod";
import {
  MandateCancelledSchema,
  MandateCreatedSchema,
  MandateUpdatedSchema,
  MandateUpgradeCancelledSchema,
  MandateUpgradeFinalizedSchema,
  MandateUpgradeInitiatedSchema,
} from "./mandate";
import { PLAN_CHANGE_EVENT_SCHEMAS } from "./plan_change";
import { PullFailedSchema, PullSucceededSchema } from "./pull";
import {
  StreamAccruedSchema,
  StreamCancelledSchema,
  StreamCreatedSchema,
  StreamPausedSchema,
  StreamRateUpdatedSchema,
  StreamResumedSchema,
  StreamSettledSchema,
} from "./stream";

const EVENT_SCHEMA_LIST = [
  StreamCreatedSchema,
  StreamSettledSchema,
  StreamPausedSchema,
  StreamResumedSchema,
  StreamRateUpdatedSchema,
  StreamCancelledSchema,
  StreamAccruedSchema,
  MandateCreatedSchema,
  MandateUpdatedSchema,
  MandateCancelledSchema,
  MandateUpgradeInitiatedSchema,
  MandateUpgradeFinalizedSchema,
  MandateUpgradeCancelledSchema,
  PullSucceededSchema,
  PullFailedSchema,
  ...PLAN_CHANGE_EVENT_SCHEMAS,
] as const;

export const EVENT_SCHEMAS = {
  "stream.created": StreamCreatedSchema,
  "stream.settled": StreamSettledSchema,
  "stream.paused": StreamPausedSchema,
  "stream.resumed": StreamResumedSchema,
  "stream.rate_updated": StreamRateUpdatedSchema,
  "stream.cancelled": StreamCancelledSchema,
  "stream.accrued": StreamAccruedSchema,
  "mandate.created": MandateCreatedSchema,
  "mandate.updated": MandateUpdatedSchema,
  "mandate.cancelled": MandateCancelledSchema,
  "mandate.upgrade_initiated": MandateUpgradeInitiatedSchema,
  "mandate.upgrade_finalized": MandateUpgradeFinalizedSchema,
  "mandate.upgrade_cancelled": MandateUpgradeCancelledSchema,
  "pull.succeeded": PullSucceededSchema,
  "pull.failed": PullFailedSchema,
} satisfies Record<string, z.ZodType>;

export const VelaEventSchema = z.discriminatedUnion(
  "event_type",
  EVENT_SCHEMA_LIST,
);

export type VelaEvent = z.infer<typeof VelaEventSchema>;
