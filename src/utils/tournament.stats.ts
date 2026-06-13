// src/utils/tournament.stats.ts
// Pure tournament-wide stats derived from the live match list (the same LiveMatch[]
// the bracket / Matches views use). No React, no Supabase — feed it buildLiveMatches
// output and render the result. Drives the read-only Stats tab shown to everyone in
// the live tournament view and to the TD in the manage hub.

import { LiveMatch } from "./match.utils";

export interface PlayerRecord {
  key: string;
  name: string;
  wins: number;
  losses: number;
  fargo: number | null;
}

export interface TournamentStats {
  matchesTotal: number; // real matches (byes / empty placeholders excluded)
  matchesCompleted: number;
  matchesInProgress: number;
  matchesRemaining: number;
  percentComplete: number; // 0–100
  avgMatchMs: number | null; // average played duration of completed matches
  fastestMatchMs: number | null;
  longestMatchMs: number | null;
  totalRacks: number; // sum of every score in completed matches
  forfeits: number;
  withdrawals: number;
  upsets: number; // completed matches a lower-Fargo player won
  leaders: PlayerRecord[]; // per-player W/L, best record first
}

export const computeTournamentStats = (matches: LiveMatch[]): TournamentStats => {
  const real = matches.filter((m) => !m.bye && !m.empty);
  const completed = real.filter((m) => m.status === "completed");
  const inProgress = real.filter((m) => m.status === "in_progress");

  const matchesTotal = real.length;
  const matchesCompleted = completed.length;
  const matchesInProgress = inProgress.length;
  const matchesRemaining = Math.max(
    0,
    matchesTotal - matchesCompleted - matchesInProgress,
  );
  const percentComplete =
    matchesTotal > 0 ? Math.round((matchesCompleted / matchesTotal) * 100) : 0;

  const durations: number[] = [];
  let totalRacks = 0;
  let forfeits = 0;
  let withdrawals = 0;
  let upsets = 0;

  const recs = new Map<string, PlayerRecord>();
  const bump = (
    key: string,
    name: string,
    fargo: number | null,
    win: boolean,
  ) => {
    let r = recs.get(key);
    if (!r) {
      r = { key, name, wins: 0, losses: 0, fargo };
      recs.set(key, r);
    }
    if (fargo != null) r.fargo = fargo;
    if (win) r.wins += 1;
    else r.losses += 1;
  };

  for (const m of completed) {
    if (m.startedAt && m.completedAt) {
      const d =
        new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime();
      if (d > 0) durations.push(d);
    }
    totalRacks += (m.p1Score ?? 0) + (m.p2Score ?? 0);
    if (m.result === "forfeit") forfeits += 1;
    if (m.result === "withdraw") withdrawals += 1;

    if (m.winner === 1 || m.winner === 2) {
      const wFargo = m.winner === 1 ? m.p1Fargo : m.p2Fargo;
      const lFargo = m.winner === 1 ? m.p2Fargo : m.p1Fargo;
      if (wFargo != null && lFargo != null && wFargo < lFargo) upsets += 1;

      const p1Key = m.p1RegId != null ? `r${m.p1RegId}` : `n${m.p1Name ?? "?"}`;
      const p2Key = m.p2RegId != null ? `r${m.p2RegId}` : `n${m.p2Name ?? "?"}`;
      if (m.p1Name) bump(p1Key, m.p1Name, m.p1Fargo, m.winner === 1);
      if (m.p2Name) bump(p2Key, m.p2Name, m.p2Fargo, m.winner === 2);
    }
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  const avgMatchMs = durations.length ? sum / durations.length : null;
  const fastestMatchMs = durations.length ? Math.min(...durations) : null;
  const longestMatchMs = durations.length ? Math.max(...durations) : null;

  const winPct = (r: PlayerRecord) => {
    const g = r.wins + r.losses;
    return g === 0 ? 0 : r.wins / g;
  };
  const leaders = [...recs.values()].sort(
    (a, b) =>
      b.wins - a.wins || winPct(b) - winPct(a) || a.name.localeCompare(b.name),
  );

  return {
    matchesTotal,
    matchesCompleted,
    matchesInProgress,
    matchesRemaining,
    percentComplete,
    avgMatchMs,
    fastestMatchMs,
    longestMatchMs,
    totalRacks,
    forfeits,
    withdrawals,
    upsets,
    leaders,
  };
};

// "12m" / "1h 5m" / "<1m" / "—" for a played-duration in ms.
export const formatDurationMs = (ms: number | null): string => {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// "75%" win rate for a record (0 games → "—").
export const winPctLabel = (r: PlayerRecord): string => {
  const g = r.wins + r.losses;
  return g === 0 ? "—" : `${Math.round((r.wins / g) * 100)}%`;
};
