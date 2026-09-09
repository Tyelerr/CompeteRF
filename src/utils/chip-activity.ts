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

// Semantic categories for the spectator feed (drive icon/dot colour, not wording).
export type PublicActivityKind =
  | "match_start" // a match / matches began
  | "result" // someone beat someone
  | "chip_loss" // a chip was lost
  | "elimination" // a team was eliminated
  | "forfeit" // a forfeit
  | "buyback" // an eliminated team bought back in
  | "table" // table opened for its next match / moved / closed
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
        // A table clear requeues players — spectators see the board/queue change.
        case "table_cleared":
          return { ...base, kind: "table" };
        // Untagged manual events (queue reorder, timer reset, table cleared,
        // lock/unlock, rematch-skipped, shuffle-mode toggles, shuffle cancelled)
        // are TD-only.
        default:
          return null;
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
): PublicActivity[] => {
  const out: PublicActivity[] = [];
  for (const ev of events) {
    const a = toPublicActivity(ev);
    if (a) out.push(a);
    if (out.length >= limit) break;
  }
  return out;
};
