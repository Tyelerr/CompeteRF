// src/viewmodels/useTournamentSpectator.ts
// Read-only viewmodel for the public "View Tournament" spectator screen. Loads the
// tournament (with its live bracket/match state), tables and registrations, and
// derives the screen-ready match list + a trimmed player list (no TD-only fields
// like payment/contact). Polls while live so spectators see scores update.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../models/services/registration.service";
import { tournamentService } from "../models/services/tournament.service";
import { tournamentTableService } from "../models/services/tournament-table.service";
import {
  TournamentEvent,
  tournamentEventService,
} from "../models/services/tournament-event.service";
import { RegistrationStatus } from "../models/types/common.types";
import {
  AutoAssignMode,
  PrizePoolConfig,
  RaceGroup,
} from "../models/types/tournament-settings.types";
import { groupForFargo, RaceConfig } from "../utils/bracket.utils";
import {
  buildLiveMatches,
  computeEliminatedRegIds,
  LiveMatch,
} from "../utils/match.utils";
import {
  computeBreakdown,
  entryPoolTotal,
  feesPerPlayer,
  sidePotTotal,
} from "../utils/prize-pool";
import { safePaidSidePots } from "../utils/side-pots";
import {
  buildQueueEntries,
  computeReadyAtMap,
  orderQueue,
  QueueEntry,
} from "../utils/queue.utils";
import {
  computeTournamentStats,
  TournamentStats,
} from "../utils/tournament.stats";

// Module-level indirection so the react-compiler lint doesn't flag a bare
// Date.now() as an impure call during a hook's render (see queue wait ordering).
const nowMs = (): number => Date.now();

// Spectator-facing KPI snapshot — derived from the SAME authoritative sources the
// admin dashboard uses (live match list + queue machinery), never a second path.
export interface SpectatorKpis {
  playersRemaining: number; // still-in players (loss/no-show derivation)
  activeMatches: number; // matches in progress
  activeTables: number; // distinct tables currently hosting a non-finished match
  waiting: number; // queue-ready matches awaiting a table (Up Next length)
  matchesPlayed: number; // completed real matches
}

export interface SpectatorPlayer {
  id: number; // registration id
  name: string;
  fargo: number | null;
  group: string | null; // race-group label (groups mode only)
  seed: number | null;
  status: RegistrationStatus;
  record: ("W" | "L")[]; // completed matches in order (byes excluded)
  eliminated: boolean; // out of the tournament
}

const playerName = (r: {
  guest_name?: string | null;
  profiles?: { name?: string; user_name?: string };
}): string =>
  r.profiles?.name ||
  (r.profiles?.user_name ? `@${r.profiles.user_name}` : "") ||
  r.guest_name ||
  "Player";

export const useTournamentSpectator = (tournamentId?: number) => {
  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
    refetchInterval: tournamentId ? 5000 : false, // live score sync
    refetchOnWindowFocus: true,
  });

  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
  });

  const registrationsQuery = useQuery({
    queryKey: ["registrations", tournamentId],
    queryFn: () => registrationService.getRegistrations(tournamentId!),
    enabled: !!tournamentId,
  });

  const tournament = tournamentQuery.data ?? null;

  const raceConfig: RaceConfig = useMemo(() => {
    const ls = tournament?.live_settings ?? {};
    return {
      mode: ls.raceMode ?? "fixed",
      fixedWinners: ls.fixedRaceWinners ?? 5,
      groups: ls.raceGroups ?? [],
      diffMin: ls.fargoDiffMinRace ?? 3,
      diffPerGame: ls.fargoDiffPerGame ?? 40,
      diffMax: ls.fargoDiffMaxRace ?? null,
    };
  }, [tournament]);

  const groups: RaceGroup[] = raceConfig.groups;

  const matches = useMemo(
    () =>
      buildLiveMatches(
        tournament?.live_settings?.bracket ?? null,
        tournament?.live_settings?.matchState ?? {},
        tablesQuery.data ?? [],
        tournament?.game_type ?? "",
        raceConfig,
      ),
    [tournament, tablesQuery.data, raceConfig],
  );

  // Per-player W/L record from the bracket (keyed by registration id). Byes are
  // excluded — they advance a player without a played result.
  const recordByReg = useMemo(() => {
    const map = new Map<number, ("W" | "L")[]>();
    for (const m of matches) {
      if (m.bye || m.empty || m.status !== "completed" || m.winner == null) continue;
      if (m.p1RegId != null) {
        const arr = map.get(m.p1RegId) ?? [];
        arr.push(m.winner === 1 ? "W" : "L");
        map.set(m.p1RegId, arr);
      }
      if (m.p2RegId != null) {
        const arr = map.get(m.p2RegId) ?? [];
        arr.push(m.winner === 2 ? "W" : "L");
        map.set(m.p2RegId, arr);
      }
    }
    return map;
  }, [matches]);

  // Authoritative, bracket-routing elimination set (the SAME helper the admin
  // dashboard uses): a player is out when they lose a completed match with no
  // onward path — correct for single elim, double elim (2nd/decisive loss) and
  // grand finals, without assuming a fixed loss count. no_show is layered on top.
  const eliminatedRegIds = useMemo(
    () => new Set(computeEliminatedRegIds(matches)),
    [matches],
  );

  // Trimmed player list (no payment / contact details). Cancelled registrations
  // are dropped; base-sorted by seed then name (the screen applies the chosen sort).
  const players: SpectatorPlayer[] = useMemo(() => {
    const rows = registrationsQuery.data ?? [];
    return rows
      .filter((r) => r.status !== "cancelled")
      .map((r) => {
        const fargo = r.fargo_rating ?? null;
        const record = recordByReg.get(r.id) ?? [];
        const eliminated = r.status === "no_show" || eliminatedRegIds.has(r.id);
        return {
          id: r.id,
          name: playerName(r),
          fargo,
          group:
            raceConfig.mode === "groups"
              ? (groupForFargo(fargo, groups)?.label ?? null)
              : null,
          seed: r.seed ?? null,
          status: r.status,
          record,
          eliminated,
        };
      })
      .sort((a, b) => {
        if (a.seed != null && b.seed != null) return a.seed - b.seed;
        if (a.seed != null) return -1;
        if (b.seed != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [registrationsQuery.data, raceConfig.mode, groups, recordByReg, eliminatedRegIds]);

  // ── Live operational derivations (shared web + native) ──────────────────────
  // All reuse the exact authoritative helpers the admin/TD side uses, so a
  // spectator sees the same numbers/ordering the director sees — no spectator-only
  // logic path.

  // Tournament-wide stats (progress, timing, highlights, W/L leaders).
  const stats: TournamentStats = useMemo(
    () => computeTournamentStats(matches),
    [matches],
  );

  // Assignment mode + manual order come straight from live_settings (the same
  // fields the TD's Queue Manager writes). Up Next is the ordered queue.
  const autoAssignMode: AutoAssignMode =
    tournament?.live_settings?.autoAssignMode ?? "balanced";
  // Wrapped so the fresh [] fallback doesn't churn the upNext memo every render.
  const queueOrder: string[] = useMemo(
    () => tournament?.live_settings?.queueOrder ?? [],
    [tournament],
  );

  const upNext: QueueEntry[] = useMemo(() => {
    const bracket = tournament?.live_settings?.bracket ?? null;
    const matchState = tournament?.live_settings?.matchState ?? {};
    const readyAtMap = computeReadyAtMap(bracket, matchState);
    const entries = buildQueueEntries(matches, readyAtMap, nowMs());
    return orderQueue(entries, autoAssignMode, queueOrder);
  }, [tournament, matches, autoAssignMode, queueOrder]);

  // Currently Playing / Active Tables: every match sitting on a table that hasn't
  // finished (live first, then waiting-to-start), ordered by table.
  const activeMatches: LiveMatch[] = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            m.tableId != null &&
            m.status !== "completed" &&
            !m.bye &&
            !m.empty,
        )
        .sort((a, b) => {
          const ap = a.status === "in_progress" ? 0 : 1;
          const bp = b.status === "in_progress" ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return (a.tableId ?? 0) - (b.tableId ?? 0);
        }),
    [matches],
  );

  // Registration ids currently at the table in a live match (drives the "Playing"
  // tag on the Players list + Overview leaders).
  const playingRegIds: Set<number> = useMemo(() => {
    const s = new Set<number>();
    for (const m of matches) {
      if (m.status !== "in_progress" || m.bye || m.empty) continue;
      if (m.p1RegId != null) s.add(m.p1RegId);
      if (m.p2RegId != null) s.add(m.p2RegId);
    }
    return s;
  }, [matches]);

  const kpis: SpectatorKpis = useMemo(() => {
    const tablesInUse = new Set(
      matches
        .filter(
          (m) =>
            m.tableId != null &&
            m.status !== "completed" &&
            !m.bye &&
            !m.empty,
        )
        .map((m) => m.tableId as number),
    );
    return {
      playersRemaining: players.filter((p) => !p.eliminated).length,
      activeMatches: matches.filter(
        (m) => m.status === "in_progress" && !m.bye && !m.empty,
      ).length,
      activeTables: tablesInUse.size,
      waiting: upNext.length,
      matchesPlayed: stats.matchesCompleted,
    };
  }, [matches, players, upNext, stats]);

  // ── Payouts (authoritative — replicates the admin PrizePoolView inputs) ──────
  // The saved prize-pool config + derived pools, computed with the SAME shared
  // helpers (entryPoolTotal / sidePotTotal / feesPerPlayer) the admin uses, so the
  // spectator Payouts page matches the TD's exactly. No spectator-only math.
  const prizeConfig: PrizePoolConfig | null =
    tournament?.live_settings?.prizePool ?? null;

  const payouts = useMemo(() => {
    const t: any = tournament;
    const regs = registrationsQuery.data ?? [];
    const entryFee = Number(t?.entry_fee) || 0;
    const addedMoney = Number(t?.added_money) || 0;
    // Effective field: the drawn bracket size once drawn (admin's locked path),
    // else the checked-in count.
    const readyCount = regs.filter((r) => r.status === "checked_in").length;
    const prizePlayers = t?.live_settings?.bracket?.players ?? readyCount;
    const feeAmounts = ((t?.live_settings?.fees ?? []) as any[])
      .filter((f) => f.enabled ?? true)
      .map((f) => ({ amount: Number(f.amount) || 0 }));
    const feePerPlayer = feesPerPlayer(feeAmounts);
    const feesAddedOnTop = !!t?.live_settings?.feesAddedOnTop;
    const cfg: PrizePoolConfig | null = t?.live_settings?.prizePool ?? null;
    const includeAddedMoney = cfg?.includeAddedMoney ?? true;
    const entryPool = entryPoolTotal(
      prizePlayers,
      entryFee,
      feePerPlayer,
      feesAddedOnTop,
      includeAddedMoney,
      addedMoney,
    );

    // Side pots: pool = (paid entrants) × buy-in; entrants keyed r<regId> for the
    // standings→winner mapping. Counts come from each registration's paid_side_pots
    // (active set, not just checked-in) — identical to the admin.
    const activeRegs = regs.filter(
      (r) => r.status !== "cancelled" && r.status !== "no_show",
    );
    const pots = ((t?.side_pots ?? []) as { name: string; amount: number }[]).filter(
      (p) => (p?.name ?? "").trim(),
    );
    const sidePotPools: Record<string, number> = {};
    const sidePotEntrants: Record<string, string[]> = {};
    const sidePotsSummary: { name: string; entrants: number; pool: number }[] = [];
    for (const p of pots) {
      const name = p.name.trim();
      const entrants = activeRegs.filter((r) =>
        safePaidSidePots(r.paid_side_pots).includes(name),
      );
      const pool = sidePotTotal(entrants.length, Number(p.amount) || 0);
      sidePotPools[name] = pool;
      sidePotEntrants[name] = entrants.map((r) => `r${r.id}`);
      sidePotsSummary.push({ name, entrants: entrants.length, pool });
    }

    // Spectator payout summary (right sticky card). Total prize pool = net entry
    // contribution + included added money (== entryPool from the shared util); the
    // Entry Pool line shows the entry contribution WITHOUT added money.
    const addedIncluded = includeAddedMoney ? addedMoney : 0;
    const topPrize = cfg
      ? computeBreakdown(entryPool, cfg.entryPlaces).places.reduce(
          (mx, pl) => Math.max(mx, pl.amount),
          0,
        )
      : null;
    const summary = {
      players: prizePlayers,
      entryPool: Math.max(0, entryPool - addedIncluded),
      addedMoney: addedIncluded,
      totalPrizePool: entryPool,
      paidPlaces: cfg?.entryPlaces.length ?? 0,
      topPrize,
      sidePots: sidePotsSummary,
    };

    return { entryPool, sidePotPools, sidePotEntrants, summary };
  }, [tournament, registrationsQuery.data]);

  // Durable activity feed (public read). Polls while the page is open so
  // spectators see new events without a second event store or manual refresh.
  const eventsQuery = useQuery({
    queryKey: ["tournament-events", tournamentId],
    queryFn: () => tournamentEventService.list(tournamentId!, 50),
    enabled: !!tournamentId,
    refetchInterval: tournamentId ? 20000 : false,
    refetchOnWindowFocus: true,
  });
  const events: TournamentEvent[] = eventsQuery.data ?? [];

  return {
    tournament,
    matches,
    tables: tablesQuery.data ?? [],
    players,
    raceConfig,
    groups,
    // Live operational data
    stats,
    kpis,
    upNext,
    autoAssignMode,
    activeMatches,
    playingRegIds,
    events,
    // Payouts
    prizeConfig,
    entryPool: payouts.entryPool,
    sidePotPools: payouts.sidePotPools,
    sidePotEntrants: payouts.sidePotEntrants,
    payoutSummary: payouts.summary,
    isLoading:
      tournamentQuery.isLoading ||
      registrationsQuery.isLoading ||
      tablesQuery.isLoading,
    refetch: () =>
      Promise.all([
        tournamentQuery.refetch(),
        tablesQuery.refetch(),
        registrationsQuery.refetch(),
        eventsQuery.refetch(),
      ]),
  };
};
