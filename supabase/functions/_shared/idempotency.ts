// supabase/functions/_shared/idempotency.ts
// Pure server-side helpers for validating trusted match ids and building the
// match-ready idempotency key. Every revision component is server-derived — the
// client never supplies a timestamp, revision, or table/opponent value.

// Both bracket ids ("W1M1", round-1 numbers) and chip ids (newId("m") tokens,
// NOT UUIDs) are bounded safe tokens. Reject anything else before DB lookups /
// key construction.
export function isSafeMatchId(id: string): boolean {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export function chipMatchReadyKey(p: {
  tournamentId: number;
  matchId: string;
  recipientIdAuto: number;
  startedAt: string; // chip_matches.started_at (new row per match instance)
}): string {
  return `mr:${p.tournamentId}:${p.matchId}:${p.recipientIdAuto}:${p.startedAt}`;
}

export function bracketMatchReadyKey(p: {
  tournamentId: number;
  matchId: string;
  recipientIdAuto: number;
  drawNumber: number; // live_settings.bracket.drawNumber (bumps on redraw)
  startedAt: string; // matchState[matchId].startedAt (reset clears it → new on restart)
}): string {
  return `mr:${p.tournamentId}:${p.matchId}:${p.recipientIdAuto}:${p.drawNumber}:${p.startedAt}`;
}
