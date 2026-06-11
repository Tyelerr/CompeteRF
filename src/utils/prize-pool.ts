// src/utils/prize-pool.ts
// Pure money math for the Prize Pool setup (Manage Tournament hub) and the
// later read-only payouts view. No React, no Supabase — numbers in/out.
//
// Model: dollar pools are derived live (player count × entry/side-pot amounts),
// so only the PAYOUT SPLIT is stored (PrizePoolConfig). Percentages ALWAYS total
// 100 — the steppers redistribute on every nudge and presets are normalized to
// 100 — so there is no "percent error" state. A place pays percent-of-pool
// unless the TD sets a dollar override via Custom Edit (then it reads "custom"),
// and overrides are clamped so the payout can never exceed the pool.

import {
  PrizePlace,
  PrizePoolConfig,
  SidePotPayout,
} from "../models/types/tournament-settings.types";

export interface PlaceBreakdown {
  place: number; // 1-based
  percent: number; // share of the pool
  amount: number; // dollars paid to this place
  custom: boolean; // true when a manual override is in effect
}

export interface PoolBreakdown {
  pool: number;
  places: PlaceBreakdown[];
  percentTotal: number;
  payoutTotal: number;
  remaining: number; // pool - payoutTotal
  percentValid: boolean; // percents total ~100
  amountValid: boolean; // payout does not exceed the pool
}

// Stepper granularity and the floor for any single paid place.
export const PCT_STEP = 5;
export const PCT_MIN = 1;
export const MAX_PLACES = 12;

const EPS = 0.01;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : n);
const sum = (a: number[]): number => a.reduce((s, n) => s + n, 0);

// ── Preset payout splits ──────────────────────────────────────────────────────
export type PresetKey = "balanced" | "topHeavy" | "winnerHeavy" | "custom";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "balanced", label: "Balanced" },
  { key: "topHeavy", label: "Top Heavy" },
  { key: "winnerHeavy", label: "Winner Heavy" },
  { key: "custom", label: "Custom" },
];

// Normalize arbitrary weights into integer percents that sum to EXACTLY 100
// (largest-remainder method), so every preset is valid by construction.
const normalizeTo100 = (weights: number[]): number[] => {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const total = sum(weights);
  if (total <= 0) return evenSplit(n);
  const raw = weights.map((w) => (w / total) * 100);
  const floor = raw.map(Math.floor);
  let rem = 100 - sum(floor);
  const order = raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem && k < order.length; k++) floor[order[k].i] += 1;
  // Any leftover (rem > n) wraps around.
  rem -= Math.min(rem, order.length);
  let j = 0;
  while (rem > 0) {
    floor[order[j % order.length].i] += 1;
    rem -= 1;
    j += 1;
  }
  return floor;
};

// Even split with the remainder going to the top place(s).
const evenSplit = (n: number): number[] => {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const arr = Array(n).fill(base);
  let rem = 100 - base * n;
  for (let i = 0; rem > 0; i++, rem--) arr[i] += 1;
  return arr;
};

// Preset generators (all total 100 for any place count).
export const presetSplit = (key: PresetKey, places: number): number[] => {
  const n = Math.max(1, places);
  if (n === 1) return [100];
  switch (key) {
    case "balanced":
      return evenSplit(n);
    case "winnerHeavy":
      // Steep: weight (n-k)^2 → winner takes a large share.
      return normalizeTo100(Array.from({ length: n }, (_, k) => (n - k) ** 2));
    case "topHeavy":
    case "custom":
    default:
      // Gentle decline: weight (n-k) → e.g. 4 places → 40/30/20/10.
      return normalizeTo100(Array.from({ length: n }, (_, k) => n - k));
  }
};

export const placesFromPercents = (percents: number[]): PrizePlace[] =>
  percents.map((p) => ({ percent: clampPct(Math.round(p)), amountOverride: null }));

// Which named preset (if any) the current percents match; else "custom". Any
// dollar override also reads as custom.
export const activePreset = (places: PrizePlace[]): PresetKey => {
  if (places.some((p) => p.amountOverride != null)) return "custom";
  const current = places.map((p) => Math.round(p.percent));
  for (const key of ["balanced", "topHeavy", "winnerHeavy"] as PresetKey[]) {
    const split = presetSplit(key, places.length);
    if (split.length === current.length && split.every((v, i) => v === current[i]))
      return key;
  }
  return "custom";
};

// ── Stepper redistribution (always keeps the total at 100) ────────────────────
// Increasing place i pulls PCT_STEP from the other places (round-robin, evenly,
// never below PCT_MIN). Decreasing distributes PCT_STEP back to the others.
export const adjustPercents = (
  percents: number[],
  i: number,
  delta: number,
): number[] => {
  const n = percents.length;
  if (n <= 1) return percents;
  const arr = percents.map((p) => Math.round(p));
  const others = arr.map((_, j) => j).filter((j) => j !== i);

  if (delta > 0) {
    // Capacity the others can give up (down to PCT_MIN).
    const capacity = others.reduce((s, j) => s + Math.max(0, arr[j] - PCT_MIN), 0);
    if (capacity < PCT_STEP || arr[i] + PCT_STEP > 100) return percents;
    arr[i] += PCT_STEP;
    let toRemove = PCT_STEP;
    let guard = 10000;
    while (toRemove > 0 && guard-- > 0) {
      let movedThisPass = 0;
      for (const j of others) {
        if (toRemove <= 0) break;
        if (arr[j] > PCT_MIN) {
          arr[j] -= 1;
          toRemove -= 1;
          movedThisPass += 1;
        }
      }
      if (movedThisPass === 0) break;
    }
    return arr;
  }

  // Decrease: i must stay at/above PCT_MIN.
  if (arr[i] - PCT_STEP < PCT_MIN) return percents;
  arr[i] -= PCT_STEP;
  let toAdd = PCT_STEP;
  let guard = 10000;
  while (toAdd > 0 && guard-- > 0) {
    let movedThisPass = 0;
    for (const j of others) {
      if (toAdd <= 0) break;
      if (arr[j] < 100) {
        arr[j] += 1;
        toAdd -= 1;
        movedThisPass += 1;
      }
    }
    if (movedThisPass === 0) break;
  }
  return arr;
};

export const canIncrease = (percents: number[], i: number): boolean => {
  if (percents.length <= 1) return false;
  const cap = percents.reduce(
    (s, p, j) => (j === i ? s : s + Math.max(0, Math.round(p) - PCT_MIN)),
    0,
  );
  return cap >= PCT_STEP && Math.round(percents[i]) + PCT_STEP <= 100;
};

export const canDecrease = (percents: number[], i: number): boolean =>
  percents.length > 1 && Math.round(percents[i]) - PCT_STEP >= PCT_MIN;

// Set place i to an exact percent (typed by the TD) and rebalance the OTHER
// places so the total stays exactly 100 — distributed proportionally to their
// current shares, every place kept at or above PCT_MIN. Integer result.
export const setPercent = (
  percents: number[],
  i: number,
  value: number,
): number[] => {
  const n = percents.length;
  if (n === 0) return percents;
  if (n === 1) return [100];
  const maxForI = 100 - (n - 1) * PCT_MIN; // leave PCT_MIN for each other place
  const vi = Math.max(PCT_MIN, Math.min(maxForI, Math.round(value)));
  const others = percents
    .map((p, j) => ({ j, v: Math.round(p) }))
    .filter((o) => o.j !== i);
  const remainder = 100 - vi;
  const otherSum = others.reduce((s, o) => s + o.v, 0);
  const extra = remainder - others.length * PCT_MIN; // >= 0 since vi <= maxForI
  const raw = others.map((o) => {
    const share = otherSum > 0 ? o.v / otherSum : 1 / others.length;
    return PCT_MIN + share * extra;
  });
  const floors = raw.map(Math.floor);
  let rem = remainder - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((v, idx) => ({ idx, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--)
    floors[order[k % order.length].idx] += 1;
  const result = percents.map((p) => Math.round(p));
  result[i] = vi;
  others.forEach((o, idx) => {
    result[o.j] = floors[idx];
  });
  return result;
};

// ── Fee helpers ───────────────────────────────────────────────────────────────
// Built-in fees are per-player slices of the entry fee, the same for everyone.
export const feesPerPlayer = (fees: { amount: number }[]): number =>
  round2(fees.reduce((s, f) => s + Math.max(0, f.amount || 0), 0));

export const feesTotal = (fees: { amount: number }[], players: number): number =>
  round2(feesPerPlayer(fees) * Math.max(0, players));

// True when the fees don't carve out more than the entry fee per player.
export const feesValid = (entryFee: number, fees: { amount: number }[]): boolean =>
  feesPerPlayer(fees) <= Math.max(0, entryFee) + EPS;

// ── Pool helpers ──────────────────────────────────────────────────────────────
// Net entry payout pool: the entry fee MINUS the built-in per-player fees, times
// players, plus added money when included. Payouts are split over this.
export const entryPoolTotal = (
  players: number,
  entryFee: number,
  feePerPlayer: number,
  includeAddedMoney: boolean,
  addedMoney: number,
): number => {
  const perPlayerToPool = Math.max(0, Math.max(0, entryFee) - Math.max(0, feePerPlayer));
  return round2(
    Math.max(0, players) * perPlayerToPool +
      (includeAddedMoney ? Math.max(0, addedMoney) : 0),
  );
};

export const sidePotTotal = (players: number, amountPerPlayer: number): number =>
  round2(Math.max(0, players) * Math.max(0, amountPerPlayer));

// ── Breakdown ─────────────────────────────────────────────────────────────────
export const computeBreakdown = (
  pool: number,
  places: PrizePlace[],
): PoolBreakdown => {
  const rows: PlaceBreakdown[] = places.map((pl, i) => {
    const custom = pl.amountOverride != null;
    const amount = custom
      ? round2(Math.max(0, pl.amountOverride as number))
      : round2((clampPct(pl.percent) / 100) * pool);
    return { place: i + 1, percent: clampPct(pl.percent), amount, custom };
  });
  const percentTotal = round2(rows.reduce((s, r) => s + r.percent, 0));
  const payoutTotal = round2(rows.reduce((s, r) => s + r.amount, 0));
  return {
    pool: round2(pool),
    places: rows,
    percentTotal,
    payoutTotal,
    remaining: round2(pool - payoutTotal),
    percentValid: Math.abs(percentTotal - 100) < EPS,
    amountValid: payoutTotal <= pool + EPS,
  };
};

// ── Config defaults / validation ──────────────────────────────────────────────
export const defaultPrizePoolConfig = (
  sidePotNames: string[],
): PrizePoolConfig => ({
  entryPlaces: placesFromPercents(presetSplit("topHeavy", 3)),
  sidePots: sidePotNames.map((name) => ({
    name,
    places: placesFromPercents(presetSplit("topHeavy", 2)),
  })),
  includeAddedMoney: true,
});

// Keep payouts for pots that still exist, default new ones, drop removed.
export const reconcileSidePots = (
  config: PrizePoolConfig,
  sidePotNames: string[],
): SidePotPayout[] =>
  sidePotNames.map((name) => {
    const existing = config.sidePots.find((sp) => sp.name === name);
    return (
      existing ?? {
        name,
        places: placesFromPercents(presetSplit("topHeavy", 2)),
      }
    );
  });

// Valid when every pool's percents total 100 and no pool is over-allocated.
export const isPrizePoolComplete = (
  config: PrizePoolConfig | null | undefined,
  entryPool: number,
  sidePotPools: Record<string, number>,
): boolean => {
  if (!config) return false;
  const entry = computeBreakdown(entryPool, config.entryPlaces);
  if (!entry.percentValid || !entry.amountValid) return false;
  for (const sp of config.sidePots) {
    const b = computeBreakdown(sidePotPools[sp.name] ?? 0, sp.places);
    if (!b.percentValid || !b.amountValid) return false;
  }
  return true;
};

export { round2 as roundMoney, clampPct };
