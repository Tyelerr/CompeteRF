// src/models/services/chip.local-recovery.ts
//
// WEB-ONLY local backup + recovery for live Chip tournaments (Phase 1: view-only recovery).
// Supabase-free so it is unit-testable (like chip.save-queue.ts / chip.persist.ts).
//
// What it does:
//   • Keeps a durable browser-local copy (IndexedDB) of an active Chip tournament so a TD can
//     still SEE the last known board after a tab/browser/computer restart while the cloud
//     (Supabase / venue internet) is unavailable.
//   • Rolling history: the latest CHIP_RECOVERY_KEEP (3) snapshots per tournament. A snapshot
//     that fails validation on read is skipped in favour of the next-newest one.
//   • Never writes to Supabase. Never replaces the save queue: it sits alongside it. The
//     authoritative online path is still chip.save-queue → chip.persist → Supabase.
//
// Layers:
//   ChipRecoveryStorage       dumb record store (IndexedDB on web, in-memory for tests)
//   createChipLocalRecovery   rolling history, validation, retention/pruning, conflict archive
//   createChipBackupWriter    fire-and-forget, serialized, coalescing writer (never throws)
//   pure helpers              fingerprint, cloud-vs-local comparison, load-failure decision,
//                             read-only lock used by the viewmodel while viewing a backup.

import { describeError } from "./chip.persist";
import { ChipEntry, ChipState } from "../types/chip.types";
import type { ChipOfflineSession } from "./chip.offline-controller";
import { chipConfigPayload, entryToRow, eventToRow, matchToRow, tableToRow } from "./chip.rows";

export const CHIP_RECOVERY_SCHEMA = 1;
// Rolling snapshots kept per tournament (Latest / Previous / Older).
export const CHIP_RECOVERY_KEEP = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// Retention (see pruneSnapshots). Active = latest snapshot not finished.
export const CHIP_RECOVERY_RETENTION = {
  activeMs: 14 * DAY_MS, // in-progress tournament: 14 days after its last local save
  finishedMs: 3 * DAY_MS, // finished tournament: 3 days after its last local save
  conflictMs: 7 * DAY_MS, // a divergent backup set aside on cloud reload: 7 days
  maxTournaments: 20, // hard cap on tournaments with backups (oldest dropped first)
};
// Periodic safety checkpoint while a live Chip tournament is open (per-action snapshots are
// the primary mechanism; the checkpoint only re-writes when the newest state was not backed up).
export const CHIP_RECOVERY_CHECKPOINT_MS = 3 * 60 * 1000;

// The subset of the tournaments row the Chip screen needs to render a recovered board.
// Whitelisted — no venue contact/owner data, no director/user data.
export interface ChipRecoveryTournamentInfo {
  id: number;
  name: string | null;
  status: string | null;
  live_state: string | null;
  tournament_format: string | null;
  game_type: string | null;
  entry_fee: number | null;
  added_money: number | null;
  max_fargo: number | null;
  open_tournament: boolean | null;
  side_pots: unknown;
  live_settings: unknown;
  tournament_date: string | null;
  start_time: string | null;
  timezone: string | null;
  venue_id: number | null;
  venues: { venue: string | null } | null;
}

export type ChipRecoveryReason = "action" | "load" | "checkpoint";

export interface ChipRecoverySnapshot {
  schema: number;
  key: string;
  kind: "rolling" | "conflict";
  tournamentId: number;
  // Supabase auth user id of the director whose session made this backup. The offline entry
  // point only lists backups owned by the session stored on this browser.
  ownerUserId: string | null;
  seq: number; // local generation, monotonic per tournament
  savedAt: string; // local backup time (ISO)
  reason: ChipRecoveryReason;
  // Last chip_config.version this client had loaded/saved when the snapshot was taken.
  cloudVersion: number | null;
  // true once the save queue confirmed THIS state persisted to the cloud.
  cloudConfirmed: boolean;
  cloudSavedAt: string | null;
  finished: boolean;
  fingerprint: string;
  tournament: ChipRecoveryTournamentInfo;
  chip: ChipState;
  archivedAt?: string | null;
  // Phase 2: set while this snapshot was written by an OFFLINE controller (base cloud
  // version/fingerprint, unsynced count…). Cleared once the cloud confirms the state.
  offlineSession?: ChipOfflineSession | null;
}

export interface ChipRecoverySnapshotInput {
  tournamentId: number;
  ownerUserId: string | null;
  tournament: ChipRecoveryTournamentInfo;
  chip: ChipState;
  reason: ChipRecoveryReason;
  cloudVersion: number | null;
  cloudConfirmed: boolean;
  finished: boolean;
  offlineSession?: ChipOfflineSession | null;
}

// ── pure helpers ──────────────────────────────────────────────────────────────

// Player phone numbers are not needed to view a board — strip them from the local copy
// (entries and restore-point entry snapshots). Everything else is the authoritative state.
export const sanitizeChipForBackup = (chip: ChipState): ChipState => {
  const strip = <T extends Partial<ChipEntry>>(e: T): T => (e.p1Phone ? { ...e, p1Phone: null } : e);
  return {
    ...chip,
    entries: chip.entries.map(strip),
    restorePoints: chip.restorePoints?.map((rp) => ({
      ...rp,
      snapshot: { ...rp.snapshot, entries: rp.snapshot.entries.map((e) => strip(e as Partial<ChipEntry>) as typeof e) },
    })),
  };
};

export const pickRecoveryTournamentInfo = (t: Record<string, any>): ChipRecoveryTournamentInfo => ({
  id: Number(t.id),
  name: t.name ?? null,
  status: t.status ?? null,
  live_state: t.live_state ?? null,
  tournament_format: t.tournament_format ?? null,
  game_type: t.game_type ?? null,
  entry_fee: t.entry_fee ?? null,
  added_money: t.added_money ?? null,
  max_fargo: t.max_fargo ?? null,
  open_tournament: t.open_tournament ?? null,
  side_pots: t.side_pots ?? null,
  live_settings: t.live_settings ?? null,
  tournament_date: t.tournament_date ?? null,
  start_time: t.start_time ?? null,
  timezone: t.timezone ?? null,
  venue_id: t.venue_id ?? null,
  venues: t.venues ? { venue: t.venues.venue ?? null } : null,
});

// 53-bit string hash (cyrb53) — compact fingerprint storage, not security.
const hash53 = (str: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// Conflict fingerprint = a hash of EXACTLY what a whole-state cloud sync writes (the same
// chip.rows mappers chipService.save uses): chip_config (queue, start/finish/winner, shuffle
// state, round, restore points, reshuffle ids), every owned entry row (chips, W/L, status,
// table, overrides, side pots…), every match row, every table row in order (label, lock,
// inactive/closing, stream, holder/challenger/match), every event row (incl. superseded), plus
// the tournament's chip settings (format, tiers, buy-backs). Rule: if a sync can overwrite a
// field, a change to it changes the fingerprint.
// Excluded on purpose: per-write metadata (updated_at, tournament_id), phone numbers (never
// stored in local backups), and registration-PROJECTED entries (a sync never writes them).
// Normalized symmetrically so a cloud round-trip is not a false conflict: ISO timestamps →
// epoch ms, numeric strings → numbers, null/undefined → absent, object keys sorted (jsonb).
const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const NUMERIC_STR = /^-?\d+(\.\d+)?$/;
const canonical = (v: unknown): unknown => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    if (ISO_TS.test(v)) {
      const t = Date.parse(v.replace(" ", "T"));
      if (!Number.isNaN(t)) return t;
    }
    if (NUMERIC_STR.test(v)) return Number(v);
    return v;
  }
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const c = canonical((v as Record<string, unknown>)[k]);
      if (c !== null) out[k] = c;
    }
    return out;
  }
  return v;
};
const omit = <T extends Record<string, unknown>>(o: T, keys: string[]) => {
  const out: Record<string, unknown> = { ...o };
  for (const k of keys) delete out[k];
  return out;
};
const byIdAsc = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const chipRecoveryFingerprint = (chip: ChipState): string => {
  const owned = chip.entries.filter((e) => !e.fromRegistration).slice().sort(byIdAsc);
  const shape = {
    settings: chip.settings,
    config: chipConfigPayload(chip),
    entries: owned.map((e) => omit(entryToRow(0, e), ["tournament_id", "p1_phone"])),
    matches: chip.matches.slice().sort(byIdAsc).map((m) => omit(matchToRow(0, m), ["tournament_id"])),
    tables: chip.tables.map((t, i) => omit(tableToRow(0, t, i), ["tournament_id"])),
    events: chip.events.slice().sort(byIdAsc).map((ev) => omit(eventToRow(0, ev), ["tournament_id"])),
  };
  return hash53(JSON.stringify(canonical(shape)));
};

// Load errors that are DEFINITIVE answers from a reachable server (not an outage): the
// tournament does not exist / this user may not read it. Everything else — network failures,
// timeouts, 5xx, PostgREST connection errors, and unknown failures — is treated as "cloud
// unavailable" so a TD is offered the local copy whenever there is doubt.
const DEFINITIVE_CODES = new Set(["PGRST116", "PGRST301", "PGRST302", "42501", "28000"]);
export const isCloudUnavailableError = (e: unknown, online?: boolean | null): boolean => {
  if (online === false) return true;
  const { message, code, status } = describeError(e);
  if (code && DEFINITIVE_CODES.has(code)) return false;
  if (status === 401 || status === 403 || status === 404) return false;
  if (/not found|permission denied|jwt/i.test(message)) return false;
  return true;
};

export type ChipLoadFailureDecision =
  | { kind: "offer_recovery"; snapshot: ChipRecoverySnapshot }
  | { kind: "error" };

// Cloud load failed: offer the local copy only when the failure looks like an outage AND a
// valid backup exists. Otherwise the existing error handling applies unchanged.
export const decideLoadFailure = (
  error: unknown,
  snapshot: ChipRecoverySnapshot | null,
  online?: boolean | null,
): ChipLoadFailureDecision =>
  snapshot && isCloudUnavailableError(error, online) ? { kind: "offer_recovery", snapshot } : { kind: "error" };

export type ChipCloudComparison = "consistent" | "conflict";

// Cloud is reachable again while a local backup is being viewed. Consistent = same gameplay
// fingerprint (the backup holds nothing the cloud lacks, and the cloud has not moved on).
// Anything else is a conflict the TD resolves — never an automatic overwrite either way.
export const compareCloudToLocal = (cloudChip: ChipState, snapshot: ChipRecoverySnapshot): ChipCloudComparison =>
  chipRecoveryFingerprint(cloudChip) === snapshot.fingerprint ? "consistent" : "conflict";

// After a SUCCESSFUL normal cloud load: is the newest local backup a state the cloud never
// confirmed (e.g. the tab closed before the save landed)? Such a backup is set aside as a
// conflict archive so ordinary play can't rotate it out of the rolling history.
export const isDivergentUnconfirmedBackup = (cloudChip: ChipState, latest: ChipRecoverySnapshot | null): boolean =>
  !!latest && !latest.cloudConfirmed && compareCloudToLocal(cloudChip, latest) === "conflict";

// Read-only lock for recovery mode. The viewmodel checks `blocks(action)` at every mutation
// chokepoint; while active it refuses the action and reports it (so the screen can say why).
export interface ChipRecoveryLock {
  enter(): void;
  exit(): void;
  isActive(): boolean;
  blocks(action: string): boolean;
}
export const createRecoveryLock = (onBlocked?: (action: string) => void): ChipRecoveryLock => {
  let active = false;
  return {
    enter: () => {
      active = true;
    },
    exit: () => {
      active = false;
    },
    isActive: () => active,
    blocks: (action: string) => {
      if (!active) return false;
      onBlocked?.(action);
      return true;
    },
  };
};

const isValidSnapshot = (r: unknown): r is ChipRecoverySnapshot => {
  const s = r as ChipRecoverySnapshot | null;
  const c = s?.chip;
  return (
    !!s &&
    s.schema === CHIP_RECOVERY_SCHEMA &&
    typeof s.tournamentId === "number" &&
    typeof s.savedAt === "string" &&
    !Number.isNaN(Date.parse(s.savedAt)) &&
    !!s.tournament &&
    !!c &&
    typeof c.settings === "object" &&
    Array.isArray(c.entries) &&
    Array.isArray(c.tables) &&
    Array.isArray(c.matches) &&
    Array.isArray(c.queue) &&
    Array.isArray(c.events)
  );
};

const newestFirst = (a: ChipRecoverySnapshot, b: ChipRecoverySnapshot) =>
  b.seq - a.seq || Date.parse(b.savedAt) - Date.parse(a.savedAt);

// ── storage ───────────────────────────────────────────────────────────────────

export interface ChipRecoveryStorage {
  put(rec: ChipRecoverySnapshot): Promise<void>;
  listByTournament(tournamentId: number): Promise<unknown[]>;
  listAll(): Promise<unknown[]>;
  delete(keys: string[]): Promise<void>;
}

// In-memory storage. `backing` lets a test recreate the service over the same "database".
export const createMemoryRecoveryStorage = (backing: Map<string, unknown> = new Map()): ChipRecoveryStorage => {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    async put(rec) {
      backing.set(rec.key, clone(rec));
    },
    async listByTournament(tid) {
      return [...backing.values()].filter((r) => (r as ChipRecoverySnapshot)?.tournamentId === tid).map(clone);
    },
    async listAll() {
      return [...backing.values()].map(clone);
    },
    async delete(keys) {
      for (const k of keys) backing.delete(k);
    },
  };
};

const IDB_NAME = "compete-chip-recovery";
const IDB_VERSION = 1;
const IDB_STORE = "snapshots";

// IndexedDB storage (web). One object store keyed by `key`, indexed by tournamentId.
export const createIndexedDbRecoveryStorage = (idb: IDBFactory): ChipRecoveryStorage => {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: "key" });
          store.createIndex("tournamentId", "tournamentId", { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading the schema: close so it isn't blocked; reopen lazily.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      req.onblocked = () => reject(new Error("IndexedDB open blocked"));
    }).catch((e) => {
      dbPromise = null; // allow a later retry
      throw e;
    });
    return dbPromise;
  };
  const run = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> => {
    const db = await open();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      let result: T | undefined;
      const req = fn(tx.objectStore(IDB_STORE));
      if (req) req.onsuccess = () => (result = req.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  };
  return {
    async put(rec) {
      await run("readwrite", (s) => s.put(rec));
    },
    async listByTournament(tid) {
      return (await run<unknown[]>("readonly", (s) => s.index("tournamentId").getAll(tid))) ?? [];
    },
    async listAll() {
      return (await run<unknown[]>("readonly", (s) => s.getAll())) ?? [];
    },
    async delete(keys) {
      if (!keys.length) return;
      await run("readwrite", (s) => {
        for (const k of keys) s.delete(k);
      });
    },
  };
};

// ── recovery service ──────────────────────────────────────────────────────────

export interface ChipLocalRecovery {
  saveSnapshot(input: ChipRecoverySnapshotInput): Promise<ChipRecoverySnapshot>;
  // Newest VALID rolling snapshot (a corrupt newest one falls back to the previous).
  // `ownerUserId` given → only that owner's history (another account on this browser, or a
  // signed-out visit, can never shadow it).
  getLatestSnapshot(tournamentId: number, ownerUserId?: string | null): Promise<ChipRecoverySnapshot | null>;
  // Valid rolling snapshots, newest first (optionally one owner's).
  getSnapshots(tournamentId: number, ownerUserId?: string | null): Promise<ChipRecoverySnapshot[]>;
  getConflictArchive(tournamentId: number, ownerUserId?: string | null): Promise<ChipRecoverySnapshot | null>;
  // Newest valid rolling snapshot of EVERY tournament backed up by `ownerUserId`, newest first
  // (the offline entry point's list).
  listTournamentBackups(ownerUserId: string): Promise<ChipRecoverySnapshot[]>;
  // Set a divergent backup aside (one per tournament) so rolling writes can't prune it.
  archiveConflict(snapshot: ChipRecoverySnapshot): Promise<void>;
  // The save queue confirmed `fingerprint` persisted at `version`: stamp the newest snapshot.
  markCloudSaved(tournamentId: number, fingerprint: string, version: number): Promise<void>;
  deleteTournamentSnapshots(tournamentId: number): Promise<void>;
  // Retention sweep. `keepTournamentId` (the open tournament) is never pruned by age/cap.
  pruneSnapshots(opts?: { keepTournamentId?: number | null }): Promise<number>;
}

export const createChipLocalRecovery = (
  storage: ChipRecoveryStorage,
  opts?: { now?: () => number; keep?: number },
): ChipLocalRecovery => {
  const now = opts?.now ?? (() => Date.now());
  const keep = opts?.keep ?? CHIP_RECOVERY_KEEP;

  // Rolling history is PER OWNER: each account's latest-3 rotate independently.
  const rolling = async (
    tid: number,
    owner?: string | null,
  ): Promise<{ valid: ChipRecoverySnapshot[]; all: ChipRecoverySnapshot[] }> => {
    const raw = (await storage.listByTournament(tid)) as ChipRecoverySnapshot[];
    const all = raw
      .filter((r) => r && r.kind !== "conflict" && (owner === undefined || (r.ownerUserId ?? null) === owner))
      .sort((a, b) => (b?.seq ?? 0) - (a?.seq ?? 0));
    return { valid: all.filter(isValidSnapshot).sort(newestFirst), all };
  };

  return {
    async saveSnapshot(input) {
      const { all } = await rolling(input.tournamentId, input.ownerUserId ?? null);
      const everyOwner = (await rolling(input.tournamentId)).all;
      const seq = everyOwner.reduce((mx, r) => Math.max(mx, Number(r?.seq) || 0), 0) + 1;
      const chip = sanitizeChipForBackup(input.chip);
      const rec: ChipRecoverySnapshot = {
        schema: CHIP_RECOVERY_SCHEMA,
        key: `${input.tournamentId}:${seq}:${Math.random().toString(36).slice(2, 8)}`,
        kind: "rolling",
        tournamentId: input.tournamentId,
        ownerUserId: input.ownerUserId ?? null,
        seq,
        savedAt: new Date(now()).toISOString(),
        reason: input.reason,
        cloudVersion: input.cloudVersion,
        cloudConfirmed: input.cloudConfirmed,
        cloudSavedAt: input.cloudConfirmed ? new Date(now()).toISOString() : null,
        finished: input.finished,
        fingerprint: chipRecoveryFingerprint(chip),
        tournament: input.tournament,
        chip,
        offlineSession: input.offlineSession ?? null,
      };
      await storage.put(rec);
      // Keep the newest `keep` (the new record included); corrupt ones count as oldest.
      const stale = [rec, ...all].slice(keep).map((r) => r.key).filter(Boolean);
      if (stale.length) await storage.delete(stale);
      return rec;
    },
    async getLatestSnapshot(tid, owner) {
      return (await rolling(tid, owner)).valid[0] ?? null;
    },
    async getSnapshots(tid, owner) {
      return (await rolling(tid, owner)).valid;
    },
    async getConflictArchive(tid, owner) {
      const raw = (await storage.listByTournament(tid)) as ChipRecoverySnapshot[];
      return (
        raw.find(
          (r) => r?.kind === "conflict" && isValidSnapshot(r) && (owner === undefined || (r.ownerUserId ?? null) === owner),
        ) ?? null
      );
    },
    async listTournamentBackups(ownerUserId) {
      const raw = (await storage.listAll()) as ChipRecoverySnapshot[];
      const latestByTid = new Map<number, ChipRecoverySnapshot>();
      for (const r of raw) {
        if (!isValidSnapshot(r) || r.kind === "conflict" || r.ownerUserId !== ownerUserId) continue;
        const cur = latestByTid.get(r.tournamentId);
        if (!cur || newestFirst(r, cur) < 0) latestByTid.set(r.tournamentId, r);
      }
      return [...latestByTid.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    },
    async archiveConflict(snapshot) {
      await storage.put({
        ...snapshot,
        key: `${snapshot.tournamentId}:conflict:${snapshot.ownerUserId ?? "none"}`, // one per owner
        kind: "conflict",
        archivedAt: new Date(now()).toISOString(),
      });
    },
    async markCloudSaved(tid, fingerprint, version) {
      const latest = (await rolling(tid)).valid[0];
      if (!latest || latest.fingerprint !== fingerprint) return;
      if (latest.cloudConfirmed && latest.cloudVersion === version) return;
      await storage.put({
        ...latest,
        cloudConfirmed: true,
        cloudVersion: version,
        cloudSavedAt: new Date(now()).toISOString(),
        offlineSession: null, // the cloud now holds this state — nothing unsynced remains
      });
    },
    async deleteTournamentSnapshots(tid) {
      const raw = (await storage.listByTournament(tid)) as ChipRecoverySnapshot[];
      await storage.delete(raw.map((r) => r?.key).filter(Boolean));
    },
    async pruneSnapshots(o) {
      const keepTid = o?.keepTournamentId ?? null;
      const t = now();
      const raw = (await storage.listAll()) as ChipRecoverySnapshot[];
      const doomed = new Set<string>();
      // Records that can't even be attributed to a tournament are dropped.
      for (const r of raw) if (r?.key && typeof r.tournamentId !== "number") doomed.add(r.key);
      const groups = new Map<number, ChipRecoverySnapshot[]>();
      for (const r of raw) {
        if (!r?.key || typeof r.tournamentId !== "number") continue;
        const g = groups.get(r.tournamentId) ?? [];
        g.push(r);
        groups.set(r.tournamentId, g);
      }
      const ageOf = (r: ChipRecoverySnapshot) => t - (Date.parse(r.archivedAt ?? r.savedAt) || 0);
      const lastSaveByTid: { tid: number; last: number }[] = [];
      for (const [tid, recs] of groups) {
        const roll = recs.filter((r) => r.kind !== "conflict");
        const conflicts = recs.filter((r) => r.kind === "conflict");
        const latest = roll.filter(isValidSnapshot).sort(newestFirst)[0] ?? null;
        if (tid !== keepTid) {
          for (const c of conflicts) if (ageOf(c) > CHIP_RECOVERY_RETENTION.conflictMs) doomed.add(c.key);
          const limit = latest?.finished ? CHIP_RECOVERY_RETENTION.finishedMs : CHIP_RECOVERY_RETENTION.activeMs;
          if (!latest || ageOf(latest) > limit) for (const r of roll) doomed.add(r.key);
        }
        // Rolling cap per tournament (also repairs over-full groups from concurrent tabs).
        roll.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).slice(keep).forEach((r) => doomed.add(r.key));
        const alive = recs.filter((r) => !doomed.has(r.key));
        if (alive.length && tid !== keepTid) {
          lastSaveByTid.push({ tid, last: Math.max(...alive.map((r) => Date.parse(r.archivedAt ?? r.savedAt) || 0)) });
        }
      }
      // Tournament cap: drop the least-recently-saved tournaments beyond the limit.
      const room = CHIP_RECOVERY_RETENTION.maxTournaments - (keepTid != null && groups.has(keepTid) ? 1 : 0);
      lastSaveByTid
        .sort((a, b) => b.last - a.last)
        .slice(Math.max(0, room))
        .forEach(({ tid }) => groups.get(tid)?.forEach((r) => doomed.add(r.key)));
      if (doomed.size) await storage.delete([...doomed]);
      return doomed.size;
    },
  };
};

// ── reconnect ordering (web recovery) ─────────────────────────────────────────
// The slice of the Chip save queue the reconnect path controls (chip.save-queue.ts).
export interface ChipRecoveryQueueControl {
  pause(): Promise<void>;
  resume(): void;
  dropUnsaved(): void;
  peekUnsaved(): ChipState | null;
}

export interface ChipCloudCheckResult<B> {
  outcome: ChipCloudComparison;
  bundle: B;
  // A snapshot from this session was still waiting to be written (held by the paused queue).
  unsavedSession: boolean;
}

// Connectivity returned while a local backup is shown. STRICT ORDER:
//   1. pause the save queue and wait for any already-sent attempt to settle — from here no
//      queued/stale Chip write can reach Supabase;
//   2. load the authoritative cloud state;
//   3. compare cloud vs the backup AND vs any held unsaved snapshot.
// Returns with the queue STILL PAUSED whatever the outcome (and if the load throws). Only an
// explicit follow-up — adoptCloudVersion (then resume) — re-enables writes. Nothing is pushed.
export const checkCloudForRecovery = async <B>(args: {
  queue: ChipRecoveryQueueControl;
  loadCloud: () => Promise<B>;
  cloudChipOf: (bundle: B) => ChipState;
  snapshot: ChipRecoverySnapshot;
}): Promise<ChipCloudCheckResult<B>> => {
  await args.queue.pause();
  const bundle = await args.loadCloud();
  const cloudFp = chipRecoveryFingerprint(args.cloudChipOf(bundle));
  const held = args.queue.peekUnsaved();
  const heldMatches = !held || chipRecoveryFingerprint(held) === cloudFp;
  return {
    outcome: cloudFp === args.snapshot.fingerprint && heldMatches ? "consistent" : "conflict",
    bundle,
    unsavedSession: !!held,
  };
};

// "Use Cloud Version" (or a consistent check): discard every pending/held write for this
// tournament while the queue stays paused. The caller applies the cloud state and only THEN
// calls queue.resume(), so no stale write can slip in between.
export const discardPendingForCloud = async (queue: ChipRecoveryQueueControl): Promise<void> => {
  queue.dropUnsaved();
  await queue.pause(); // settle anything in flight (it can't start a new attempt)
  queue.dropUnsaved();
};

// ── offline recovery entry point (web) ────────────────────────────────────────
// Route of the read-only backup viewer. Deliberately OUTSIDE /admin: it exposes only local
// backups, never Admin pages or permissions.
export const chipRecoveryPath = (tournamentId: number) => `/chip-recovery/${tournamentId}`;

// Show the entry point only when ALL hold: web; auth finished and NO profile (the cloud
// profile load failed / session couldn't refresh); a Supabase session is still STORED on this
// browser (the director never signed out — nothing is authenticated by this); that session's
// user owns ≥1 valid local backup; and the cloud is currently unreachable.
export const decideOfflineRecoveryEntry = (args: {
  isWeb: boolean;
  authLoading: boolean;
  hasProfile: boolean;
  storedUserId: string | null;
  backups: ChipRecoverySnapshot[];
  cloudReachable: boolean | null; // null = not probed yet
}): { show: boolean; backups: ChipRecoverySnapshot[] } => {
  const ok =
    args.isWeb &&
    !args.authLoading &&
    !args.hasProfile &&
    !!args.storedUserId &&
    args.cloudReachable === false &&
    args.backups.some((b) => b.ownerUserId === args.storedUserId);
  return { show: ok, backups: ok ? args.backups.filter((b) => b.ownerUserId === args.storedUserId) : [] };
};

// ── fire-and-forget writer ───────────────────────────────────────────────────

export interface ChipBackupWriter {
  // Record the newest snapshot to write. Coalescing: if a write is running, only the newest
  // pending snapshot is written next (chip state is cumulative). Never throws, never blocks.
  schedule(input: ChipRecoverySnapshotInput): void;
  // The save queue persisted `chip` at `version` (fingerprint computed off the save path).
  markCloudSaved(tournamentId: number, chip: ChipState, version: number): void;
  // Resolves when idle (tests / diagnostics).
  flush(): Promise<void>;
}

export const createChipBackupWriter = (
  recovery: ChipLocalRecovery,
  opts?: {
    onError?: (error: unknown, op: "snapshot" | "mark_cloud_saved") => void;
    onWritten?: (snapshot: ChipRecoverySnapshot, input: ChipRecoverySnapshotInput) => void;
    // Defers the write off the current task (default: setTimeout 0) so a tournament action's
    // render/commit is never delayed by the backup.
    defer?: (fn: () => void) => void;
  },
): ChipBackupWriter => {
  const defer = opts?.defer ?? ((fn: () => void) => void setTimeout(fn, 0));
  let pendingSnap: ChipRecoverySnapshotInput | null = null;
  let pendingMark: { tid: number; chip: ChipState; version: number } | null = null;
  let running: Promise<void> | null = null;

  const drain = async () => {
    while (pendingSnap || pendingMark) {
      if (pendingSnap) {
        const input = pendingSnap;
        pendingSnap = null;
        try {
          const rec = await recovery.saveSnapshot(input);
          opts?.onWritten?.(rec, input);
        } catch (e) {
          opts?.onError?.(e, "snapshot");
        }
        continue;
      }
      const m = pendingMark!;
      pendingMark = null;
      try {
        await recovery.markCloudSaved(m.tid, chipRecoveryFingerprint(m.chip), m.version);
      } catch (e) {
        opts?.onError?.(e, "mark_cloud_saved");
      }
    }
  };
  const kick = () => {
    if (running) return;
    running = new Promise<void>((resolve) => defer(resolve))
      .then(drain)
      .finally(() => {
        running = null;
        if (pendingSnap || pendingMark) kick();
      });
  };
  return {
    schedule(input) {
      pendingSnap = input;
      kick();
    },
    markCloudSaved(tid, chip, version) {
      pendingMark = { tid, chip, version };
      kick();
    },
    async flush() {
      while (running) await running;
    },
  };
};

// ── web singleton ────────────────────────────────────────────────────────────

let webRecovery: ChipLocalRecovery | null | undefined;
// The browser's recovery service, or null where IndexedDB doesn't exist (native, SSR).
// Callers additionally gate on Platform.OS === "web" so native never touches this.
export const getChipLocalRecovery = (): ChipLocalRecovery | null => {
  if (webRecovery !== undefined) return webRecovery;
  const idb: IDBFactory | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { indexedDB?: IDBFactory }).indexedDB : undefined;
  webRecovery = idb ? createChipLocalRecovery(createIndexedDbRecoveryStorage(idb)) : null;
  return webRecovery;
};
