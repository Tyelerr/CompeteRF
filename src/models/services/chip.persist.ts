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
// Multi-director safety (2026-10 hardening): when the backend supports it, step 0 is an ATOMIC
// version CLAIM (UPDATE chip_config SET version = v+1 WHERE tournament_id = X AND version = v).
// Exactly one of two devices that loaded the same version can win it; the other writes NOTHING
// and gets a conflict. The old read-then-bump let both pass the pre-check and interleave their
// writes (one match result lost in 200/200 overlapping trials). With a claim, step 4 becomes a
// second atomic step (finalize) so a board loaded mid-write can never be committed back.
// Every step is an idempotent snapshot write, so retrying the SAME plan is safe: it never
// replays a tournament action.

export type ChipSaveStage =
  | "version_claim"
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
  // Upsert `rows` and prune this tournament's rows whose id is not in `ids` (unless
  // opts.prune === false: a delta save that removed nothing). Throws on error.
  syncRows(
    table: ChipRowTable,
    rows: Record<string, unknown>[],
    ids: string[],
    opts?: { prune?: boolean },
  ): Promise<void>;
  // Append events (insert, ignore ids that already exist). Throws on error.
  insertEvents(rows: Record<string, unknown>[]): Promise<void>;
  // Flip superseded=true on these event ids. Throws on error.
  markSuperseded(ids: string[]): Promise<void>;
  // Soft CAS: read the live version, report a conflict vs `expected`, bump it. Never throws.
  bumpVersion(expected: number | null | undefined): Promise<{ version: number; conflict: boolean }>;
  // Read the live chip_config.version WITHOUT writing (pre-write stale check). null = unknown
  // (no row / no column / transient error) → the save proceeds as before. Never throws.
  readVersion?(): Promise<number | null>;
  // ATOMIC compare-and-set: bump version expected -> expected+1 only if it still equals
  // expected. "changed" = another device saved first; "unsupported" = no config row / column
  // (first save, pre-migration) -> legacy pre-check. Network/server errors THROW.
  claimVersion?(expected: number): Promise<"claimed" | "changed" | "unsupported">;
}

// A version THIS device claimed whose snapshot did not finish persisting (a write failed after
// the claim). The retry of that snapshot is rebuilt with the SAME expectedVersion (the VM only
// advances its baseline on success), so without this it would lose its own claim and report a
// false "changed on another device". Keyed by tournament; cleared on success. If another device
// claimed in between, the retry's claim fails and the conflict is real.
const ownClaims = new Map<number, { from: number; to: number }>();
export const resetOwnChipClaimsForTests = () => {
  ownClaims.clear();
  persisted.clear();
};

// DELTA SAVES (2026-10 hardening). What THIS device last persisted for a tournament, and the
// cloud version that write ended at. When the next save's expectedVersion still equals that
// version, the cloud provably holds exactly our last write for every versioned section (the
// claim/finalize CAS means no other director wrote in between), so unchanged rows, unchanged
// config sections, already-inserted events and already-superseded ids are not re-sent. Any
// other version (a reload, another device's save, a first save) → a full save, as before.
// Only claimed (CAS) saves populate it. Rows written out-of-band (e.g. a side-pot toggle) are
// no longer clobbered by unchanged snapshot rows; changed rows are still sent whole.
interface PersistedSnapshot {
  version: number;
  config: Record<"extended" | "restore" | "soft", string>;
  rows: Record<ChipRowTable, Map<string, string>>;
  events: Set<string>;
  superseded: Set<string>;
}
const persisted = new Map<number, PersistedSnapshot>();
const rowKey = (r: Record<string, unknown>) => String(r.id);
const sig = (v: unknown) => JSON.stringify(v);

// Result of a legacy (soft-CAS) save. `aborted` = the pre-write check found the cloud already
// at a NEWER version than this device loaded: NOTHING was written (another device saved first).
export interface ChipSaveResult {
  version: number;
  conflict: boolean;
  aborted?: boolean;
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
  // Tournament id — keys the own-claim memory across retries of one snapshot.
  claimKey?: number;
}

export const executeChipSave = async (
  backend: ChipPersistBackend,
  plan: ChipSavePlan,
): Promise<ChipSaveResult> => {
  // 0. PRE-WRITE STALE CHECK (soft CAS, CHIP_APPLY_ENABLED off). If the cloud version already
  // moved past what this device loaded, another director saved since: write NOTHING (a whole
  // snapshot from this device would overwrite/prune their rows) and report the conflict so
  // the TD reloads. Not atomic — a save racing in between this read and the writes is still
  // only caught afterwards by bumpVersion — but a stale device can no longer knowingly
  // overwrite a newer cloud state.
  let claimed: number | null = null;
  if (plan.expectedVersion != null && backend.claimVersion) {
    const own = plan.claimKey != null ? ownClaims.get(plan.claimKey) : undefined;
    const base = own && own.from === plan.expectedVersion ? own.to : plan.expectedVersion;
    let claim: "claimed" | "changed" | "unsupported";
    try {
      claim = await backend.claimVersion(base);
    } catch (e) {
      throw new ChipSaveError("version_claim", "chip_config", e); // retried; nothing written
    }
    if (claim === "changed") {
      const live = backend.readVersion ? await backend.readVersion() : null;
      return { version: live ?? base, conflict: true, aborted: true };
    }
    if (claim === "claimed") {
      claimed = base + 1;
      if (plan.claimKey != null) ownClaims.set(plan.claimKey, { from: plan.expectedVersion, to: claimed });
    }
  }
  if (claimed == null && plan.expectedVersion != null && backend.readVersion) {
    const live = await backend.readVersion();
    if (live != null && live !== plan.expectedVersion) {
      return { version: live, conflict: true, aborted: true };
    }
  }

  // Delta baseline: only when the cloud is exactly our last persisted write (same version).
  const prior =
    plan.claimKey != null && plan.expectedVersion != null ? persisted.get(plan.claimKey) : undefined;
  const delta = prior && prior.version === plan.expectedVersion && claimed != null ? prior : undefined;
  const sectionChanged = (k: keyof PersistedSnapshot["config"], v: unknown) => !delta || delta.config[k] !== sig(v);
  const rowDelta = (table: ChipRowTable, sec: { rows: Record<string, unknown>[]; ids: string[] }) => {
    if (!delta) return { rows: sec.rows, prune: true };
    const was = delta.rows[table];
    const rows = sec.rows.filter((r) => was.get(rowKey(r)) !== sig(r));
    const now = new Set(sec.ids);
    const removed = [...was.keys()].some((k) => !now.has(k));
    return { rows, prune: removed };
  };

  const failures: { stage: ChipSaveStage; table: string; error: unknown }[] = [];
  const run = async (stage: ChipSaveStage, table: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      failures.push({ stage, table, error: e });
    }
  };

  // 1. MAIN STATE. The column groups are separate writes so a pending migration can never take
  // the queue down with it. They are independent (different columns / tables, and with a claim no
  // other director writes concurrently), so they run in PARALLEL: same requests, ~1 round trip of
  // wall time instead of ~7. Core config (queue) is always sent; with a delta baseline, unchanged
  // sections / rows are skipped and a table with no removed rows skips its prune.
  const tasks: Promise<void>[] = [run("config_core", "chip_config", () => backend.upsertConfig(plan.configCore))];
  if (sectionChanged("extended", plan.configExtended))
    tasks.push(run("config_extended", "chip_config", () => backend.upsertConfig(plan.configExtended)));
  if (sectionChanged("restore", plan.configRestorePoints))
    tasks.push(run("config_restore_points", "chip_config", () => backend.upsertConfig(plan.configRestorePoints)));
  if (sectionChanged("soft", plan.configSoft))
    tasks.push(
      (async () => {
        try {
          await backend.upsertConfigSoft(plan.configSoft);
        } catch {
          /* non-critical column — never a save failure */
        }
      })(),
    );
  const sections: [ChipSaveStage, ChipRowTable, { rows: Record<string, unknown>[]; ids: string[] }][] = [
    ["entries", "chip_entries", plan.entries],
    ["matches", "chip_matches", plan.matches],
    ["tables", "chip_tables", plan.tables],
  ];
  for (const [stage, table, sec] of sections) {
    const d = rowDelta(table, sec);
    if (!d.rows.length && !d.prune) continue; // nothing changed in this table
    tasks.push(
      run(stage, table, () =>
        d.prune ? backend.syncRows(table, d.rows, sec.ids) : backend.syncRows(table, d.rows, sec.ids, { prune: false }),
      ),
    );
  }
  await Promise.all(tasks);

  // 2. Main state incomplete → stop BEFORE history. No events for a snapshot that didn't land.
  if (failures.length) {
    const [first, ...rest] = failures;
    throw new ChipSaveError(first.stage, first.table, first.error, rest.map((f) => f.stage));
  }

  // 3. Activity history, only once the state it describes has persisted (delta: only events /
  // superseded flags this device has not already persisted).
  const newEvents = delta ? plan.events.filter((r) => !delta.events.has(rowKey(r))) : plan.events;
  const newSuperseded = delta ? plan.supersededEventIds.filter((id) => !delta.superseded.has(id)) : plan.supersededEventIds;
  if (newEvents.length) {
    try {
      await backend.insertEvents(newEvents);
    } catch (e) {
      throw new ChipSaveError("events", "chip_events", e);
    }
  }
  if (newSuperseded.length) {
    try {
      await backend.markSuperseded(newSuperseded);
    } catch (e) {
      throw new ChipSaveError("events_superseded", "chip_events", e);
    }
  }
  const remember = (version: number) => {
    if (plan.claimKey == null) return;
    const rowsOf = (sec: { rows: Record<string, unknown>[] }) => new Map(sec.rows.map((r) => [rowKey(r), sig(r)]));
    persisted.set(plan.claimKey, {
      version,
      config: { extended: sig(plan.configExtended), restore: sig(plan.configRestorePoints), soft: sig(plan.configSoft) },
      rows: { chip_entries: rowsOf(plan.entries), chip_matches: rowsOf(plan.matches), chip_tables: rowsOf(plan.tables) },
      events: new Set(plan.events.map(rowKey)),
      superseded: new Set(plan.supersededEventIds),
    });
  };

  // 4. Version: already advanced atomically by the claim (any other device's claim failed, so
  // nothing else wrote in between). Legacy path: soft-CAS bump after the snapshot.
  if (claimed != null) {
    if (plan.claimKey != null) ownClaims.delete(plan.claimKey);
    // FINALIZE: one more atomic step (claimed -> claimed+1) once the whole snapshot is written.
    // A device that loaded WHILE this save was mid-write read a half-written board at version
    // `claimed`; finalizing moves the cloud past it, so that device's next claim fails and it
    // reloads instead of committing stale rows. If someone claimed our in-progress version first
    // (they loaded mid-write AND saved before we finished), the writes interleaved: report it.
    let fin: "claimed" | "changed" | "unsupported";
    try {
      fin = await backend.claimVersion!(claimed);
    } catch {
      return { version: claimed, conflict: false }; // persisted; a reader may see one stale step
    }
    if (fin === "changed") {
      if (plan.claimKey != null) persisted.delete(plan.claimKey);
      const live = backend.readVersion ? await backend.readVersion() : null;
      return { version: live ?? claimed, conflict: true };
    }
    remember(claimed + 1);
    return { version: claimed + 1, conflict: false };
  }
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
