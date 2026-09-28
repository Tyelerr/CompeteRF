// src/utils/chip-round-participation.ts
// Shuffle Mode round participation for Chip tournaments (pure, shared by the engine and every
// surface — admin, spectator, player profile).
//
// "PLAYED THIS ROUND" = the entry was the winner or loser of a VALID completed match result
// recorded during the CURRENT shuffle round. Being seated / assigned / in a started match does
// NOT count; a voided match (Clear Table, Remove Player, Return active matches) never logs a
// result, so it never counts.
//
//   • Round identity: every round begins at finalizeReshuffle, which logs ONE `shuffle` event
//     tagged payload.act "reshuffled" ("Reshuffle #N"). The round can only start with every
//     table empty (hasOpenTableAssignment guard), so every result logged after that event
//     belongs to this round. No schema: derived from the persisted chip_events.
//   • Valid results: utils/chip-match-numbers (the Match # derivation) — non-superseded
//     match_result events (Forfeit Match included) + Forfeit Tournament mid-match results,
//     de-duplicated, excluding results undone / restored away. So Undo / Restore removes the
//     participation automatically.
//   • Winner stays: the recorded result is enough — no dependence on leaving the table.

import { ChipEvent, ChipState } from "../models/types/chip.types";
import { numberChipMatches } from "./chip-match-numbers";

type RoundChip = Pick<ChipState, "events" | "matches" | "shuffleRound">;

const ts = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};
const after = (a: { at: string; id: string }, b: { at: string; id: string }): boolean =>
  ts(a.at) > ts(b.at) || (ts(a.at) === ts(b.at) && a.id > b.id);

// The event that started the current shuffle round (latest non-superseded "reshuffled").
export const currentShuffleRoundStart = (events: ChipEvent[]): ChipEvent | null => {
  let best: ChipEvent | null = null;
  for (const ev of events) {
    if (ev.superseded || ev.type !== "shuffle" || ev.payload?.act !== "reshuffled") continue;
    if (!best || after(ev, best)) best = ev;
  }
  return best;
};

// Entry ids with at least one valid completed result in the current shuffle round.
// Empty outside a shuffle round.
export const chipRoundPlayedIds = (chip: RoundChip): Set<string> => {
  const played = new Set<string>();
  if (!chip.shuffleRound) return played;
  const start = currentShuffleRoundStart(chip.events);
  if (!start) return played;
  for (const r of numberChipMatches(chip).list) {
    if (!after({ at: r.completedAt, id: r.eventId }, start)) continue;
    if (r.winnerId) played.add(r.winnerId);
    if (r.loserId) played.add(r.loserId);
  }
  return played;
};

// Queue round badge (TEAM-level), shared by admin / spectator / profile:
//   "waiting" — still owed a turn this round (roundRemaining: not yet seated);
//   "played"  — has a valid completed result this round (winner-stays included);
//   null      — neither (seated / live and not yet finished, or not part of this round,
//               e.g. restored mid-round and waiting for the next reshuffle).
export const chipRoundStatusFor = (
  chip: Pick<ChipState, "shuffleRound" | "roundRemaining">,
  playedIds: Set<string>,
  id: string,
): "waiting" | "played" | null => {
  if (!chip.shuffleRound) return null;
  if (chip.roundRemaining?.includes(id)) return "waiting";
  if (playedIds.has(id)) return "played";
  return null;
};
