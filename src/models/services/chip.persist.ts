// src/models/services/chip.persist.ts
//
// Ordered execution of ONE whole-state Chip save (the non-RPC path used while
// CHIP_APPLY_ENABLED is off). Supabase-free so the ordering rules are unit-testable:
// chipService.save builds the plan with its row mappers and runs it against a
// Supabase-backed ChipPersistBackend.
//
// Ordering (tournament 2766 audit, 2026-09-24): a save whose main-state writes failed still
// appended its activity events, leaving history for results that never persisted. Now:
//   1. MAIN STATE — config (core, extended, restore points), entries, matches, tables.
//      Every section is attempted (as before) so as much of the snapshot lands as possible.
//   2. If ANY main-state section failed → throw; NO events are written for this snapshot.
//   3. Activity events (append-only, idempotent by id) → superseded flags.
//   4. Soft-CAS version bump — only after the whole snapshot persisted.
// Every step is an idempotent snapshot write, so retrying the SAME plan is safe: it never
// replays a tournament action.

export type ChipSaveStage =
  | "config_core"
  | "config_extended"
  | "config_restore_points"
  | "entries"
  | "matches"
  | "tables"
  | "events"
  | "events_superseded";

export type ChipRowTable = "chip_entries" | "chip_matches" | "chip_tables";

// A structured save failure: which stage/table failed and the backend's code/status, so the
// exact error is recoverable from logs next time.
export class ChipSaveError extends Error {
  stage: ChipSaveStage;
  table: string;
  code: string | null;
  status: number | null;
  // Other main-state stages that also failed in the same attempt (first one is `stage`).
  alsoFailed: ChipSaveStage[];
  constructor(
    stage: ChipSaveStage,
    table: string,
    cause: unknown,
    alsoFailed: ChipSaveStage[] = [],
  ) {
    const info = describeError(cause);
    super(info.message);
    this.name = "ChipSaveError";
    this.stage = stage;
    this.table = table;
    this.code = info.code;
    this.status = info.status;
    this.alsoFailed = alsoFailed;
  }
}

export const describeError = (
  e: unknown,
): { message: string; code: string | null; status: number | null } => {
  if (e instanceof ChipSaveError) return { message: e.message, code: e.code, status: e.status };
  const obj = (e ?? {}) as { message?: unknown; code?: unknown; status?: unknown };
  const message =
    typeof obj.message === "string" && obj.message
      ? obj.message
      : typeof e === "string"
        ? e
        : "Unknown error";
  const code = obj.code != null && obj.code !== "" ? String(obj.code) : null;
  const status = typeof obj.status === "number" ? obj.status : null;
  return { message, code, status };
};

export interface ChipPersistBackend {
  // Upsert one patch onto the tournament's chip_config row. Throws on error.
  upsertConfig(patch: Record<string, unknown>): Promise<void>;
  // Best-effort config write whose failure is ignored (column may be pending migration).
  upsertConfigSoft(patch: Record<string, unknown>): Promise<void>;
  // Upsert `rows` and prune this tournament's rows whose id is not in `ids`. Throws on error.
  syncRows(table: ChipRowTable, rows: Record<string, unknown>[], ids: string[]): Promise<void>;
  // Append events (insert, ignore ids that already exist). Throws on error.
  insertEvents(rows: Record<string, unknown>[]): Promise<void>;
  // Flip superseded=true on these event ids. Throws on error.
  markSuperseded(ids: string[]): Promise<void>;
  // Soft CAS: read the live version, report a conflict vs `expected`, bump it. Never throws.
  bumpVersion(expected: number | null | undefined): Promise<{ version: number; conflict: boolean }>;
}

export interface ChipSavePlan {
  configCore: Record<string, unknown>;
  configExtended: Record<string, unknown>;
  configRestorePoints: Record<string, unknown>;
  configSoft: Record<string, unknown>;
  entries: { rows: Record<string, unknown>[]; ids: string[] };
  matches: { rows: Record<string, unknown>[]; ids: string[] };
  tables: { rows: Record<string, unknown>[]; ids: string[] };
  events: Record<string, unknown>[];
  supersededEventIds: string[];
  expectedVersion?: number | null;
}

export const executeChipSave = async (
  backend: ChipPersistBackend,
  plan: ChipSavePlan,
): Promise<{ version: number; conflict: boolean }> => {
  const failures: { stage: ChipSaveStage; table: string; error: unknown }[] = [];
  const run = async (stage: ChipSaveStage, table: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      failures.push({ stage, table, error: e });
    }
  };

  // 1. MAIN STATE. CORE config (queue etc.) first; the newer column groups are separate
  // writes so a pending migration can never take the queue down with it.
  await run("config_core", "chip_config", () => backend.upsertConfig(plan.configCore));
  await run("config_extended", "chip_config", () => backend.upsertConfig(plan.configExtended));
  await run("config_restore_points", "chip_config", () =>
    backend.upsertConfig(plan.configRestorePoints),
  );
  try {
    await backend.upsertConfigSoft(plan.configSoft);
  } catch {
    /* non-critical column — never a save failure */
  }
  await run("entries", "chip_entries", () =>
    backend.syncRows("chip_entries", plan.entries.rows, plan.entries.ids),
  );
  await run("matches", "chip_matches", () =>
    backend.syncRows("chip_matches", plan.matches.rows, plan.matches.ids),
  );
  await run("tables", "chip_tables", () =>
    backend.syncRows("chip_tables", plan.tables.rows, plan.tables.ids),
  );

  // 2. Main state incomplete → stop BEFORE history. No events for a snapshot that didn't land.
  if (failures.length) {
    const [first, ...rest] = failures;
    throw new ChipSaveError(first.stage, first.table, first.error, rest.map((f) => f.stage));
  }

  // 3. Activity history, only once the state it describes has persisted.
  if (plan.events.length) {
    try {
      await backend.insertEvents(plan.events);
    } catch (e) {
      throw new ChipSaveError("events", "chip_events", e);
    }
  }
  if (plan.supersededEventIds.length) {
    try {
      await backend.markSuperseded(plan.supersededEventIds);
    } catch (e) {
      throw new ChipSaveError("events_superseded", "chip_events", e);
    }
  }

  // 4. Soft CAS bump — after the whole snapshot persisted, so a failed attempt that is then
  // retried doesn't report a false cross-director conflict.
  return backend.bumpVersion(plan.expectedVersion);
};

// Save-failure analytics record (error_logged, entity tournament). No player data: stage,
// table, backend code/status and a truncated message only. Kept well under the 2 KB
// metadata limit enforced by log_app_event.
export const buildSaveFailureLog = (args: {
  tournamentId: number;
  error: unknown;
  attempt: number;
  maxAttempts: number;
  willRetry: boolean;
  platform?: string;
  at?: string;
}): Record<string, unknown> => {
  const info = describeError(args.error);
  const saveErr = args.error instanceof ChipSaveError ? args.error : null;
  return {
    kind: "chip_save_failed",
    tournament_id: args.tournamentId,
    stage: saveErr?.stage ?? "unknown",
    table: saveErr?.table ?? null,
    also_failed: saveErr?.alsoFailed.length ? saveErr.alsoFailed : undefined,
    error_message: info.message.slice(0, 300),
    error_code: info.code,
    error_status: info.status,
    attempt: args.attempt,
    max_attempts: args.maxAttempts,
    will_retry: args.willRetry,
    platform: args.platform ?? null,
    at: args.at ?? new Date().toISOString(),
  };
};
