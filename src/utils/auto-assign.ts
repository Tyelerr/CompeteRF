// src/utils/auto-assign.ts
// Auto Assign — the ONE planning step, shared by the app and the server.
//
// The server-side `auto-assign-run` Edge Function runs this exact code (bundled into
// supabase/functions/_shared/scheduler.bundle.js by `npm run build:scheduler`; a test fails if
// the bundle is stale). It composes the existing app logic end to end — no second scheduler:
//   raceConfigFromLiveSettings → buildLiveMatches (resolver) → projectSchedule (mode, Manual
//   order, queue pins, Ready-first tiers) → readyQueue → planAutoAssign (Play Next first, then
//   lowest free table) over the free tables.
// Pure: no React, no Supabase.

import { GeneratedBracket, MatchLiveState, TournamentLiveSettings } from "../models/types/tournament-settings.types";
import { TournamentTable } from "../models/types/tournament-table.types";
import { raceConfigFromLiveSettings } from "./bracket.utils";
import { clearHeldIds } from "./clear-table";
import { buildLiveMatches, LiveMatch } from "./match.utils";
import { AssignmentPlan, freeTables, planAutoAssign } from "./queue.utils";
import { projectSchedule } from "./schedule.projection";

// Tables holding a match that isn't finished (same rule as the Manage screen's occupancy).
export const computeTableOccupancy = (matches: LiveMatch[]): Record<number, string> => {
  const occ: Record<number, string> = {};
  for (const m of matches) {
    if (m.tableId != null && m.status !== "completed" && !m.bye && !m.empty) occ[m.tableId] = m.id;
  }
  return occ;
};

// Is Auto Assign active for this tournament right now? (enabled, running, not paused, elim)
export const autoAssignActive = (
  t:
    | {
        live_settings?: { autoAssignEnabled?: boolean | null } | null;
        live_state?: string | null;
        is_paused?: boolean | null;
        tournament_format?: string | null;
      }
    | null
    | undefined,
): boolean =>
  !!t &&
  t.live_settings?.autoAssignEnabled === true &&
  t.live_state === "in_progress" &&
  !t.is_paused &&
  t.tournament_format !== "chip-tournament";

// The assignments Auto Assign would make now: ready matches (selected mode / Manual order /
// queue pins) paired with free tables (Play Next preferences first). Empty = nothing to do.
export const planAutoAssignFromState = (args: {
  liveSettings: TournamentLiveSettings | null | undefined;
  tables: TournamentTable[];
  gameType: string;
  now: number;
}): AssignmentPlan[] => {
  const ls = args.liveSettings ?? {};
  const bracket = (ls.bracket ?? null) as GeneratedBracket | null;
  if (!bracket?.graph) return [];
  const matchState = (ls.matchState ?? {}) as Record<string, MatchLiveState>;
  const matches = buildLiveMatches(bracket, matchState, args.tables, args.gameType, raceConfigFromLiveSettings(ls));
  const schedule = projectSchedule({
    bracket,
    matches,
    matchState,
    mode: ls.autoAssignMode ?? "balanced",
    queueOrder: ls.queueOrder ?? [],
    queuePins: ls.queuePins ?? [],
    now: args.now,
  });
  // A just-cleared match is held back for 2 minutes so Clear Table isn't undone by the run its own
  // write triggers (src/utils/clear-table.ts). Every other Ready match still competes for the
  // freed table, and the hold ends on its own — Auto Assign itself is untouched.
  const held = clearHeldIds(matchState, args.now);
  const ready = held.size ? schedule.readyQueue.filter((e) => !held.has(e.match.id)) : schedule.readyQueue;
  return planAutoAssign(ready, freeTables(args.tables, computeTableOccupancy(matches)));
};
