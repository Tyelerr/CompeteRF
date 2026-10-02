// src/utils/player-score.ts
// The patch a PLAYER sends when tapping +/- on their own live match (Profile → Match Center).
//
// Contract (supabase/migrations/20260929120000_check_in_timer.sql, submit_match_state): a
// participant may patch ONLY p1Score / p2Score (and winner / result); the match lifecycle —
// status / startedAt / completedAt — is manager-only and the server rejects any participant patch
// that carries those keys (42501). So the player path sends the two scores and nothing else:
// reaching the race does not complete the match from the player's phone; the TD finalizes it.
// Pure: no React, no Supabase.

export interface PlayerScoreMatch {
  p1Score?: number | null;
  p2Score?: number | null;
  p1Race?: number | null;
  p2Race?: number | null;
  raceTo?: number | null;
}

export interface PlayerScorePatch {
  p1Score: number;
  p2Score: number;
}

// Scores after a +/- tap, clamped to [0, race]. null = nothing to send (already at the cap/floor).
export const buildPlayerScorePatch = (
  m: PlayerScoreMatch,
  slot: 1 | 2,
  delta: number,
): PlayerScorePatch | null => {
  const r1 = m.p1Race ?? m.raceTo ?? null;
  const r2 = m.p2Race ?? m.raceTo ?? null;
  const cap = (n: number, race: number | null) => Math.max(0, Math.min(n, race ?? 999));
  const p1 = m.p1Score ?? 0;
  const p2 = m.p2Score ?? 0;
  const newP1 = slot === 1 ? cap(p1 + delta, r1) : p1;
  const newP2 = slot === 2 ? cap(p2 + delta, r2) : p2;
  if (newP1 === p1 && newP2 === p2) return null;
  return { p1Score: newP1, p2Score: newP2 };
};
