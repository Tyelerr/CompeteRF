// src/viewmodels/hooks/use.chip.spectator.ts
// Read-only SPECTATOR data for a live Chip Tournament (winner-stays chip queue).
// Backs the dedicated Chip Tournament Live View (players/spectators) — NOT the TD
// manage screen. Loads the publicly-readable chip state via chipService.load and
// derives everything the spectator screen needs: summary, chip leader, live
// tables, queue, standings, an activity feed, the full players list, per-player
// profiles, and payouts. Kept fresh by polling (no realtime channel exists yet),
// so no manual refresh is required. For scotch doubles everything is team-level.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chipService } from "../../models/services/chip.service";
import { dashboard, teamName } from "../../models/services/chip.engine";
import {
  ChipEntry,
  ChipEventType,
  ChipFormat,
  ChipState,
} from "../../models/types/chip.types";
import { Tournament } from "../../models/types/tournament.types";
import {
  computeBreakdown,
  entryPoolTotal,
  feesPerPlayer,
} from "../../utils/prize-pool";

export type SpecPlayerStatus =
  | "playing"
  | "next"
  | "waiting"
  | "eliminated"
  | "completed";
export type ChipPerfLabel =
  | "exceptional"
  | "above"
  | "expected"
  | "below"
  | "under";

export interface SpecSummary {
  playersRemaining: number;
  activeTables: number;
  waiting: number;
  completedMatches: number;
}
export interface SpecLeader {
  id: string;
  name: string;
  chips: number;
  fargo: number | null;
  wins: number;
  losses: number;
}
export interface SpecTable {
  id: string;
  label: string;
  live: boolean;
  isStream: boolean;
  aName: string | null;
  aChips: number | null;
  bName: string | null;
  bChips: number | null;
  aId: string | null;
  bId: string | null;
  startedAt: string | null; // set when live → screen renders the elapsed timer
  waitingText: string | null; // e.g. "Waiting for a challenger"
}
export interface SpecQueueRow {
  id: string;
  position: number;
  name: string;
  chips: number;
  fargo: number | null;
  wins: number;
  losses: number;
}
export interface SpecStandingRow {
  id: string;
  rank: number;
  name: string;
  chips: number;
  wins: number;
  losses: number;
}
export interface SpecActivity {
  id: string;
  text: string;
  at: string;
  kind: ChipEventType;
}
export interface SpecPlayerRow {
  id: string;
  name: string;
  chips: number;
  fargo: number | null;
  wins: number;
  losses: number;
  status: SpecPlayerStatus;
}
export interface SpecPerf {
  label: ChipPerfLabel;
  rating: number | null; // Tournament Performance Rating (Fargo scale)
  delta: number | null; // rating − own Fargo (+ = overperforming)
  avgOpponentFargo: number | null;
}
export interface SpecHistoryRow {
  id: string;
  opponentName: string;
  won: boolean;
  tableLabel: string | null;
  durationMs: number | null;
  endedAt: string | null;
}
export interface SpecPlayerProfile {
  id: string;
  name: string;
  isTeam: boolean;
  p1Name: string;
  p2Name: string | null;
  fargo: number | null;
  chips: number;
  startChips: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winPct: number;
  status: SpecPlayerStatus;
  streak: number; // consecutive wins (win streak only)
  perf: SpecPerf | null;
  history: SpecHistoryRow[];
}
export interface SpecPayoutRow {
  place: number;
  amount: number;
  percent: number;
}
export interface SpecPayouts {
  entryFee: number;
  addedMoney: number;
  pool: number;
  paidPlayers: number;
  finalized: boolean;
  places: SpecPayoutRow[] | null; // null → not finalized (show TD-announce fallback)
}
export interface SpecPlacement {
  place: number;
  id: string;
  name: string;
}

export interface ChipSpectatorView {
  tournamentId: number;
  tournamentName: string;
  venueName: string | null;
  venueCity: string | null;
  format: ChipFormat;
  isTeam: boolean;
  finished: boolean;
  status: "live" | "completed" | "upcoming";
  championName: string | null;
  summary: SpecSummary;
  chipLeader: SpecLeader | null;
  tables: SpecTable[];
  queuePreview: SpecQueueRow[];
  fullQueue: SpecQueueRow[];
  standingsPreview: SpecStandingRow[];
  fullStandings: SpecStandingRow[];
  activity: SpecActivity[];
  players: SpecPlayerRow[];
  payouts: SpecPayouts;
  finalPlacements: SpecPlacement[] | null;
  profileFor: (entryId: string) => SpecPlayerProfile | null;
}

const isAlive = (e: ChipEntry) => e.status !== "eliminated";

// Activity-feed whitelist: spectator-meaningful events only. Anything the TD-only
// audit log needs (table add/remove, chip adjust, moves, undo/redo/restore,
// manual notes, player_added) is intentionally excluded.
const SPECTATOR_EVENTS = new Set<ChipEventType>([
  "match_result",
  "elimination",
  "chip_loss",
  "shuffle",
  "forfeit",
]);

const perfLabelFor = (delta: number): ChipPerfLabel =>
  delta > 50 ? "exceptional"
    : delta > 15 ? "above"
      : delta >= -15 ? "expected"
        : delta >= -50 ? "below"
          : "under";
const TPR_K = -100 / Math.log(2);

// Per-entry status for the players list / profile.
const statusFor = (
  s: ChipState,
  e: ChipEntry,
  finished: boolean,
): SpecPlayerStatus => {
  if (!isAlive(e)) return "eliminated";
  if (finished) return "completed";
  if (e.status === "playing" || e.tableId) return "playing";
  return s.queue.indexOf(e.id) === 0 ? "next" : "waiting";
};

const buildProfile = (
  s: ChipState,
  e: ChipEntry,
  finished: boolean,
): SpecPlayerProfile => {
  const nameOf = (id: string | null | undefined): string => {
    const x = id ? s.entries.find((y) => y.id === id) : null;
    return x ? teamName(x) : "—";
  };
  const tableLabelOf = (tid: string | null | undefined): string | null => {
    const t = tid ? s.tables.find((x) => x.id === tid) : null;
    return t ? t.label : null;
  };

  const finishedMatches = s.matches
    .filter(
      (m) =>
        m.status !== "in_progress" &&
        m.endedAt &&
        (m.aId === e.id || m.bId === e.id),
    )
    .sort(
      (a, b) =>
        new Date(b.endedAt as string).getTime() -
        new Date(a.endedAt as string).getTime(),
    );

  const history: SpecHistoryRow[] = finishedMatches.map((m) => {
    const oppId = m.aId === e.id ? m.bId : m.aId;
    const dur =
      m.endedAt && m.startedAt
        ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()
        : null;
    return {
      id: m.id,
      opponentName: nameOf(oppId),
      won: m.winnerId === e.id,
      tableLabel: tableLabelOf(m.tableId),
      durationMs: dur != null && dur > 0 ? dur : null,
      endedAt: m.endedAt ?? null,
    };
  });

  // Current WIN streak only — consecutive wins from the most recent match; 0 if
  // the last result was a loss or the team is out. Celebrate momentum, not slumps.
  let streak = 0;
  for (const r of history) {
    if (r.won) streak++;
    else break;
  }

  const matchesPlayed = e.wins + e.losses;
  const winPct = matchesPlayed ? e.wins / matchesPlayed : 0;

  // Tournament Performance Rating (same formula as the profile hub / stats util).
  let tprWins = 0;
  let tprGames = 0;
  let tprOppSum = 0;
  let tprWeighted = 0;
  for (const m of finishedMatches) {
    const oppId = m.aId === e.id ? m.bId : m.aId;
    const opp = s.entries.find((x) => x.id === oppId);
    tprGames += 1;
    if (m.winnerId === e.id) tprWins += 1;
    const of = opp?.teamFargo ?? null;
    if (of != null) {
      tprOppSum += of;
      tprWeighted += 1;
    }
  }
  const avgOpponentFargo =
    tprWeighted > 0 ? Math.round(tprOppSum / tprWeighted) : null;
  let rating: number | null = null;
  if (tprGames > 0 && tprWeighted > 0) {
    const cap = Math.min(0.99, Math.max(0.01, tprWins / tprGames));
    rating = Math.round(
      tprOppSum / tprWeighted + TPR_K * Math.log((1 - cap) / cap),
    );
  }
  const ownFargo = e.teamFargo ?? null;
  const delta = rating != null && ownFargo != null ? rating - ownFargo : null;
  const perf: SpecPerf | null =
    rating != null && delta != null
      ? { label: perfLabelFor(delta), rating, delta, avgOpponentFargo }
      : null;

  return {
    id: e.id,
    name: teamName(e),
    isTeam: !!e.p2Name || s.settings.format === "scotch_doubles",
    p1Name: e.p1Name,
    p2Name: e.p2Name ?? null,
    fargo: e.teamFargo,
    chips: e.chips,
    startChips: e.startChips,
    wins: e.wins,
    losses: e.losses,
    matchesPlayed,
    winPct,
    status: statusFor(s, e, finished),
    streak,
    perf,
    history,
  };
};

const buildSpectatorView = (
  tournament: Tournament,
  s: ChipState,
): ChipSpectatorView => {
  const d = dashboard(s);
  const format = s.settings.format;
  const finished = !!s.finishedAt || !!s.winnerId;
  const started =
    !!s.startedAt || s.matches.length > 0 || s.tables.some((t) => !!t.matchId);
  const status: ChipSpectatorView["status"] = finished
    ? "completed"
    : started
      ? "live"
      : "upcoming";
  const alive = s.entries.filter(isAlive);
  const byChips = [...alive].sort(
    (a, b) => b.chips - a.chips || b.wins - a.wins,
  );

  const entryById = (id: string | null | undefined) =>
    id ? s.entries.find((e) => e.id === id) ?? null : null;
  const nameOf = (id: string | null | undefined): string => {
    const e = entryById(id);
    return e ? teamName(e) : "—";
  };

  // Chip leader (top by chips, then wins) — only when someone has chips.
  const leaderEntry = byChips[0] && byChips[0].chips > 0 ? byChips[0] : null;
  const chipLeader: SpecLeader | null = leaderEntry
    ? {
        id: leaderEntry.id,
        name: teamName(leaderEntry),
        chips: leaderEntry.chips,
        fargo: leaderEntry.teamFargo,
        wins: leaderEntry.wins,
        losses: leaderEntry.losses,
      }
    : null;

  // Active tables (non-inactive), in board order.
  const activeTables = s.tables
    .filter((t) => !t.inactive)
    .sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));
  const tables: SpecTable[] = activeTables.map((t) => {
    const m = s.matches.find(
      (mm) => mm.id === t.matchId && mm.status === "in_progress",
    );
    if (m) {
      const a = entryById(m.aId);
      const b = entryById(m.bId);
      return {
        id: t.id,
        label: t.label,
        live: true,
        isStream: !!t.isStream,
        aName: a ? teamName(a) : "—",
        aChips: a?.chips ?? null,
        bName: b ? teamName(b) : "—",
        bChips: b?.chips ?? null,
        aId: a?.id ?? null,
        bId: b?.id ?? null,
        startedAt: m.startedAt,
        waitingText: null,
      };
    }
    // No live match: a winner may be holding, waiting for a challenger.
    const holder = entryById(t.holderId);
    const pending = entryById(t.pendingChallengerId);
    if (holder && pending) {
      return {
        id: t.id,
        label: t.label,
        live: false,
        isStream: !!t.isStream,
        aName: teamName(holder),
        aChips: holder.chips,
        bName: teamName(pending),
        bChips: pending.chips,
        aId: holder.id,
        bId: pending.id,
        startedAt: null,
        waitingText: "About to start",
      };
    }
    if (holder) {
      return {
        id: t.id,
        label: t.label,
        live: false,
        isStream: !!t.isStream,
        aName: teamName(holder),
        aChips: holder.chips,
        bName: null,
        bChips: null,
        aId: holder.id,
        bId: null,
        startedAt: null,
        waitingText: "Waiting for a challenger",
      };
    }
    return {
      id: t.id,
      label: t.label,
      live: false,
      isStream: !!t.isStream,
      aName: null,
      aChips: null,
      bName: null,
      bChips: null,
      aId: null,
      bId: null,
      startedAt: null,
      waitingText: "Open",
    };
  });

  // Queue (front = next up).
  const fullQueue: SpecQueueRow[] = s.queue
    .map((id, i) => {
      const e = entryById(id);
      if (!e) return null;
      return {
        id: e.id,
        position: i + 1,
        name: teamName(e),
        chips: e.chips,
        fargo: e.teamFargo,
        wins: e.wins,
        losses: e.losses,
      };
    })
    .filter((r): r is SpecQueueRow => !!r);
  const queuePreview = fullQueue.slice(0, 5);

  // Standings by chips.
  const fullStandings: SpecStandingRow[] = byChips.map((e, i) => ({
    id: e.id,
    rank: i + 1,
    name: teamName(e),
    chips: e.chips,
    wins: e.wins,
    losses: e.losses,
  }));
  const standingsPreview = fullStandings.slice(0, 5);

  // Activity feed — whitelisted events, newest first, dropping reverted ones.
  const activity: SpecActivity[] = s.events
    .filter((ev) => SPECTATOR_EVENTS.has(ev.type) && !ev.superseded && ev.text)
    .slice(0, 40)
    .map((ev) => ({ id: ev.id, text: ev.text, at: ev.at, kind: ev.type }));

  // Players list — sorted by current chip standings (most chips first), with
  // eliminated teams always pinned to the bottom regardless of chips. Status is
  // shown as a badge but never drives the order.
  const players: SpecPlayerRow[] = [...s.entries]
    .map((e) => ({
      id: e.id,
      name: teamName(e),
      chips: e.chips,
      fargo: e.teamFargo,
      wins: e.wins,
      losses: e.losses,
      status: statusFor(s, e, finished),
    }))
    .sort((a, b) => {
      const aOut = a.status === "eliminated" ? 1 : 0;
      const bOut = b.status === "eliminated" ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return b.chips - a.chips || a.name.localeCompare(b.name);
    });

  // Payouts — reuse the same money math as the TD Prize Pool setup.
  const paidPlayers = s.entries.filter((e) => e.paid).length;
  const entryFee = tournament.entry_fee ?? 0;
  const addedMoney = tournament.added_money ?? 0;
  const ls = tournament.live_settings;
  const fees = (ls?.fees ?? []).filter((f) => f.enabled);
  const feePer = feesPerPlayer(fees);
  const cfg = ls?.prizePool ?? null;
  const includeAdded = cfg?.includeAddedMoney ?? true;
  const pool = entryPoolTotal(
    paidPlayers,
    entryFee,
    feePer,
    !!ls?.feesAddedOnTop,
    includeAdded,
    addedMoney,
  );
  const hasSplit = !!cfg && cfg.entryPlaces.length > 0;
  const payoutRows: SpecPayoutRow[] | null = hasSplit
    ? computeBreakdown(pool, cfg!.entryPlaces).places.map((p) => ({
        place: p.place,
        amount: p.amount,
        percent: p.percent,
      }))
    : null;
  const payouts: SpecPayouts = {
    entryFee,
    addedMoney,
    pool,
    paidPlayers,
    finalized: hasSplit && pool > 0,
    places: hasSplit && pool > 0 ? payoutRows : null,
  };

  // Final placements when the tournament is over: 1st = champion, then the rest
  // by elimination order (latest eliminated placed higher).
  let finalPlacements: SpecPlacement[] | null = null;
  if (finished) {
    const champion = entryById(s.winnerId);
    const elimOrder = s.entries
      .filter((e) => e.id !== s.winnerId && e.eliminatedAt)
      .sort(
        (a, b) =>
          new Date(b.eliminatedAt as string).getTime() -
          new Date(a.eliminatedAt as string).getTime(),
      );
    const ordered = [
      ...(champion ? [champion] : []),
      ...elimOrder,
    ];
    finalPlacements = ordered.slice(0, 8).map((e, i) => ({
      place: i + 1,
      id: e.id,
      name: teamName(e),
    }));
  }

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    venueName: tournament.venues?.venue ?? null,
    venueCity: tournament.venues?.city ?? null,
    format,
    isTeam: format === "scotch_doubles",
    finished,
    status,
    championName: finished && s.winnerId ? nameOf(s.winnerId) : null,
    summary: {
      playersRemaining: d.playersRemaining,
      activeTables: d.activeTables,
      waiting: d.queueCount,
      completedMatches: d.matchesPlayed,
    },
    chipLeader,
    tables,
    queuePreview,
    fullQueue,
    standingsPreview,
    fullStandings,
    activity,
    players,
    payouts,
    finalPlacements,
    profileFor: (entryId: string) => {
      const e = entryById(entryId);
      return e ? buildProfile(s, e, finished) : null;
    },
  };
};

// Elapsed ms for a live table's match, given a ticking `now` (ms). Exposed so the
// screen can render a self-updating timer without re-fetching.
export const specMatchElapsedMs = (
  startedAt: string | null,
  nowMs: number,
): number => {
  if (!startedAt) return 0;
  return Math.max(0, nowMs - new Date(startedAt).getTime());
};

export const useChipSpectator = (tournamentId?: number) => {
  const query = useQuery({
    queryKey: ["chip-spectator", tournamentId],
    queryFn: () => chipService.load(tournamentId!),
    enabled: !!tournamentId,
    // Poll while open so queue/chips/tables/standings stay live — no realtime
    // channel exists, and the spectator makes no writes, so polling is enough.
    refetchInterval: tournamentId ? 6000 : false,
    refetchOnWindowFocus: true,
  });

  const view = useMemo<ChipSpectatorView | null>(
    () =>
      query.data
        ? buildSpectatorView(query.data.tournament, query.data.chip)
        : null,
    [query.data],
  );

  return {
    view,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};
