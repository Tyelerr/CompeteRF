// src/models/services/venue-analytics.service.ts
// Business analytics data for bar owners. Fetches the owner's tournaments + their
// registrations and computes per-run money/attendance via the shared prize-pool
// math, so the fee/pool logic stays in one place. Aggregation (series grouping,
// venue rollups, top lists) happens in the viewmodel.

import { supabase } from "../../lib/supabase";
import { entryPoolTotal } from "../../utils/prize-pool";
import {
  AnalyticsPeriod,
  DiscoveryCounts,
  EMPTY_DISCOVERY,
  FeeBuckets,
  TournamentRunStats,
} from "../types/venue-analytics.types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const safeArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);

// Period → cutoff ISO date (null = lifetime). 30d/90d are rolling; year is the
// start of the current calendar year.
export const getSinceISO = (period: AnalyticsPeriod): string | null => {
  const now = new Date();
  switch (period) {
    case "30d":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();
    case "90d":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90).toISOString();
    case "year":
      return new Date(now.getFullYear(), 0, 1).toISOString();
    case "lifetime":
    default:
      return null;
  }
};

// Compute one run's money + attendance from its row + registration counts.
const computeRun = (
  t: any,
  counts: { players: number; potCounts: Record<string, number> },
): TournamentRunStats => {
  const players = counts.players;
  const entryFee = Number(t.entry_fee) || 0;
  const addedMoney = Number(t.added_money) || 0;
  const ls = t.live_settings ?? {};
  const feesOnTop = !!ls.feesAddedOnTop;
  const includeAdded = ls.prizePool?.includeAddedMoney ?? true;

  // Per-player fees bucketed by category (enabled only; missing flag = applied).
  const cat: FeeBuckets = { td: 0, green: 0, admin: 0, custom: 0 };
  for (const f of safeArray(ls.fees)) {
    if (f?.enabled ?? true) {
      const c = f?.category as keyof FeeBuckets;
      if (c && c in cat) cat[c] += Number(f.amount) || 0;
    }
  }
  const feePerPlayer = cat.td + cat.green + cat.admin + cat.custom;

  const entryCollected = round2(players * entryFee);
  const feesByCategory: FeeBuckets = {
    td: round2(players * cat.td),
    green: round2(players * cat.green),
    admin: round2(players * cat.admin),
    custom: round2(players * cat.custom),
  };
  const totalFees = round2(players * feePerPlayer);

  let sidePotsCollected = 0;
  for (const sp of safeArray(t.side_pots)) {
    const name = (sp?.name ?? "").trim();
    sidePotsCollected += (counts.potCounts[name] ?? 0) * (Number(sp?.amount) || 0);
  }
  sidePotsCollected = round2(sidePotsCollected);

  // Net entry pool already applies the fee model + included added money.
  const netEntryPool = entryPoolTotal(
    players,
    entryFee,
    feePerPlayer,
    feesOnTop,
    includeAdded,
    addedMoney,
  );
  const netPrizePool = round2(netEntryPool + sidePotsCollected);

  return {
    tournamentId: t.id,
    templateId: t.template_id ?? null,
    name: t.name ?? "Tournament",
    tournamentDate: t.tournament_date ?? "",
    status: t.status ?? "",
    players,
    entryCollected,
    sidePotsCollected,
    addedMoney: round2(addedMoney),
    feesByCategory,
    totalFees,
    netPrizePool,
    prizePaidOut: netPrizePool,
  };
};

export const venueAnalyticsService = {
  // Resolve the venues a bar owner owns (active only).
  async getOwnerVenueIds(ownerId: number): Promise<number[]> {
    if (!ownerId) return [];
    const { data, error } = await supabase
      .from("venue_owners")
      .select("venue_id")
      .eq("owner_id", ownerId)
      .is("archived_at", null);
    if (error) throw error;
    return (data ?? []).map((v: { venue_id: number }) => v.venue_id);
  },

  // Per-run money + attendance for the owner's venues within the period. A run
  // contributes money only via its registered players, so non-engine events
  // (no registrations) come back with players = 0.
  async getVenueTournamentRuns(
    venueIds: number[],
    sinceISO: string | null,
  ): Promise<TournamentRunStats[]> {
    if (!venueIds.length) return [];

    let q = supabase
      .from("tournaments")
      .select(
        "id, name, template_id, tournament_date, status, entry_fee, added_money, side_pots, live_settings",
      )
      .in("venue_id", venueIds);
    if (sinceISO) q = q.gte("tournament_date", sinceISO);

    const { data: tournaments, error } = await q;
    if (error) throw error;
    if (!tournaments?.length) return [];

    const ids = (tournaments as any[]).map((t) => t.id);
    const { data: regs, error: rErr } = await supabase
      .from("tournament_players")
      .select("tournament_id, paid_side_pots, status")
      .in("tournament_id", ids)
      .not("status", "in", "(cancelled,no_show)");
    if (rErr) throw rErr;

    const byT = new Map<number, { players: number; potCounts: Record<string, number> }>();
    for (const r of (regs ?? []) as any[]) {
      const e = byT.get(r.tournament_id) ?? { players: 0, potCounts: {} };
      e.players += 1;
      for (const name of safeArray(r.paid_side_pots)) {
        e.potCounts[name] = (e.potCounts[name] || 0) + 1;
      }
      byT.set(r.tournament_id, e);
    }

    return (tournaments as any[]).map((t) =>
      computeRun(t, byT.get(t.id) ?? { players: 0, potCounts: {} }),
    );
  },

  // All tournament IDs for the owner's venues (no date filter) — used to scope
  // discovery events, which are windowed by their own created_at.
  async getOwnerTournamentIds(venueIds: number[]): Promise<number[]> {
    if (!venueIds.length) return [];
    const { data, error } = await supabase
      .from("tournaments")
      .select("id")
      .in("venue_id", venueIds);
    if (error) throw error;
    return (data ?? []).map((t: { id: number }) => t.id);
  },

  // Venue-scoped discovery/engagement counts from app_events, windowed by period.
  async getDiscoveryCounts(
    tournamentIds: number[],
    sinceISO: string | null,
  ): Promise<DiscoveryCounts> {
    if (!tournamentIds.length) return EMPTY_DISCOVERY;
    const count = async (eventType: string): Promise<number> => {
      let q = supabase
        .from("app_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", eventType)
        .in("entity_id", tournamentIds);
      if (sinceISO) q = q.gte("created_at", sinceISO);
      const { count: c } = await q;
      return c || 0;
    };
    const [views, directions, calls, favorites, shares, giveawayViews] =
      await Promise.all([
        count("tournament_viewed"),
        count("directions_clicked"),
        count("venue_contact_clicked"),
        count("tournament_favorited"),
        count("tournament_shared"),
        count("giveaway_viewed"),
      ]);
    return { views, directions, calls, favorites, shares, giveawayViews };
  },
};
