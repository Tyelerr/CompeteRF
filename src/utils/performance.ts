// src/utils/performance.ts
// SINGLE SOURCE OF TRUTH for tournament Performance Rating.
//
// Every tournament format (chip, single elim, double elim, future formats) maps its
// COMPLETED results into PerfGame[] and calls computePerformance(). This is the ONLY
// place the rating model lives — no format re-implements it.
//
// MODEL — expected-vs-actual with a Fargo prior (Beta-Binomial credibility):
//   Performance Rating answers "how did this player do vs what their Fargo predicted?"
//   For each rack/game the Fargo relationship (100 pts = 2:1 odds) gives an expected
//   win probability:
//       expectedWinProbability = 1 / (1 + 2^((opponentFargo − playerFargo) / 100))
//   We accumulate expected wins (Σ p) and actual wins (A) across the ACTUAL opponents
//   played (per opponent — never from one averaged opponent Fargo), then shrink toward
//   the Fargo-expected rate with a pseudo-count prior of W games:
//       pDisp = (A + W·pExpBar) / (n + W)        pExpBar = expectedWins / n
//       vsFargo = 100·log2(pDisp/(1−pDisp)) − 100·log2(pExpBar/(1−pExpBar))
//       displayedRating = playerFargo + vsFargo
//   Properties: performing exactly as expected → vsFargo ≈ 0 for ANY sample size and
//   ANY mix of opponents; over-expectation → positive; under → negative; a single
//   result barely moves the estimate; more racks make the tournament sample dominate.
//   The prior keeps pDisp strictly inside (0,1), so NO 1%/99% clamp is needed.
//
// Rack-aware: bracket formats pass real rack scores (gamesWon/gamesLost per match);
// chip passes 1/0 or 0/1 per match until rack scores are stored.

// Fargo prior / pseudo-count, in games/racks: the player's current Fargo is treated
// as W games of prior evidence AT their expected rate. 10 → one match barely moves
// the number, a full rack-level match carries real weight, and a 50–100 rack sample
// dominates. Tunable; this is the only knob.
export const PERF_PRIOR_WEIGHT = 10;

// 100 Fargo points = 2:1 game odds. Expected game win probability for the player.
export const expectedWinProbability = (
  playerFargo: number,
  opponentFargo: number,
): number => 1 / (1 + Math.pow(2, (opponentFargo - playerFargo) / 100));

// One completed result vs a single opponent. For rack-level formats gamesWon/gamesLost
// are the rack scores; for match-level (chip) they are 1/0 or 0/1. Opponent Fargo is
// per-opponent so mixed schedules are handled correctly. Rows whose opponentFargo is
// null are ignored by the RATING (kept only for the match count / record elsewhere).
export interface PerfGame {
  opponentFargo: number | null;
  gamesWon: number;
  gamesLost: number;
}

export interface PerfResult {
  rating: number | null; // displayed, Fargo-anchored Performance Rating
  delta: number | null; // rating − playerFargo (the "vs Fargo" value)
  avgOpponentFargo: number | null; // games-weighted opponent Fargo (display only)
  winPct: number; // actual games won / games played (rated games)
  matches: number; // completed match count (rows with a rated opponent)
  sampleGames: number; // total rated games/racks
  expectedWins: number; // Σ expected wins (for debugging / future display)
  actualWins: number; // Σ actual games won (rated)
}

const log2 = (x: number): number => Math.log(x) / Math.log(2);

export const computePerformance = (
  games: PerfGame[],
  playerFargo: number | null,
  priorWeight: number = PERF_PRIOR_WEIGHT,
): PerfResult => {
  let actualWins = 0;
  let totalGames = 0;
  let expectedWins = 0;
  let oppFargoWeightedSum = 0;
  let matches = 0;

  for (const g of games) {
    if (g.opponentFargo == null) continue; // unrated: can't form an expectation
    const n = g.gamesWon + g.gamesLost;
    if (n <= 0) continue;
    matches += 1;
    totalGames += n;
    actualWins += g.gamesWon;
    oppFargoWeightedSum += g.opponentFargo * n;
    // Expected wins need the player's Fargo; without it we can't anchor a rating.
    if (playerFargo != null) {
      expectedWins += expectedWinProbability(playerFargo, g.opponentFargo) * n;
    }
  }

  const winPct = totalGames > 0 ? actualWins / totalGames : 0;
  const avgOpponentFargo =
    totalGames > 0 ? Math.round(oppFargoWeightedSum / totalGames) : null;

  // Need at least one rated game AND the player's Fargo to place a rating.
  let rating: number | null = null;
  let delta: number | null = null;
  if (totalGames > 0 && playerFargo != null) {
    const pExpBar = expectedWins / totalGames; // ∈ (0,1) for real Fargo inputs
    const pDisp = (actualWins + priorWeight * pExpBar) / (totalGames + priorWeight);
    // Both terms are strictly inside (0,1): pExpBar from finite Fargo gaps, pDisp
    // because the prior adds pExpBar mass — so no 1%/99% clamp is required.
    delta = Math.round(
      100 * log2(pDisp / (1 - pDisp)) - 100 * log2(pExpBar / (1 - pExpBar)),
    );
    rating = playerFargo + delta;
  }

  return {
    rating,
    delta,
    avgOpponentFargo,
    winPct,
    matches,
    sampleGames: totalGames,
    expectedWins: Math.round(expectedWins * 100) / 100,
    actualWins,
  };
};

// Shared streak helper: results newest-first → current run of the same outcome.
export type PerfStreakType = "win" | "loss" | "none";
export const computeStreak = (
  resultsNewestFirst: boolean[],
): { type: PerfStreakType; count: number } => {
  if (resultsNewestFirst.length === 0) return { type: "none", count: 0 };
  const type: PerfStreakType = resultsNewestFirst[0] ? "win" : "loss";
  let count = 0;
  for (const won of resultsNewestFirst) {
    if ((won ? "win" : "loss") === type) count += 1;
    else break;
  }
  return { type, count };
};
