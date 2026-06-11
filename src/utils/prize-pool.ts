// src/utils/prize-pool.ts
// Pure money math for the Prize Pool setup (Manage Tournament hub) and the
// later read-only payouts view. No React, no Supabase — just numbers in/out so
// the same logic can drive setup, the summary, and Phase 3 payouts.
//
// Model: dollar pools are derived live (player count × entry/side-pot amounts),
// so only the PAYOUT SPLIT is stored (PrizePoolConfig). Each place pays
// percent-of-pool unless the TD sets an amount override (then it's "custom").

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
  pool: number; // total dollars in this pool
  places: PlaceBreakdown[];
  percentTotal: number; // sum of place percents
  payoutTotal: number; // sum of place dollar amounts
  remaining: number; // pool - payoutTotal (negative => over-allocated)
  percentValid: boolean; // percents total ~100
  amountValid: boolean; // payout does not exceed the pool
}

const EPS = 0.01;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : n);

// ── Default payout splits ─────────────────────────────────────────────────────
// Common decreasing distributions; each totals 100. Editable by the TD. Side
// pots usually pay fewer places, so they get their own (steeper) table.
const ENTRY_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 25, 18, 12],
  5: [40, 24, 16, 12, 8],
  6: [36, 22, 15, 11, 9, 7],
  7: [33, 21, 14, 10, 8, 8, 6],
  8: [30, 20, 13, 10, 8, 7, 6, 6],
};
const SIDE_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [70, 30],
  3: [60, 25, 15],
  4: [50, 25, 15, 10],
};

// Evenly distribute 100 across n places (remainder to the top place) so any
// place count produces a valid (sum-100) default even beyond the tables above.
const evenSplit = (n: number): number[] => {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const arr = Array(n).fill(base);
  arr[0] += 100 - base * n;
  return arr;
};

export const defaultEntrySplit = (places: number): number[] =>
  ENTRY_SPLITS[places] ?? evenSplit(places);

export const defaultSidePotSplit = (places: number): number[] =>
  SIDE_SPLITS[places] ?? evenSplit(places);

export const placesFromPercents = (percents: number[]): PrizePlace[] =>
  percents.map((p) => ({ percent: clampPct(p), amountOverride: null }));

// ── Pool helpers ──────────────────────────────────────────────────────────────
export const entryPoolTotal = (
  players: number,
  entryFee: number,
  includeAddedMoney: boolean,
  addedMoney: number,
): number =>
  round2(
    Math.max(0, players) * Math.max(0, entryFee) +
      (includeAddedMoney ? Math.max(0, addedMoney) : 0),
  );

export const sidePotTotal = (players: number, amountPerPlayer: number): number =>
  round2(Math.max(0, players) * Math.max(0, amountPerPlayer));

// ── Breakdown ─────────────────────────────────────────────────────────────────
// Resolve a list of places against a pool: percent → dollars unless overridden.
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
// A fresh config: pay a sensible number of places for the field, one entry per
// side pot. Used when the TD opens Prize Pool for the first time.
export const defaultPrizePoolConfig = (
  sidePotNames: string[],
): PrizePoolConfig => ({
  entryPlaces: placesFromPercents(defaultEntrySplit(3)),
  sidePots: sidePotNames.map((name) => ({
    name,
    places: placesFromPercents(defaultSidePotSplit(2)),
  })),
  includeAddedMoney: true,
});

// Reconcile a stored config against the tournament's CURRENT side pots: keep
// payouts for pots that still exist, add defaults for new ones, drop removed.
export const reconcileSidePots = (
  config: PrizePoolConfig,
  sidePotNames: string[],
): SidePotPayout[] =>
  sidePotNames.map((name) => {
    const existing = config.sidePots.find((sp) => sp.name === name);
    return (
      existing ?? { name, places: placesFromPercents(defaultSidePotSplit(2)) }
    );
  });

// True when the whole prize setup is valid (entry + every side pot total 100%
// and no pool is over-allocated). Drives the Draw Bracket warning + nav glyph.
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
