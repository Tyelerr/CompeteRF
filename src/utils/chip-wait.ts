// src/utils/chip-wait.ts
// Rough estimated wait for a WAITING chip player (and reusable for a TD's pre-start flow
// preview). PRESENTATION ONLY — a heuristic display; it never affects the engine, queue,
// winner-stays, or any authoritative state.
//
// Model: a player ~`queuePosition` back is roughly that many matches from the front; tables
// clear ~`activeTables` matches in parallel, each taking ~`avgMatchMs`. So the wait is about
// ceil(queuePosition / activeTables) match-lengths. Returns null when it can't be estimated
// (no queue position, no tables running yet, or no average match time to base it on).

// A more representative "expected match duration" for the WAIT ESTIMATE only (never the raw
// Average Match stat shown to admins). Rare outliers — a 1-minute break-and-run, or one
// marathon match — should not distort a queued player's wait. Sample-size tiers:
//   • 0 completed        → null (can't estimate).
//   • 1–2 completed      → plain mean (LOW confidence; too small to smooth — we still show a
//                          rough "~" estimate rather than withholding, matching the current
//                          "show as soon as any average exists" UX).
//   • 3–9 completed      → MEDIAN (robust to a single fast/slow outlier).
//   • 10+ completed      → TRIMMED MEAN: drop ~fastest 10% and ~slowest 10%, average the rest.
// Statistical only — no hardcoded duration cutoffs; a legitimately short match still counts.
export const robustMatchDurationMs = (durationsMs: number[]): number | null => {
  const xs = durationsMs
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return null;
  const mean = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  if (n <= 2) return mean(xs); // low-confidence small sample
  if (n < 10) {
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2); // median
  }
  const k = Math.floor(n * 0.1); // ~10% off each end
  const trimmed = xs.slice(k, n - k);
  return mean(trimmed.length ? trimmed : xs); // trimmed mean (guard against over-trim)
};

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
