// src/utils/bracket.simulate.ts
// DEV/test helper: play a drawn bracket out to a fraction of completion using the
// real resolver, so a mock tournament lands in a realistic mid-event state with
// BOTH winner and loser sides partially played. Pure — returns the matchState to
// persist. Winner of each match = the higher Fargo (deterministic, reproducible).

import {
  GeneratedBracket,
  MatchLiveState,
} from "../models/types/tournament-settings.types";
import { RaceConfig } from "./bracket.utils";
import { MatchResult, resolveBracket } from "./bracket.resolve";

export const simulateBracket = (
  bracket: GeneratedBracket,
  cfg: RaceConfig,
  fraction: number,
  now: number,
): Record<string, MatchLiveState> => {
  if (!bracket.graph || !bracket.seeds) return {};
  const graph = bracket.graph;
  const seeds = bracket.seeds;

  // 1) Full dry simulation, recording the order matches complete in. Each wave
  // completes every match that's ready (both players known, not a bye); doing so
  // opens the next winners round AND drops losers into the losers bracket, so the
  // completion order naturally interleaves both sides.
  const sim: Record<string, MatchResult> = {};
  const completedOrder: string[] = [];
  let guard = 5000;
  while (guard-- > 0) {
    const resolved = resolveBracket(graph, seeds, sim, cfg);
    const ready = resolved.matches.filter(
      (m) =>
        !m.skipped &&
        !m.isEmpty &&
        !m.isBye &&
        !m.pending &&
        m.s1.player &&
        m.s2.player &&
        !sim[m.id],
    );
    if (ready.length === 0) break;
    for (const m of ready) {
      const f1 = m.s1.player?.fargo ?? 0;
      const f2 = m.s2.player?.fargo ?? 0;
      sim[m.id] = { completed: true, winner: f1 >= f2 ? 1 : 2, result: "normal" };
      completedOrder.push(m.id);
    }
  }

  const total = completedOrder.length;
  if (total === 0) return {};
  const target = Math.max(1, Math.min(total, Math.floor(total * fraction)));
  const keep = completedOrder.slice(0, target);

  // 2) Re-resolve with only the kept results so each kept match's players + race
  // are correct at that point in time.
  const partial: Record<string, MatchResult> = {};
  for (const id of keep) partial[id] = sim[id];
  const byId = resolveBracket(graph, seeds, partial, cfg).byId;

  // 3) Build matchState with staggered timestamps (earliest kept oldest, last
  // kept ~ now) so wait times on the now-ready matches look realistic.
  const GAP_MIN = 4;
  const matchState: Record<string, MatchLiveState> = {};
  keep.forEach((id, i) => {
    const rm = byId.get(id);
    const winner = sim[id].winner as 1 | 2;
    const race = rm?.commonRace ?? rm?.s1.raceTo ?? rm?.s2.raceTo ?? 7;
    const loserScore = Math.max(0, Math.floor(race * 0.5) + (i % 3));
    const endMinAgo = (target - i) * GAP_MIN;
    matchState[id] = {
      status: "completed",
      winner,
      result: "normal",
      tableId: null,
      p1Score: winner === 1 ? race : loserScore,
      p2Score: winner === 2 ? race : loserScore,
      startedAt: new Date(now - (endMinAgo + 18) * 60000).toISOString(),
      completedAt: new Date(now - endMinAgo * 60000).toISOString(),
    };
  });
  return matchState;
};
