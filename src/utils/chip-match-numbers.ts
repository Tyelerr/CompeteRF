// src/utils/chip-match-numbers.ts
// Tournament-wide MATCH NUMBERING for Chip tournaments (pure, shared by web + native, every
// surface). "Match 17" = the 17th VALID completed match result of the WHOLE tournament in
// chronological order — never a per-player count. The same match gets the same number
// everywhere (Activity Log, History, table history, player history, spectator feed, profile).
//
// Derived from existing persisted data (no schema): the append-only chip_events log.
//   • Source: `match_result` events (payload.matchId) — logged exactly once when a result is
//     recorded, including Forfeit MATCH (it goes through recordWinner). Plus the mid-match
//     `forfeit` event of Forfeit TOURNAMENT (forfeitEntry), which also completes the live
//     match with a winner/loser (payload.matchId; legacy events are matched by entry/opp).
//   • Completion time: the result EVENT's `at` (= chip_events.created_at). Never the match's
//     `endedAt`: "reset waiting timer" rewrites the holder's last win's endedAt.
//   • Order: completion time ascending, tie-break by event id (stable, persisted, unique).
//   • Excluded (then the visible sequence is renumbered 1..N with no gaps):
//       - superseded events (undone / reverted by a Tournament Restore — the audit log keeps
//         them, dimmed);
//       - a result whose match record is live again (restored back to in_progress);
//       - duplicates for the same match (earliest valid result wins).
//   • Voided matches (clear table / remove player) never log a result → never numbered.

import { ChipEvent, ChipMatch } from "../models/types/chip.types";

export interface ChipNumberedMatch {
  number: number; // 1-based tournament-wide sequence
  matchId: string | null;
  eventId: string; // the result event this number is anchored to
  completedAt: string; // ISO — the result event's time
  winnerId: string | null;
  loserId: string | null;
  tableId: string | null;
  durationMs: number | null; // start → completion
  forfeit: boolean; // decided by a forfeit (match or tournament)
}

export interface ChipMatchNumbering {
  list: ChipNumberedMatch[]; // chronological (Match 1 first)
  byMatchId: Map<string, ChipNumberedMatch>;
  // Every event id that belongs to a numbered result (the result event itself and any
  // forfeit event of the same action) → its number, for event-based surfaces.
  byEventId: Map<string, ChipNumberedMatch>;
  // Matches whose result was reverted (every result event for it is superseded) but whose
  // record may still read "finished" — hidden from normal match history (audit keeps them).
  revertedMatchIds: Set<string>;
}

const ts = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};
const byTimeThenId = (a: { at: string; id: string }, b: { at: string; id: string }) =>
  ts(a.at) - ts(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const numberChipMatches = (chip: { events: ChipEvent[]; matches: ChipMatch[] }): ChipMatchNumbering => {
  const matchesById = new Map(chip.matches.map((m) => [m.id, m]));
  // Match ids that have their own match_result event (valid or not) — a legacy
  // forfeit-tournament event is never mapped onto one of these.
  const resultMatchIds = new Set<string>();
  for (const ev of chip.events) {
    const mid = ev.payload?.matchId;
    if (ev.type === "match_result" && typeof mid === "string") resultMatchIds.add(mid);
  }
  // Forfeit-MATCH events (they ride along with their match_result in the same action).
  const forfeitMatchEvents = chip.events.filter(
    (ev) => ev.type === "forfeit" && !ev.superseded && ev.payload?.act === "forfeit_match",
  );

  type Cand = { ev: ChipEvent; matchId: string | null; forfeit: boolean };
  const cands: Cand[] = [];
  const claimedLegacy = new Set<string>();
  for (const ev of chip.events.slice().sort(byTimeThenId)) {
    if (ev.superseded) continue;
    if (ev.type === "match_result") {
      const mid = typeof ev.payload?.matchId === "string" ? (ev.payload.matchId as string) : null;
      const forfeit = forfeitMatchEvents.some(
        (f) => (ev.txId && f.txId === ev.txId) || (!!mid && f.payload?.matchId === mid),
      );
      cands.push({ ev, matchId: mid, forfeit });
    } else if (ev.type === "forfeit" && ev.payload?.act !== "forfeit_match") {
      // Forfeit TOURNAMENT mid-match: the live match was completed with a winner.
      let mid = typeof ev.payload?.matchId === "string" ? (ev.payload.matchId as string) : null;
      if (!mid) {
        const loser = ev.payload?.entryId;
        const winner = ev.payload?.oppId;
        if (typeof loser !== "string" || typeof winner !== "string") continue; // no live match
        const at = ts(ev.at);
        const hit = chip.matches
          .filter(
            (m) =>
              m.status !== "in_progress" &&
              m.loserId === loser &&
              m.winnerId === winner &&
              !resultMatchIds.has(m.id) &&
              !claimedLegacy.has(m.id),
          )
          .sort((a, b) => Math.abs(ts(a.endedAt ?? "") - at) - Math.abs(ts(b.endedAt ?? "") - at))[0];
        if (!hit) continue;
        mid = hit.id;
        claimedLegacy.add(mid);
      }
      cands.push({ ev, matchId: mid, forfeit: true });
    }
  }

  const list: ChipNumberedMatch[] = [];
  const byMatchId = new Map<string, ChipNumberedMatch>();
  const byEventId = new Map<string, ChipNumberedMatch>();
  for (const c of cands) {
    const m = c.matchId ? matchesById.get(c.matchId) : undefined;
    if (m && m.status === "in_progress") continue; // restored back to live: not a result now
    if (c.matchId && byMatchId.has(c.matchId)) continue; // one number per match
    const start = m ? ts(m.startedAt) : 0;
    const done = ts(c.ev.at);
    const row: ChipNumberedMatch = {
      number: list.length + 1,
      matchId: c.matchId,
      eventId: c.ev.id,
      completedAt: c.ev.at,
      winnerId: m?.winnerId ?? (typeof c.ev.payload?.oppId === "string" ? (c.ev.payload.oppId as string) : null),
      loserId: m?.loserId ?? (typeof c.ev.payload?.entryId === "string" ? (c.ev.payload.entryId as string) : null),
      tableId: m?.tableId ?? null,
      durationMs: start && done >= start ? done - start : null,
      forfeit: c.forfeit,
    };
    list.push(row);
    if (c.matchId) byMatchId.set(c.matchId, row);
    byEventId.set(c.ev.id, row);
  }
  // Companion forfeit-match events share their result's number.
  for (const f of forfeitMatchEvents) {
    const row =
      list.find((r) => {
        const ev = chip.events.find((e) => e.id === r.eventId);
        return !!ev && !!f.txId && ev.txId === f.txId;
      }) ?? null;
    if (row) byEventId.set(f.id, row);
  }
  const revertedMatchIds = new Set<string>();
  for (const ev of chip.events) {
    const mid = ev.payload?.matchId;
    if ((ev.type === "match_result" || ev.type === "forfeit") && ev.superseded && typeof mid === "string" && !byMatchId.has(mid))
      revertedMatchIds.add(mid);
  }
  return { list, byMatchId, byEventId, revertedMatchIds };
};

// Completed matches for a history surface, newest first: every numbered match, plus any
// finished record with no result event at all (legacy data — shown unnumbered, never hidden);
// reverted results are excluded. Completion time = the numbered result time, else endedAt.
export const chipHistoryMatches = <M extends ChipMatch>(
  numbering: ChipMatchNumbering,
  matches: M[],
): { m: M; n: ChipNumberedMatch | null; completedAt: string | null }[] =>
  matches
    .filter((m) => m.status !== "in_progress" && (numbering.byMatchId.has(m.id) || (!!m.endedAt && !numbering.revertedMatchIds.has(m.id))))
    .map((m) => {
      const n = numbering.byMatchId.get(m.id) ?? null;
      return { m, n, completedAt: n?.completedAt ?? m.endedAt ?? null };
    })
    .sort((a, b) => ts(b.completedAt ?? "") - ts(a.completedAt ?? "") || (b.n?.number ?? 0) - (a.n?.number ?? 0));

// Display label: full "Match 17" wherever it fits; "M17" only for genuinely tight rows.
export const chipMatchLabel = (n: number, compact = false): string => (compact ? `M${n}` : `Match ${n}`);

// Completion time in the app's existing activity-time style ("9:26 PM", device-local zone —
// the same behavior as the Activity Log / spectator feed times).
export const formatChipResultTime = (iso: string): string => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const h = dt.getHours();
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(dt.getMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

// The numbered result an EVENT row should label, or null. Only the event the number is
// anchored to (the match_result, or a Forfeit TOURNAMENT's forfeit) carries it — so one
// result never shows its number twice (a Forfeit MATCH's companion forfeit line stays
// plain) and unrelated activity (chip adjust, table lock, queue move, shuffle) never does.
export const chipEventMatchNumber = (
  numbering: ChipMatchNumbering,
  ev: Pick<ChipEvent, "id" | "superseded">,
): ChipNumberedMatch | null => {
  if (ev.superseded) return null;
  const row = numbering.byEventId.get(ev.id);
  return row && row.eventId === ev.id ? row : null;
};
