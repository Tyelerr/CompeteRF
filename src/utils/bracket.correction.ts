// src/utils/bracket.correction.ts
// What a result correction would touch. Elimination advancement is DERIVED (bracket.resolve):
// matchState stores each match's winner as a SLOT (1 | 2), not a player. Changing an earlier
// result therefore re-seats players in every match fed by it, and any result already recorded
// downstream stays attached to its SLOT — i.e. it moves to whoever now sits in that slot.
// This module only REPORTS that impact (no cascade rule is invented here); callers decide
// whether to block, warn, or require a downstream reset. Pure.

import { BracketGraphNode, MatchLiveState } from "../models/types/tournament-settings.types";

// Every match reachable from `matchId` through winner/loser links (transitively).
export const downstreamMatchIds = (graph: BracketGraphNode[], matchId: string): string[] => {
  const feeds = new Map<string, string[]>();
  for (const n of graph)
    for (const ref of [n.slot1, n.slot2])
      if (ref.kind === "winner" || ref.kind === "loser") feeds.set(ref.matchId, [...(feeds.get(ref.matchId) ?? []), n.id]);
  const out: string[] = [];
  const seen = new Set<string>([matchId]);
  const stack = [...(feeds.get(matchId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(feeds.get(id) ?? []));
  }
  return out;
};

const hasProgress = (st: MatchLiveState | undefined): boolean =>
  !!st &&
  ((st.status ?? "scheduled") !== "scheduled" ||
    st.winner != null ||
    st.p1Score != null ||
    st.p2Score != null ||
    st.tableId != null);

export interface CorrectionImpact {
  // Downstream matches that already have progress (a table, a start, a score or a result)
  // and would be re-seated by changing this match's result.
  affected: string[];
  // …of which already have a recorded RESULT (those results would move to different players).
  decided: string[];
}

export const correctionImpact = (
  graph: BracketGraphNode[],
  matchState: Record<string, MatchLiveState>,
  matchId: string,
): CorrectionImpact => {
  const down = downstreamMatchIds(graph, matchId);
  const affected = down.filter((id) => hasProgress(matchState[id]));
  const decided = affected.filter((id) => matchState[id]?.status === "completed");
  return { affected, decided };
};
