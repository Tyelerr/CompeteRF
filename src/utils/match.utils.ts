// src/utils/match.utils.ts
// Builds the screen-ready "live match" list for the Matches tab from the
// generated bracket (round 1), the per-match live state (live_settings.matchState),
// and the tournament tables (for stream flags + table labels). Pure functions.

import {
  GeneratedBracket,
  MatchLiveState,
  MatchResult,
  MatchStatus,
} from "../models/types/tournament-settings.types";
import { TournamentTable } from "../models/types/tournament-table.types";
import { minutesPerGameForType } from "./bracket.utils";

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
  matchNumber: number;
  p1Name: string | null;
  p2Name: string | null;
  p1Race: number | null;
  p2Race: number | null;
  raceTo: number | null; // common race when both sides match
  raceLabel: string; // compact, e.g. "Race 7"
  bye: boolean;
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

export const buildLiveMatches = (
  bracket: GeneratedBracket | null,
  matchState: Record<string, MatchLiveState>,
  tables: TournamentTable[],
  gameType: string,
): LiveMatch[] => {
  if (!bracket) return [];
  return bracket.round1.map((m) => {
    const st = matchState[String(m.matchNumber)];
    const table = tables.find((t) => t.id === st?.tableId);
    const raceForEst =
      m.raceTo ?? (Math.max(m.p1?.raceTo ?? 0, m.p2?.raceTo ?? 0) || null);
    const raceLabel = m.bye
      ? "Bye"
      : m.raceTo != null
        ? `Race ${m.raceTo}`
        : `${m.p1?.raceTo ?? "?"} / ${m.p2?.raceTo ?? "?"}`;
    const hasCustomTimer = st?.timerSeconds != null && st.timerSeconds > 0;
    return {
      matchNumber: m.matchNumber,
      p1Name: m.p1?.name ?? null,
      p2Name: m.p2?.name ?? null,
      p1Race: m.p1?.raceTo ?? null,
      p2Race: m.p2?.raceTo ?? null,
      raceTo: m.raceTo,
      raceLabel,
      bye: m.bye,
      status: (st?.status ?? "scheduled") as MatchStatus,
      tableId: st?.tableId ?? null,
      tableLabel: tableLabelOf(table),
      isStream: !!table?.is_streaming,
      streamLink: table?.stream_link ?? null,
      startedAt: st?.startedAt ?? null,
      completedAt: st?.completedAt ?? null,
      winner: st?.winner ?? null,
      p1Score: st?.p1Score ?? null,
      p2Score: st?.p2Score ?? null,
      result: st?.result ?? null,
      allowedSeconds: hasCustomTimer
        ? (st?.timerSeconds as number)
        : allowedSecondsForRace(raceForEst, gameType),
      hasCustomTimer,
    };
  });
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
