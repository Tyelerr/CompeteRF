// src/utils/scheduler-entry.ts
// Entry point for the server scheduler bundle (supabase/functions/_shared/scheduler.bundle.js,
// built by `npm run build:scheduler`). Exports ONLY the pure planning functions the
// auto-assign-run Edge Function needs — the same code the app runs. Do not import React/RN here.
export { autoAssignActive, computeTableOccupancy, planAutoAssignFromState } from "./auto-assign";
