// src/utils/player.performance.ts
// Profile "Performance Snapshot" — aggregate a player's results across the
// tournaments they've entered, over a time window. Pure: feed it the player's
// history rows (bracket + match state per tournament) and it derives matches /
// win% / placements / streak. Reuses the live bracket resolver + standings, so
// these numbers match what the bracket / results show. No Fargo stats (no data).

import { TournamentLiveSettings } from "../models/types/tournament-settings.types";
import { RaceConfig } from "./bracket.utils";
import { buildLiveMatches } from "./match.utils";
import { computeStandings } from "./tournament.stats";

export interface PlayerHistoryRow {
  regId: number; // the player's tournament_players.id in this event
  gameType: string | null;
  date: string | null; // tournament_date
  status: string | null;
  liveState: string | null;
  liveSettings: TournamentLiveSettings | null;
}

export interface PlayerPerformance {
  matchesPlayed: number;
  matchesWon: number;
  winPct: number | null; // 0–100
  avgPlacement: number | null;
  bestFinish: number | null; // numeric place
  topGameType: string | null; // prettified, e.g. "9 Ball"
  tournamentWins: number;
  topThree: number;
  streakType: "W" | "L" | null;
  streakCount: number;
  events: number; // finished events that produced a placement
}

export const PERIODS = [
  { key: "TODAY", label: "Today", days: 0 },
  { key: "7D", label: "7D", days: 7 },
  { key: "30D", label: "30D", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "All", days: null },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export const prettyGameType = (g: string | null): string =>
  !g
    ? "—"
    : g
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

const raceConfigOf = (ls: TournamentLiveSettings | null): RaceConfig => ({
  mode: ls?.raceMode ?? "fixed",
  fixedWinners: ls?.fixedRaceWinners ?? 5,
  groups: ls?.raceGroups ?? [],
  diffMin: ls?.fargoDiffMinRace ?? 3,
  diffPerGame: ls?.fargoDiffPerGame ?? 40,
  diffMax: ls?.fargoDiffMaxRace ?? null,
});

export const computePlayerPerformance = (
  rows: PlayerHistoryRow[],
  periodDays: number | null,
  now: number,
): PlayerPerformance => {
  // days null = all time; 0 = since the start of today; otherwise a rolling window.
  let cutoff = 0;
  if (periodDays === 0) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    cutoff = d.getTime();
  } else if (periodDays != null) {
    cutoff = now - periodDays * 86400000;
  }
  const inWindow = rows.filter((r) => {
    if (periodDays == null) return true;
    const t = r.date ? Date.parse(r.date) : 0;
    return t >= cutoff;
  });

  let matchesPlayed = 0;
  let matchesWon = 0;
  let tournamentWins = 0;
  let topThree = 0;
  const placements: number[] = [];
  const gameCount = new Map<string, number>();
  const results: { at: number; won: boolean }[] = [];

  for (const r of inWindow) {
    if (r.gameType) gameCount.set(r.gameType, (gameCount.get(r.gameType) ?? 0) + 1);
    const ls = r.liveSettings;
    if (!ls?.bracket) continue;

    const matches = buildLiveMatches(
      ls.bracket,
      ls.matchState ?? {},
      [],
      r.gameType ?? "",
      raceConfigOf(ls),
    );

    for (const m of matches) {
      if (m.bye || m.empty || m.status !== "completed") continue;
      const isP1 = m.p1RegId === r.regId;
      const isP2 = m.p2RegId === r.regId;
      if (!isP1 && !isP2) continue;
      if (m.winner !== 1 && m.winner !== 2) continue;
      const won = m.winner === (isP1 ? 1 : 2);
      matchesPlayed += 1;
      if (won) matchesWon += 1;
      results.push({ at: m.completedAt ? Date.parse(m.completedAt) : 0, won });
    }

    if (r.status === "completed" || r.liveState === "finished") {
      const me = computeStandings(matches).find((s) => s.key === `r${r.regId}`);
      if (me) {
        placements.push(me.place);
        if (me.place === 1) tournamentWins += 1;
        if (me.place <= 3) topThree += 1;
      }
    }
  }

  // Current streak: most recent matches, leading run of the same result.
  results.sort((a, b) => b.at - a.at);
  let streakType: "W" | "L" | null = null;
  let streakCount = 0;
  for (const res of results) {
    const t = res.won ? "W" : "L";
    if (streakType === null) {
      streakType = t;
      streakCount = 1;
    } else if (t === streakType) {
      streakCount += 1;
    } else break;
  }

  let topGameType: string | null = null;
  let topN = 0;
  for (const [g, c] of gameCount) {
    if (c > topN) {
      topN = c;
      topGameType = g;
    }
  }

  return {
    matchesPlayed,
    matchesWon,
    winPct: matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : null,
    avgPlacement: placements.length
      ? placements.reduce((a, b) => a + b, 0) / placements.length
      : null,
    bestFinish: placements.length ? Math.min(...placements) : null,
    topGameType: topGameType ? prettyGameType(topGameType) : null,
    tournamentWins,
    topThree,
    streakType,
    streakCount,
    events: placements.length,
  };
};
