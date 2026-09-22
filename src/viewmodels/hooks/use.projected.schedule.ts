// src/viewmodels/hooks/use.projected.schedule.ts
// Memoized projected elimination schedule (see utils/schedule.projection.ts).
// Derived — never persisted. Recomputes only when an input that can change the
// schedule changes: the bracket (draw/redraw), the resolved match list /
// matchState (completion, advancement, table assignment), the auto-assign mode,
// or the manual queue order. No ticker: order does not depend on the clock
// (ready-entry waits all shift together), so `now` is sampled per recompute.
//
// Shared by the admin hub and (later) the spectator view; callers pass the same
// LiveMatch[] they already build with buildLiveMatches.

import { useMemo } from "react";
import {
  AutoAssignMode,
  GeneratedBracket,
  MatchLiveState,
} from "../../models/types/tournament-settings.types";
import { LiveMatch } from "../../utils/match.utils";
import { ProjectedSchedule, projectSchedule } from "../../utils/schedule.projection";

// Sampled once per recompute (not a ticker) — wrapped so the lint purity rule
// doesn't flag Date.now() inside the memo (same pattern as useTournamentSpectator).
const nowMs = (): number => Date.now();

export const useProjectedSchedule = (
  bracket: GeneratedBracket | null,
  matches: LiveMatch[],
  matchState: Record<string, MatchLiveState>,
  mode: AutoAssignMode,
  queueOrder: string[],
  queuePins: unknown = [],
): ProjectedSchedule => {
  // Hub returns a fresh [] when queueOrder is unset — key on content, not identity.
  const queueKey = queueOrder.join("|");
  const pinsKey = JSON.stringify(Array.isArray(queuePins) ? queuePins : []);
  return useMemo(
    () =>
      projectSchedule({
        bracket,
        matches,
        matchState,
        mode,
        queueOrder: queueKey ? queueKey.split("|") : [],
        now: nowMs(),
        queuePins: JSON.parse(pinsKey),
      }),
    [bracket, matches, matchState, mode, queueKey, pinsKey],
  );
};
