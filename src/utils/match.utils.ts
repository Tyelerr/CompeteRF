// src/utils/match.utils.ts
// Builds the screen-ready "live match" list for the Matches tab from the
// generated bracket (round 1), the per-match live state (live_settings.matchState),
// and the tournament tables (for stream flags + table labels). Pure functions.

import {
  BracketSide,
  GeneratedBracket,
  MatchLiveState,
  MatchResult,
  MatchStatus,
} from "../models/types/tournament-settings.types";
import { TournamentTable } from "../models/types/tournament-table.types";
import { minutesPerGameForType, RaceConfig } from "./bracket.utils";
import { MatchResult as ResolverResult, resolveBracket } from "./bracket.resolve";

// Steps the match action sheet can open to (shared by cards, nodes, and the modal).
export type MatchActionStep =
  | "menu"
  | "table"
  | "winner"
  | "score"
  | "timer"
  | "forfeit"
  | "withdraw"
  | "details";

export interface LiveMatch {
  id: string; // match id, e.g. "W1M1", "L2M1", "GF", "GF2"
  label: string; // friendly display label, e.g. "Winners Side Match 27"
  side: BracketSide; // winners | losers | grand
  round: number; // round within its side
  p1Name: string | null;
  p2Name: string | null;
  p1Race: number | null;
  p2Race: number | null;
  raceTo: number | null; // common race when both sides match
  raceLabel: string; // compact, e.g. "Race 7"
  bye: boolean;
  empty: boolean; // no players will ever arrive (both feeders were byes)
  pending: boolean; // players not all known yet (TBD)
  status: MatchStatus;
  tableId: number | null;
  tableLabel: string | null;
  isStream: boolean;
  streamLink: string | null;
  startedAt: string | null;
  completedAt: string | null;
  winner: 1 | 2 | null;
  p1Score: number | null;
  p2Score: number | null;
  result: MatchResult | null;
  allowedSeconds: number; // overtime threshold (timer turns red past this)
  hasCustomTimer: boolean;
  // True only while a match is actually being played on a stream table — drives
  // the LIVE badge + red border. Completed matches are never "live active".
  isLiveActive: boolean;
}

const tableLabelOf = (t: TournamentTable | undefined): string | null => {
  if (!t) return null;
  return t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`;
};

// Allowed match time: ~1.5 games per race point, at the game type's minutes
// per game. e.g. race 7, 9-ball (7 min/game) -> ~11 games -> ~73 min.
export const allowedSecondsForRace = (
  raceTo: number | null,
  gameType: string,
): number => {
  const race = raceTo && raceTo > 0 ? raceTo : 5;
  const games = Math.max(1, Math.round(race * 1.5));
  return games * minutesPerGameForType(gameType) * 60;
};

// Friendly, side-local match labels computed once from the graph (in graph
// order), so the same name is used everywhere (cards, nodes, modal).
const buildLabelMap = (
  graph: NonNullable<GeneratedBracket["graph"]>,
): Record<string, string> => {
  const map: Record<string, string> = {};
  // In double elim the winners-bracket final is the "Hotseat" — its winner is
  // locked into the grand final (guaranteed 1st or 2nd).
  const hasLosers = graph.some((n) => n.side === "losers");
  const maxWinRound = graph.reduce(
    (a, n) => (n.side === "winners" ? Math.max(a, n.round) : a),
    0,
  );
  let w = 0;
  let l = 0;
  for (const n of graph) {
    if (n.side === "winners") {
      if (hasLosers && n.round === maxWinRound) map[n.id] = "Hotseat Match";
      else map[n.id] = `Winners Side Match ${++w}`;
    } else if (n.side === "losers") map[n.id] = `Losers Side Match ${++l}`;
    else map[n.id] = n.id === "GF2" ? "Finals (2nd Set)" : "Finals";
  }
  return map;
};

// Build the screen-ready match list from the bracket graph + seeds + live state.
// The resolver flows players through the graph (winners advance, losers drop),
// and we layer the live state (status/score/timer/table) on top. Skipped matches
// (an unneeded GF2 reset) are dropped; empty matches (both feeders were byes) are
// kept with empty=true so the bracket can lay out the tree without gaps.
export const buildLiveMatches = (
  bracket: GeneratedBracket | null,
  matchState: Record<string, MatchLiveState>,
  tables: TournamentTable[],
  gameType: string,
  cfg: RaceConfig,
): LiveMatch[] => {
  if (!bracket?.graph || !bracket.seeds) return [];

  const results: Record<string, ResolverResult> = {};
  for (const [id, st] of Object.entries(matchState)) {
    results[id] = {
      completed: st.status === "completed",
      winner: st.winner ?? null,
      result: st.result ?? null,
    };
  }
  const resolved = resolveBracket(bracket.graph, bracket.seeds, results, cfg);
  const labelMap = buildLabelMap(bracket.graph);

  const out: LiveMatch[] = [];
  for (const rm of resolved.matches) {
    if (rm.skipped) continue;
    const st = matchState[rm.id];
    const table = tables.find((t) => t.id === st?.tableId);
    const status = (st?.status ?? "scheduled") as MatchStatus;

    // For a bye, show the advancing player on top and a dash opponent.
    let p1Name: string | null;
    let p2Name: string | null;
    let p1Race: number | null;
    let p2Race: number | null;
    if (rm.isBye) {
      const present = rm.autoWinnerSlot === 1 ? rm.s1 : rm.s2;
      p1Name = present.player?.name ?? null;
      p1Race = present.raceTo;
      p2Name = null;
      p2Race = null;
    } else {
      p1Name = rm.s1.player?.name ?? null;
      p2Name = rm.s2.player?.name ?? null;
      p1Race = rm.s1.raceTo;
      p2Race = rm.s2.raceTo;
    }

    const raceForEst =
      rm.commonRace ?? (Math.max(rm.s1.raceTo ?? 0, rm.s2.raceTo ?? 0) || null);
    const raceLabel = rm.isBye
      ? "Bye"
      : rm.commonRace != null
        ? `Race ${rm.commonRace}`
        : `${rm.s1.raceTo ?? "?"} / ${rm.s2.raceTo ?? "?"}`;
    const hasCustomTimer = st?.timerSeconds != null && st.timerSeconds > 0;

    out.push({
      id: rm.id,
      label: labelMap[rm.id] ?? rm.id,
      side: rm.side,
      round: rm.round,
      empty: rm.isEmpty,
      p1Name,
      p2Name,
      p1Race,
      p2Race,
      raceTo: rm.commonRace,
      raceLabel,
      bye: rm.isBye,
      pending: rm.pending,
      status,
      tableId: st?.tableId ?? null,
      tableLabel: tableLabelOf(table),
      isStream: !!table?.is_streaming,
      isLiveActive: status === "in_progress" && !!table?.is_streaming,
      streamLink: table?.stream_link ?? null,
      startedAt: st?.startedAt ?? null,
      completedAt: st?.completedAt ?? null,
      winner: st?.winner ?? null,
      p1Score: st?.p1Score ?? null,
      p2Score: st?.p2Score ?? null,
      result: st?.result ?? null,
      allowedSeconds: hasCustomTimer
        ? (st.timerSeconds as number)
        : allowedSecondsForRace(raceForEst, gameType),
      hasCustomTimer,
    });
  }
  return out;
};

// mm:ss (or h:mm:ss) for a positive seconds count.
export const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
