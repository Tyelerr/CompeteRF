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

// ── Per-player tournament performance ─────────────────────────────────────────
// Tournament Performance Rating (TPR) estimates how a player performed in THIS
// event relative to the strength of who they played. Game-level (rack) stats and
// the weighted opponent Fargo only count completed matches where the opponent's
// Fargo is known; the match win/loss record counts every completed match.
export interface PlayerTournamentStats {
  key: string;
  name: string;
  fargo: number | null; // the player's own current Fargo
  matchWins: number;
  matchLosses: number;
  gamesWon: number; // racks won (rated matches)
  gamesLost: number; // racks lost (rated matches)
  totalGames: number;
  winPct: number | null; // gamesWon / totalGames (null when no rated games)
  avgOpponentFargo: number | null; // games-weighted opponent Fargo, rounded
  performanceRating: number | null; // TPR, rounded (null when not computable)
  performanceDelta: number | null; // TPR − own Fargo
}

interface PlayerAcc {
  key: string;
  name: string;
  fargo: number | null;
  matchWins: number;
  matchLosses: number;
  gamesWon: number;
  gamesLost: number;
  totalGames: number;
  weightedFargoNum: number; // Σ opponentFargo × gamesInMatch
}

// −100 / ln(2): converts a game win-rate into a Fargo-point swing.
const TPR_K = -100 / Math.log(2);

export const computeAllPlayerStats = (
  matches: LiveMatch[],
): PlayerTournamentStats[] => {
  const real = matches.filter((m) => !m.bye && !m.empty);
  const map = new Map<string, PlayerAcc>();
  const keyOf = (regId: number | null, name: string | null) =>
    regId != null ? `r${regId}` : `n${name ?? "?"}`;
  const ensure = (
    regId: number | null,
    name: string | null,
    fargo: number | null,
  ): PlayerAcc | null => {
    if (!name) return null;
    const key = keyOf(regId, name);
    let a = map.get(key);
    if (!a) {
      a = {
        key,
        name,
        fargo,
        matchWins: 0,
        matchLosses: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalGames: 0,
        weightedFargoNum: 0,
      };
      map.set(key, a);
    }
    if (fargo != null) a.fargo = fargo;
    return a;
  };

  for (const m of real) {
    // Register both players up front so the picker lists them before they've played.
    const a1 = ensure(m.p1RegId, m.p1Name, m.p1Fargo);
    const a2 = ensure(m.p2RegId, m.p2Name, m.p2Fargo);
    if (m.status !== "completed" || !(m.winner === 1 || m.winner === 2)) continue;

    if (a1) {
      if (m.winner === 1) a1.matchWins += 1;
      else a1.matchLosses += 1;
    }
    if (a2) {
      if (m.winner === 2) a2.matchWins += 1;
      else a2.matchLosses += 1;
    }

    const p1 = m.p1Score ?? 0;
    const p2 = m.p2Score ?? 0;
    const g = p1 + p2;
    if (g <= 0) continue;
    // Each side's opponent Fargo must be valid to weight by; ignore otherwise.
    if (a1 && m.p2Fargo != null) {
      a1.gamesWon += p1;
      a1.gamesLost += p2;
      a1.totalGames += g;
      a1.weightedFargoNum += m.p2Fargo * g;
    }
    if (a2 && m.p1Fargo != null) {
      a2.gamesWon += p2;
      a2.gamesLost += p1;
      a2.totalGames += g;
      a2.weightedFargoNum += m.p1Fargo * g;
    }
  }

  const out: PlayerTournamentStats[] = [...map.values()].map((a) => {
    const winPct = a.totalGames > 0 ? a.gamesWon / a.totalGames : null;
    const avgRaw = a.totalGames > 0 ? a.weightedFargoNum / a.totalGames : null;
    let performanceRating: number | null = null;
    if (winPct != null && avgRaw != null) {
      // Cap the win-rate off 0/1 so the log term stays finite.
      const cap = Math.min(0.99, Math.max(0.01, winPct));
      performanceRating = Math.round(avgRaw + TPR_K * Math.log((1 - cap) / cap));
    }
    return {
      key: a.key,
      name: a.name,
      fargo: a.fargo,
      matchWins: a.matchWins,
      matchLosses: a.matchLosses,
      gamesWon: a.gamesWon,
      gamesLost: a.gamesLost,
      totalGames: a.totalGames,
      winPct,
      avgOpponentFargo: avgRaw != null ? Math.round(avgRaw) : null,
      performanceRating,
      performanceDelta:
        performanceRating != null && a.fargo != null
          ? performanceRating - a.fargo
          : null,
    };
  });

  out.sort(
    (a, b) =>
      (b.performanceRating ?? -Infinity) - (a.performanceRating ?? -Infinity) ||
      b.matchWins - a.matchWins ||
      a.name.localeCompare(b.name),
  );
  return out;
};

// ── Final standings ───────────────────────────────────────────────────────────
// Final placements derived from the bracket: the deciding final gives 1st / 2nd,
// then players are placed by the round they were eliminated in — for double elim
// that's the losers bracket (LB final loser = 3rd, then 4th, 5-6th …); for single
// elim the winners bracket below the final (semifinal losers = 3-4th …). Players
// knocked out in the same round tie at a place range.
export interface StandingEntry {
  key: string;
  place: number; // numeric best place in the (possibly tied) range — for sorting
  placeLabel: string; // "1st", "2nd", "5-6th"
  name: string;
  fargo: number | null;
}

const ordinalSuffix = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};
const placeRangeLabel = (lo: number, hi: number): string =>
  lo === hi ? `${lo}${ordinalSuffix(lo)}` : `${lo}-${hi}${ordinalSuffix(hi)}`;

interface SidePlayer {
  name: string | null;
  regId: number | null;
  fargo: number | null;
}
const loserOf = (m: LiveMatch): SidePlayer => {
  const loserIsP1 = m.winner === 2;
  return {
    name: loserIsP1 ? m.p1Name : m.p2Name,
    regId: loserIsP1 ? m.p1RegId : m.p2RegId,
    fargo: loserIsP1 ? m.p1Fargo : m.p2Fargo,
  };
};

export const computeStandings = (matches: LiveMatch[]): StandingEntry[] => {
  const real = matches.filter((m) => !m.empty);
  const decided = (m: LiveMatch) =>
    m.status === "completed" && (m.winner === 1 || m.winner === 2);
  const hasLosers = real.some((m) => m.side === "losers");
  const hasGrand = real.some((m) => m.side === "grand");

  const entries: StandingEntry[] = [];
  const used = new Set<string>();
  const keyOf = (regId: number | null, name: string | null) =>
    regId != null ? `r${regId}` : `n${name ?? "?"}`;
  const add = (p: SidePlayer, place: number, placeLabel: string) => {
    if (!p.name) return;
    const key = keyOf(p.regId, p.name);
    if (used.has(key)) return;
    used.add(key);
    entries.push({ key, place, placeLabel, name: p.name, fargo: p.fargo });
  };

  // 1) Champion + runner-up from the deciding final.
  let finalMatch: LiveMatch | undefined;
  if (hasGrand) {
    finalMatch = real
      .filter((m) => m.side === "grand" && decided(m))
      .sort((a, b) => b.round - a.round)[0];
  } else {
    const winners = real.filter((m) => m.side === "winners");
    const maxR = winners.reduce((a, m) => Math.max(a, m.round), 0);
    finalMatch = winners.find((m) => m.round === maxR && decided(m));
  }
  if (finalMatch) {
    const champP1 = finalMatch.winner === 1;
    add(
      {
        name: champP1 ? finalMatch.p1Name : finalMatch.p2Name,
        regId: champP1 ? finalMatch.p1RegId : finalMatch.p2RegId,
        fargo: champP1 ? finalMatch.p1Fargo : finalMatch.p2Fargo,
      },
      1,
      "1st",
    );
    add(loserOf(finalMatch), 2, "2nd");
  }

  // 2) Everyone else places by the round they were knocked out in. The place
  // BLOCK for each round is fixed by the bracket structure (counting positions
  // from the final down), so a player shows their place the moment they lose —
  // independent of which other rounds have finished — and it matches the bracket
  // headers (LB final = 3rd, then 4th, 5-6th …).
  const elimSide = hasLosers ? "losers" : "winners";
  const roundCount = new Map<number, number>();
  let maxElimRound = 0;
  for (const m of matches) {
    if (m.side !== elimSide || m.empty) continue;
    roundCount.set(m.round, (roundCount.get(m.round) ?? 0) + 1);
    maxElimRound = Math.max(maxElimRound, m.round);
  }
  // Double elim: the LB final (top round) is 3rd. Single elim: the top winners
  // round is the final (1st/2nd), so blocks start one round below it.
  const topBlockRound = hasLosers ? maxElimRound : maxElimRound - 1;
  const block = new Map<number, { lo: number; label: string }>();
  let place = 3;
  for (let r = topBlockRound; r >= 1; r--) {
    const count = roundCount.get(r) ?? 0;
    if (count <= 0) continue;
    block.set(r, { lo: place, label: placeRangeLabel(place, place + count - 1) });
    place += count;
  }

  const eliminated = real
    .filter((m) => m.side === elimSide && decided(m) && !m.bye)
    .map((m) => ({ ...loserOf(m), round: m.round }))
    .filter((l) => l.name);
  // Best round (deepest run) first, then Fargo, so higher places fill in first.
  eliminated.sort((a, b) => b.round - a.round || (b.fargo ?? -1) - (a.fargo ?? -1));
  for (const l of eliminated) {
    const b = block.get(l.round);
    if (b) add(l, b.lo, b.label);
  }

  entries.sort(
    (a, b) =>
      a.place - b.place ||
      (b.fargo ?? -1) - (a.fargo ?? -1) ||
      a.name.localeCompare(b.name),
  );
  return entries;
};

// One row of a single player's match history within this tournament.
export interface PlayerMatchRow {
  id: string;
  roundLabel: string; // e.g. "Winners Side Match 3", "Finals"
  opponentName: string | null;
  myScore: number;
  oppScore: number;
  won: boolean;
  live: boolean; // currently in progress
  result: LiveMatch["result"]; // forfeit / withdraw / normal
}

// The selected player's played + in-progress matches, in bracket (≈ chronological)
// order. Scheduled-but-not-started matches are left out — this is history.
export const playerMatchHistory = (
  matches: LiveMatch[],
  playerKey: string,
): PlayerMatchRow[] => {
  const keyOf = (regId: number | null, name: string | null) =>
    regId != null ? `r${regId}` : `n${name ?? "?"}`;
  const rows: PlayerMatchRow[] = [];
  for (const m of matches) {
    if (m.bye || m.empty || m.status === "scheduled") continue;
    const isP1 = keyOf(m.p1RegId, m.p1Name) === playerKey;
    const isP2 = keyOf(m.p2RegId, m.p2Name) === playerKey;
    if (!isP1 && !isP2) continue;
    rows.push({
      id: m.id,
      roundLabel: m.label,
      opponentName: isP1 ? m.p2Name : m.p1Name,
      myScore: (isP1 ? m.p1Score : m.p2Score) ?? 0,
      oppScore: (isP1 ? m.p2Score : m.p1Score) ?? 0,
      won: m.winner === (isP1 ? 1 : 2),
      live: m.status === "in_progress",
      result: m.result,
    });
  }
  return rows;
};

// "58.3%" / "N/A" for a 0–1 win fraction.
export const winFractionLabel = (p: number | null): string =>
  p == null ? "N/A" : `${(p * 100).toFixed(1)}%`;

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
