// Phase 45/46 do not currently emit a plan_change.* family. Keep the reserved
// family bucket empty so downstream schema tooling can treat it as additive-only.
export const PLAN_CHANGE_EVENT_SCHEMAS = [] as const;
