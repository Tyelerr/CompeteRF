// src/utils/chip-activity.ts
// THE single centralized mapper from a raw Chip audit event (ChipEvent) to a
// spectator-facing "Recent Activity" line — or null when the event is TD-only noise.
// Keeping this in one place means new public activity types are added here (a case),
// never scattered across the spectator UI. Newest-first ordering is the caller's
// responsibility (chip events are already stored newest-first).
//
// The engine tags the ambiguous PUBLIC "manual"/"shuffle" events with a stable
// payload.act code (tournament_started, match_started, matches_started, finals,
// champion, tournament_finished, buyback, reshuffled), so this mapper keys off a
// machine code — not fragile English — for those. Everything else is decided by the
// event TYPE. Anything not matched here stays TD-only.

import { ChipEvent } from "../models/types/chip.types";
import { ChipMatchNumbering, chipEventMatchNumber } from "./chip-match-numbers";

// Semantic categories for the spectator feed (drive icon/dot colour, not wording).
export type PublicActivityKind =
  | "match_start" // a match / matches began
  | "result" // someone beat someone
  | "chip_loss" // a chip was lost
  | "elimination" // a team was eliminated
  | "forfeit" // a forfeit
  | "buyback" // an eliminated team bought back in
  | "table" // table opened for its next match / moved / closed
  | "queue" // the TD manually changed someone's place in the queue (menu move or drag)
  | "shuffle" // the board was reshuffled
  | "tournament" // tournament lifecycle (started / finals / finished)
  | "champion"; // the champion was crowned

export interface PublicActivity {
  id: string;
  text: string;
  at: string;
  kind: PublicActivityKind;
  // Public audit context, surfaced when the originating event carries it (director
  // actions: forfeit, elimination, chip adjust, etc.). Automatic gameplay events
  // leave these null, so ordinary play-by-play lines render unchanged.
  actor?: string | null; // display name of who performed the action
  reason?: string | null; // PUBLIC reason (spectator-visible audit note)
  notes?: string | null; // PUBLIC free-text note (spectator-visible)
  // Tournament-wide Match # (utils/chip-match-numbers) — set only on the line that records a
  // valid completed result; every other activity line leaves it null.
  matchNumber?: number | null;
}

// Light, spectator-friendly wording tweaks over the engine's audit text (which is
// authored for the TD log). Safe no-ops when the pattern isn't present.
const humanize = (text: string): string =>
  text
    // "X beat Y (Table 2)" → "X beat Y on Table 2"
    .replace(/\s*\((Table[^)]+)\)\s*$/i, " on $1")
    // "… → 5 left" → "… → 5 remaining"
    .replace(/→\s*(\d+)\s*left\b/i, "→ $1 remaining");

// Escape a string for safe inclusion in a RegExp (reason text is user-authored).
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readAct = (ev: ChipEvent): string | null =>
  (ev.payload?.act as string | undefined) ?? null;

// Legacy (pre-tag) manual queue reorders, recognised by their exact engine wording:
//   "<name> moved from #2 to #5 in the queue"  (drag)
//   "<name> moved up|down|top|bottom in the queue"  (⋮ menu)
const LEGACY_QUEUE_POS_RE = /^(.+) moved from #(\d+) to #(\d+) in the queue$/;
const LEGACY_QUEUE_DIR_RE = /^(.+) moved (up|down|top|bottom) in the queue$/;

// ONE public line for a manual queue reorder — menu moves and drag render identically:
// "<name> moved from #2 to #5 in the queue". Built only from the public team name and the
// 1-based positions (no ids / actor / metadata). null for a no-op (same position).
const queueMoveText = (ev: ChipEvent): string | null => {
  const p = ev.payload ?? {};
  if (readAct(ev) === "queue_moved") {
    const from = typeof p.fromIndex === "number" ? p.fromIndex : null;
    const to = typeof p.toIndex === "number" ? p.toIndex : null;
    const name =
      (typeof p.teamName === "string" && p.teamName.trim()) ||
      ev.text.replace(/ moved .*$/, "").trim() ||
      "Team";
    if (from == null || to == null) return ev.text;
    if (from === to) return null;
    return `${name} moved from #${from + 1} to #${to + 1} in the queue`;
  }
  const pos = LEGACY_QUEUE_POS_RE.exec(ev.text);
  if (pos) return pos[2] === pos[3] ? null : ev.text;
  if (LEGACY_QUEUE_DIR_RE.test(ev.text)) return ev.text;
  return null;
};

// Map ONE event → a public activity line, or null to hide it from spectators.
export const toPublicActivity = (ev: ChipEvent): PublicActivity | null => {
  // A restored-past (superseded) event is no longer part of the live story.
  if (ev.superseded || !ev.text) return null;
  const readStr = (k: string): string | null => {
    const v = ev.payload?.[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  const reason = readStr("reason");
  // Some engine lines bake "— {reason}" into the text; drop it so the reason isn't
  // shown twice once we surface it as its own field below.
  let text = humanize(ev.text);
  if (reason) {
    text = text.replace(new RegExp(`\\s*[—-]\\s*${escapeRe(reason)}\\s*$`), "").trim();
  }
  const base = {
    id: ev.id,
    at: ev.at,
    text,
    // Show the actor to spectators ONLY for director OVERRIDES — which always carry a
    // reason (chip adjust, forfeit, restore, etc.). Routine play-by-play now also stamps
    // an actor for the admin audit trail (item 21), but surfacing "Director: X" on every
    // match result / elimination would spam the spectator feed, so gate it on `reason`.
    actor: reason ? readStr("actorName") : null,
    reason,
    notes: readStr("notes"),
  };

  switch (ev.type) {
    // ── Always public: core play-by-play ──────────────────────────────────────
    case "match_result":
      return { ...base, kind: "result" };
    case "chip_loss":
      return { ...base, kind: "chip_loss" };
    case "elimination":
      return { ...base, kind: "elimination" };
    case "forfeit":
      return { ...base, kind: "forfeit" };
    // Table opened for its next match / a match physically moved / a table closed
    // are all public-facing logistics.
    case "move":
    case "table_removed":
      return { ...base, kind: "table" };

    // ── Shuffle: only a COMPLETED reshuffle is public; the drain / ready / waiting
    //    steps are internal noise. ─────────────────────────────────────────────
    case "shuffle":
      return readAct(ev) === "reshuffled" ? { ...base, kind: "shuffle" } : null;

    // ── "manual" is a mixed bucket — publish only the tagged public actions. ────
    case "manual":
      switch (readAct(ev)) {
        case "tournament_started":
          return { ...base, kind: "tournament" };
        case "tournament_finished":
          return { ...base, text: "Tournament finished", kind: "tournament" };
        case "finals":
          return { ...base, kind: "tournament" };
        case "match_started":
        case "matches_started":
          return { ...base, kind: "match_start" };
        case "champion":
          return { ...base, kind: "champion" };
        case "buyback":
          return { ...base, kind: "buyback" };
        // A manual queue reorder (⋮ Move Up/Down/Top/Bottom or ☰ drag) — one shared event.
        case "queue_moved": {
          const text = queueMoveText(ev);
          return text ? { ...base, text, kind: "queue" } : null;
        }
        // A table clear requeues players — spectators see the board/queue change.
        // Manual Assign Next Team / Match is a TD audit + Undo step only: the public board
        // already shows the new pairing, so no spectator line.
        case "assign_next":
          return null;
        case "table_cleared":
        case "table_player_removed": // one entry taken off a table (match voided if live)
          return { ...base, kind: "table" };
        // Untagged manual events (timer reset, table cleared, lock/unlock,
        // rematch-skipped, shuffle-mode toggles, shuffle cancelled) are TD-only —
        // except a legacy (pre-tag) queue reorder, recognised by its exact wording.
        default: {
          const text = queueMoveText(ev);
          return text ? { ...base, text, kind: "queue" } : null;
        }
      }

    // ── TD-only types: table_added, chip_adjust, player_added, undo/redo/restore.
    default:
      return null;
  }
};

// Map a newest-first event list → the public activity feed (newest first), capped.
export const toPublicActivityFeed = (
  events: ChipEvent[],
  limit = 40,
  numbering?: ChipMatchNumbering,
  // Is the tournament finished RIGHT NOW? When false, a "Tournament finished" line (left in the
  // log by a finish that was later reopened / undone) is not current truth and is hidden. When
  // finished, only the NEWEST finish line is shown. Omitted → legacy behaviour (all shown).
  opts?: { finished?: boolean },
): PublicActivity[] => {
  let finishedShown = false;
  // Item 7A: collapse the redundant "lost a chip → 0 remaining" line when that loss caused an
  // elimination. recordWinner emits a chip_loss (payload.resulting === 0) immediately followed
  // by an elimination for the SAME player, so the feed would tell the story twice. Drop the
  // chip-loss-to-0 for any player who has a (non-superseded) elimination; a genuine chip loss
  // that did NOT eliminate (resulting > 0) is always kept.
  const eliminatedIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === "elimination" && !ev.superseded) {
      const id = ev.payload?.entryId as string | undefined;
      if (id) eliminatedIds.add(id);
    }
  }
  const out: PublicActivity[] = [];
  for (const ev of events) {
    if (
      ev.type === "chip_loss" &&
      Number(ev.payload?.resulting ?? 1) <= 0 &&
      eliminatedIds.has(ev.payload?.entryId as string)
    )
      continue; // redundant with the player's elimination line
    const a = toPublicActivity(ev);
    if (a && ev.type === "manual" && ev.payload?.act === "tournament_finished" && opts?.finished !== undefined) {
      if (!opts.finished || finishedShown) continue;
      finishedShown = true;
    }
    if (a) {
      const num = numbering ? chipEventMatchNumber(numbering, ev) : null;
      out.push(num ? { ...a, matchNumber: num.number } : a);
    }
    if (out.length >= limit) break;
  }
  return out;
};
