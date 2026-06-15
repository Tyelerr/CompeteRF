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
  bestFinishDate: string | null; // when that finish was achieved
  topGameType: string | null; // prettified, e.g. "9 Ball"
  topGameEvents: number; // events of that game type
  eventsEntered: number; // tournaments entered in the window
  tournamentWins: number;
  topThree: number;
  streakType: "W" | "L" | null;
  streakCount: number;
  events: number; // finished events that produced a placement
}

export const PERIODS = [
  { key: "TODAY", label: "Today", days: 0 },
  { key: "7D", label: "7 Days", days: 7 },
  { key: "30D", label: "30 Days", days: 30 },
  { key: "6M", label: "6 Months", days: 180 },
  { key: "1Y", label: "1 Year", days: 365 },
  { key: "ALL", label: "All Time", days: null },
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

// Inclusive of startMs, exclusive of endMs (rows are dated by tournament_date).
const computeWindow = (
  rows: PlayerHistoryRow[],
  startMs: number,
  endMs: number,
): PlayerPerformance => {
  const inWindow = rows.filter((r) => {
    const t = r.date ? Date.parse(r.date) : 0;
    return t >= startMs && t < endMs;
  });

  let matchesPlayed = 0;
  let matchesWon = 0;
  let tournamentWins = 0;
  let topThree = 0;
  const placements: { place: number; date: string | null }[] = [];
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
        placements.push({ place: me.place, date: r.date });
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
  let topGameEvents = 0;
  for (const [g, c] of gameCount) {
    if (c > topGameEvents) {
      topGameEvents = c;
      topGameType = g;
    }
  }

  const best = placements.reduce<{ place: number; date: string | null } | null>(
    (acc, p) => (acc == null || p.place < acc.place ? p : acc),
    null,
  );

  return {
    matchesPlayed,
    matchesWon,
    winPct: matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : null,
    avgPlacement: placements.length
      ? placements.reduce((a, b) => a + b.place, 0) / placements.length
      : null,
    bestFinish: best?.place ?? null,
    bestFinishDate: best?.date ?? null,
    topGameType: topGameType ? prettyGameType(topGameType) : null,
    topGameEvents,
    eventsEntered: inWindow.length,
    tournamentWins,
    topThree,
    streakType,
    streakCount,
    events: placements.length,
  };
};

// The window for a period: { start, len } (len null = all time, no prior window).
const windowFor = (
  periodDays: number | null,
  now: number,
): { start: number; len: number | null } => {
  if (periodDays == null) return { start: 0, len: null };
  if (periodDays === 0) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { start: d.getTime(), len: 86400000 };
  }
  return { start: now - periodDays * 86400000, len: periodDays * 86400000 };
};

export const computePlayerPerformance = (
  rows: PlayerHistoryRow[],
  periodDays: number | null,
  now: number,
): PlayerPerformance => {
  const { start } = windowFor(periodDays, now);
  return computeWindow(rows, start, Infinity);
};

// The immediately-preceding window of the same length (for trend deltas). Null
// for All Time (no prior window to compare against).
export const computePreviousPerformance = (
  rows: PlayerHistoryRow[],
  periodDays: number | null,
  now: number,
): PlayerPerformance | null => {
  const { start, len } = windowFor(periodDays, now);
  if (len == null) return null;
  return computeWindow(rows, start - len, start);
};
