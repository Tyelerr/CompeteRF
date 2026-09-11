// src/utils/chip-wait.ts
// Rough estimated wait for a WAITING chip player (and reusable for a TD's pre-start flow
// preview). PRESENTATION ONLY — a heuristic display; it never affects the engine, queue,
// winner-stays, or any authoritative state.
//
// Model: a player ~`queuePosition` back is roughly that many matches from the front; tables
// clear ~`activeTables` matches in parallel, each taking ~`avgMatchMs`. So the wait is about
// ceil(queuePosition / activeTables) match-lengths. Returns null when it can't be estimated
// (no queue position, no tables running yet, or no average match time to base it on).

export const estimateChipWaitMs = (opts: {
  queuePosition: number | null; // 1-based spot in the queue (front = 1)
  activeTables: number; // tables currently running
  avgMatchMs: number | null; // average finished-match duration
}): number | null => {
  const { queuePosition, activeTables, avgMatchMs } = opts;
  if (!queuePosition || queuePosition < 1) return null;
  if (!avgMatchMs || avgMatchMs <= 0) return null;
  const tables = Math.max(1, activeTables);
  const rounds = Math.ceil(queuePosition / tables);
  return rounds * avgMatchMs;
};

// "~12 min" / "~1h 5m" / null (hidden) — a deliberately approximate label.
export const formatWaitLabel = (ms: number | null): string | null => {
  if (ms == null || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "~1 min";
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
};
