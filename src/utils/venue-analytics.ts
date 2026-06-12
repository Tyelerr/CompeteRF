// src/utils/venue-analytics.ts
// Pure aggregation for bar-owner analytics: roll per-run stats up to the venue,
// group runs into tournament series (recurring template or one-off), and rank
// series for the "Top …" lists. No React, no Supabase.

import {
  EMPTY_FEE_BUCKETS,
  EMPTY_VENUE_BUSINESS_STATS,
  FeeBuckets,
  TournamentRunStats,
  TournamentSeriesStats,
  VenueBusinessStats,
} from "../models/types/venue-analytics.types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const addFees = (a: FeeBuckets, b: FeeBuckets): FeeBuckets => ({
  td: a.td + b.td,
  green: a.green + b.green,
  admin: a.admin + b.admin,
  custom: a.custom + b.custom,
});
const roundFees = (f: FeeBuckets): FeeBuckets => ({
  td: round2(f.td),
  green: round2(f.green),
  admin: round2(f.admin),
  custom: round2(f.custom),
});

// A run "counts" as a held event only when it had players (i.e. it was actually
// run on Compete's engine). Money for a 0-player run is 0 anyway, but this also
// keeps event counts and added-money honest.
const heldRuns = (runs: TournamentRunStats[]): TournamentRunStats[] =>
  runs.filter((r) => r.players > 0);

export const rollupVenue = (
  runs: TournamentRunStats[],
): VenueBusinessStats => {
  const held = heldRuns(runs);
  if (held.length === 0) return EMPTY_VENUE_BUSINESS_STATS;

  let totalPlayers = 0;
  let largestEvent = 0;
  let entryCollected = 0;
  let sidePotsCollected = 0;
  let addedMoney = 0;
  let fees: FeeBuckets = { ...EMPTY_FEE_BUCKETS };
  let totalFees = 0;
  let netPrizePool = 0;
  let prizePaidOut = 0;

  for (const r of held) {
    totalPlayers += r.players;
    largestEvent = Math.max(largestEvent, r.players);
    entryCollected += r.entryCollected;
    sidePotsCollected += r.sidePotsCollected;
    addedMoney += r.addedMoney;
    fees = addFees(fees, r.feesByCategory);
    totalFees += r.totalFees;
    netPrizePool += r.netPrizePool;
    prizePaidOut += r.prizePaidOut;
  }

  return {
    totalPlayers,
    totalEvents: held.length,
    avgAttendance: round2(totalPlayers / held.length),
    largestEvent,
    entryCollected: round2(entryCollected),
    sidePotsCollected: round2(sidePotsCollected),
    addedMoney: round2(addedMoney),
    feesByCategory: roundFees(fees),
    totalFees: round2(totalFees),
    netPrizePool: round2(netPrizePool),
    prizePaidOut: round2(prizePaidOut),
  };
};

// Group runs into series: all runs of one recurring template collapse into a
// single series; one-off tournaments are their own series.
export const groupIntoSeries = (
  runs: TournamentRunStats[],
): TournamentSeriesStats[] => {
  const groups = new Map<string, TournamentRunStats[]>();
  for (const r of heldRuns(runs)) {
    const key = r.templateId != null ? `tpl-${r.templateId}` : `one-${r.tournamentId}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const series: TournamentSeriesStats[] = [];
  for (const [seriesId, list] of groups) {
    const events = list.length;
    let totalPlayers = 0;
    let largestAttendance = 0;
    let lowestAttendance = Infinity;
    let entryCollected = 0;
    let sidePotsCollected = 0;
    let addedMoney = 0;
    let fees: FeeBuckets = { ...EMPTY_FEE_BUCKETS };
    let totalFees = 0;
    let netPrizePool = 0;
    let prizePaidOut = 0;
    let largestPrizePool = 0;

    for (const r of list) {
      totalPlayers += r.players;
      largestAttendance = Math.max(largestAttendance, r.players);
      lowestAttendance = Math.min(lowestAttendance, r.players);
      entryCollected += r.entryCollected;
      sidePotsCollected += r.sidePotsCollected;
      addedMoney += r.addedMoney;
      fees = addFees(fees, r.feesByCategory);
      totalFees += r.totalFees;
      netPrizePool += r.netPrizePool;
      prizePaidOut += r.prizePaidOut;
      largestPrizePool = Math.max(largestPrizePool, r.netPrizePool);
    }

    // Series name = the most recent run's name.
    const newest = [...list].sort((a, b) =>
      (b.tournamentDate || "").localeCompare(a.tournamentDate || ""),
    )[0];

    series.push({
      seriesId,
      templateId: list[0].templateId,
      name: newest?.name ?? "Tournament",
      lastDate: newest?.tournamentDate ?? "",
      tournamentIds: list.map((r) => r.tournamentId),
      events,
      totalPlayers,
      avgAttendance: round2(totalPlayers / events),
      largestAttendance,
      lowestAttendance: lowestAttendance === Infinity ? 0 : lowestAttendance,
      entryCollected: round2(entryCollected),
      sidePotsCollected: round2(sidePotsCollected),
      addedMoney: round2(addedMoney),
      feesByCategory: roundFees(fees),
      totalFees: round2(totalFees),
      netPrizePool: round2(netPrizePool),
      prizePaidOut: round2(prizePaidOut),
      avgPrizePool: round2(netPrizePool / events),
      largestPrizePool: round2(largestPrizePool),
    });
  }

  return series;
};

export const topSeriesBy = (
  series: TournamentSeriesStats[],
  selector: (s: TournamentSeriesStats) => number,
  limit: number,
): TournamentSeriesStats[] =>
  [...series]
    .filter((s) => selector(s) > 0)
    .sort((a, b) => selector(b) - selector(a))
    .slice(0, limit);
