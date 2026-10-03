// src/utils/elim-local-recovery.ts
// Elimination (Single + Double) offline local recovery — the pure rules. The cloud is always
// authoritative: this device keeps ONE validated copy of the last state it SYNCED from the cloud
// per tournament, so an offline Manage screen can keep showing it (read-only) instead of going
// blank. Nothing is ever queued, merged or pushed from it. Pure (no react-native import).
//
// Unlike Chip (whose web controller can keep running offline and therefore stores several
// IndexedDB snapshots + a pending-op log), elimination never writes offline, so only the latest
// cloud copy is useful: one small record per tournament in AsyncStorage (localStorage on web,
// persistent app storage on native — already in the binary, no build needed).

import { isBracketEngine } from "./tournament-formats";

export const ELIM_LOCAL_SCHEMA = 1;
export const ELIM_LOCAL_KEY_PREFIX = "compete.elim-local.v1:";
export const ELIM_LOCAL_INDEX_KEY = "compete.elim-local.v1.index";
// Bounds: one record per tournament (latest synced revision), at most 20 tournaments per
// device, 14 days old (3 days once finished), and a size cap so one huge row can't crowd out
// other storage. Oldest first when over the cap.
export const ELIM_LOCAL_MAX_TOURNAMENTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
export const ELIM_LOCAL_MAX_AGE_MS = 14 * DAY_MS;
export const ELIM_LOCAL_FINISHED_MAX_AGE_MS = 3 * DAY_MS;
export const ELIM_LOCAL_MAX_BYTES = 750_000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const ELIM_OFFLINE_BANNER = "Offline — showing last synced tournament state";
export const ELIM_CHANGED_WHILE_OFFLINE = "This tournament changed while you were offline.";
export const ELIM_OFFLINE_WRITE_TEXT =
  "You're offline. Tournament changes need a connection — nothing was saved or queued.";
export const ELIM_HELD_WRITE_TEXT = "This tournament changed while you were offline. Load the latest version first.";

type Row = Record<string, unknown> & { id?: unknown; live_revision?: unknown; live_settings?: unknown };

export interface ElimLocalRecord {
  schema: typeof ELIM_LOCAL_SCHEMA;
  kind: "elimination";
  tournamentId: number;
  ownerId: string; // profiles.id of the signed-in manager — never shown to another account
  revision: number; // tournaments.live_revision of the synced copy
  savedAt: string; // ISO
  finished: boolean;
  tournament: Row; // the tournaments row exactly as the cloud returned it
  tables: unknown[] | null; // tournament_tables (labels for the read-only view)
}

export interface ElimLocalIndexEntry {
  tournamentId: number;
  ownerId: string;
  revision: number;
  savedAt: string;
  finished: boolean;
}

export const elimLocalKey = (ownerId: string, tournamentId: number) => `${ELIM_LOCAL_KEY_PREFIX}${ownerId}:${tournamentId}`;

const isRevision = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const hasDrawnBracket = (t: Row | null | undefined): boolean =>
  !!t && Array.isArray((t.live_settings as { bracket?: { graph?: unknown } } | null)?.bracket?.graph);
const isFinished = (t: Row): boolean => t.status === "completed" || t.live_state === "finished";

// A cloud row worth keeping: elimination engine, drawn bracket, server revision present.
export const isElimLocalEligible = (t: Row | null | undefined): t is Row =>
  !!t && isBracketEngine(t.tournament_format as string | null) && hasDrawnBracket(t) && isRevision(t.live_revision);

export const buildElimLocalRecord = (
  tournament: Row | null | undefined,
  tables: unknown[] | null | undefined,
  ownerId: string | null | undefined,
  now: Date = new Date(),
): ElimLocalRecord | null => {
  if (!ownerId || !isElimLocalEligible(tournament)) return null;
  const tournamentId = Number(tournament.id);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) return null;
  return {
    schema: ELIM_LOCAL_SCHEMA,
    kind: "elimination",
    tournamentId,
    ownerId,
    revision: tournament.live_revision as number,
    savedAt: now.toISOString(),
    finished: isFinished(tournament),
    tournament,
    tables: Array.isArray(tables) ? tables : null,
  };
};

export type ElimLocalInvalid = "shape" | "schema" | "kind" | "tournament" | "owner" | "revision" | "timestamp" | "expired";

const maxAge = (finished: boolean) => (finished ? ELIM_LOCAL_FINISHED_MAX_AGE_MS : ELIM_LOCAL_MAX_AGE_MS);

// Validate a stored record for THIS tournament + account. Anything that doesn't match exactly is
// rejected (and the caller prunes it) — a stale schema, another account's copy, a revision that
// disagrees with its own row, a bad / future / expired timestamp, or a non-elimination row.
export const validateElimLocalRecord = (
  raw: unknown,
  expect: { tournamentId: number; ownerId: string },
  now: Date = new Date(),
): { ok: true; record: ElimLocalRecord } | { ok: false; reason: ElimLocalInvalid } => {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "shape" };
  const r = raw as Partial<ElimLocalRecord>;
  if (r.schema !== ELIM_LOCAL_SCHEMA) return { ok: false, reason: "schema" };
  if (r.kind !== "elimination") return { ok: false, reason: "kind" };
  if (r.tournamentId !== expect.tournamentId || Number(r.tournament?.id) !== expect.tournamentId)
    return { ok: false, reason: "tournament" };
  if (r.ownerId !== expect.ownerId) return { ok: false, reason: "owner" };
  if (!isRevision(r.revision) || r.tournament?.live_revision !== r.revision) return { ok: false, reason: "revision" };
  const t = typeof r.savedAt === "string" ? Date.parse(r.savedAt) : NaN;
  if (Number.isNaN(t) || t > now.getTime() + CLOCK_SKEW_MS) return { ok: false, reason: "timestamp" };
  if (now.getTime() - t > maxAge(!!r.finished)) return { ok: false, reason: "expired" };
  if (!isElimLocalEligible(r.tournament)) return { ok: false, reason: "kind" };
  return { ok: true, record: r as ElimLocalRecord };
};

export const indexEntryOf = (r: ElimLocalRecord): ElimLocalIndexEntry => ({
  tournamentId: r.tournamentId, ownerId: r.ownerId, revision: r.revision, savedAt: r.savedAt, finished: r.finished,
});

// Device-wide bounds: drop malformed / expired entries, then keep the newest N.
export const planElimLocalPrune = (
  entries: unknown,
  now: Date = new Date(),
  max = ELIM_LOCAL_MAX_TOURNAMENTS,
): { keep: ElimLocalIndexEntry[]; drop: ElimLocalIndexEntry[] } => {
  const list = (Array.isArray(entries) ? entries : []).filter(
    (e): e is ElimLocalIndexEntry =>
      !!e && typeof e === "object" && Number.isInteger((e as ElimLocalIndexEntry).tournamentId)
      && typeof (e as ElimLocalIndexEntry).ownerId === "string" && typeof (e as ElimLocalIndexEntry).savedAt === "string",
  );
  // One entry per (owner, tournament): the newest wins.
  const byKey = new Map<string, ElimLocalIndexEntry>();
  const drop: ElimLocalIndexEntry[] = [];
  for (const e of list) {
    const k = elimLocalKey(e.ownerId, e.tournamentId);
    const cur = byKey.get(k);
    if (!cur || Date.parse(e.savedAt) > Date.parse(cur.savedAt)) byKey.set(k, e);
  }
  const fresh: ElimLocalIndexEntry[] = [];
  for (const e of byKey.values()) {
    const t = Date.parse(e.savedAt);
    if (Number.isNaN(t) || now.getTime() - t > maxAge(!!e.finished)) drop.push(e);
    else fresh.push(e);
  }
  fresh.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return { keep: fresh.slice(0, max), drop: [...drop, ...fresh.slice(max)] };
};

// Reconnect: compare the revision this screen showed while offline with the cloud's.
//   same → synced (nothing happened elsewhere) · different → the cloud changed; the TD loads it.
// The local copy is never pushed, merged or replayed.
export type ElimReconnect = "synced" | "cloud_changed";
export const elimReconnectStatus = (shownRevision: number | null | undefined, cloudRevision: number | null | undefined): ElimReconnect =>
  shownRevision != null && cloudRevision != null && shownRevision === cloudRevision ? "synced" : "cloud_changed";
