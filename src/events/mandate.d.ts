import { z } from "zod";
declare const ChangeTypeSchema: z.ZodEnum<{
  upgrade: "upgrade";
  downgrade: "downgrade";
  token_switch: "token_switch";
}>;
export declare const MandateCreatedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.created">;
  },
  z.core.$strip
>;
export declare const MandateUpdatedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.updated">;
  },
  z.core.$strip
>;
export declare const MandateCancelledSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.cancelled">;
  },
  z.core.$strip
>;
export declare const MandateUpgradeInitiatedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.upgrade_initiated">;
  },
  z.core.$strip
>;
export declare const MandateUpgradeFinalizedSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.upgrade_finalized">;
  },
  z.core.$strip
>;
export declare const MandateUpgradeCancelledSchema: z.ZodObject<
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
    event_type: z.ZodLiteral<"mandate.upgrade_cancelled">;
  },
  z.core.$strip
>;
export declare const MANDATE_EVENT_SCHEMAS: readonly [
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
      event_type: z.ZodLiteral<"mandate.created">;
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
      event_type: z.ZodLiteral<"mandate.updated">;
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
      event_type: z.ZodLiteral<"mandate.cancelled">;
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
      event_type: z.ZodLiteral<"mandate.upgrade_initiated">;
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
      event_type: z.ZodLiteral<"mandate.upgrade_finalized">;
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
      event_type: z.ZodLiteral<"mandate.upgrade_cancelled">;
    },
    z.core.$strip
  >,
];
export type MandateEvent = z.infer<(typeof MANDATE_EVENT_SCHEMAS)[number]>;
export type MandateChangeType = z.infer<typeof ChangeTypeSchema>;
//# sourceMappingURL=mandate.d.ts.map
