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
import { dashboard, enteredField, teamName } from "../../models/services/chip.engine";
import {
  ChipEntry,
  ChipFormat,
  ChipState,
} from "../../models/types/chip.types";
import { Tournament } from "../../models/types/tournament.types";
import {
  computeBreakdown,
  entryPoolTotal,
  feesPerPlayer,
  sidePotTotal,
  sidePotPayoutViews,
} from "../../utils/prize-pool";
import { parseSidePots } from "../../utils/side-pots";
import {
  PublicActivity,
  toPublicActivityFeed,
} from "../../utils/chip-activity";
import { computePerformance, PerfGame } from "../../utils/performance";

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
  startChips: number; // starting-stack snapshot → live chip-health color
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
  aStartChips: number | null; // starting-stack snapshot → live chip-health color
  bName: string | null;
  bChips: number | null;
  bStartChips: number | null;
  aId: string | null;
  bId: string | null;
  startedAt: string | null; // set when live → screen renders the elapsed timer
  waitingText: string | null; // e.g. "Waiting for a challenger"
  // The a-side is the table holder/defender (holder+pending, or a live match's aId).
  // aStreak is that entry's authoritative consecutive-win count (ChipEntry.streak);
  // > 0 means a genuine defending holder (opening-match players are 0 → no badge).
  aStreak: number | null;
}
export interface SpecQueueRow {
  id: string;
  position: number;
  name: string;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  fargo: number | null;
  wins: number;
  losses: number;
  // Round turn-status during a Shuffle round (null when not in a shuffle round):
  // "waiting" = not yet seated for its turn this round; "played" = already had its turn.
  roundStatus: "waiting" | "played" | null;
}
export interface SpecStandingRow {
  id: string;
  rank: number;
  name: string;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  fargo: number | null; // tournament Fargo (entry snapshot) — for the Fargo sort
  wins: number;
  losses: number;
  eliminated: boolean; // show "Eliminated" instead of a chip count
  isMe: boolean;
}
// One source of truth for a public activity row (id/text/at/kind + public
// actor/reason/notes). Aliased so the spectator feed always matches the mapper.
export type SpecActivity = PublicActivity;
export interface SpecPlayerRow {
  id: string;
  name: string;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  fargo: number | null;
  wins: number;
  losses: number;
  status: SpecPlayerStatus;
  isMe: boolean; // the viewing user's own entry (team-level for doubles)
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
  opponentFargo: number | null; // the opponent's TOURNAMENT Fargo (entry snapshot), not live/global
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
export interface SpecSidePot {
  name: string;
  amount: number; // buy-in per entrant (from the TD's side-pot config)
  pool: number; // $ collected so far (entrants × buy-in)
  entrants: number; // how many teams/players entered — aggregate, never individuals
  places: SpecPayoutRow[] | null; // split rows when a split is configured AND pool > 0
}
export interface SpecPayouts {
  entryFee: number;
  addedMoney: number;
  pool: number;
  paidPlayers: number;
  finalized: boolean;
  places: SpecPayoutRow[] | null; // null → not finalized (show TD-announce fallback)
  sidePots: SpecSidePot[]; // configured side pots with a real pool + split (may be empty)
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
  activity: SpecActivity[]; // full public feed (newest first)
  activityPreview: SpecActivity[]; // first 5 for the Overview section
  players: SpecPlayerRow[];
  payouts: SpecPayouts;
  finalPlacements: SpecPlacement[] | null;
  profileFor: (entryId: string) => SpecPlayerProfile | null;
}

const isAlive = (e: ChipEntry) => e.status !== "eliminated";

const perfLabelFor = (delta: number): ChipPerfLabel =>
  delta > 50 ? "exceptional"
    : delta > 15 ? "above"
      : delta >= -15 ? "expected"
        : delta >= -50 ? "below"
          : "under";

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
      opponentFargo: (oppId ? s.entries.find((y) => y.id === oppId) : null)?.teamFargo ?? null,
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

  // Performance Rating (expected-vs-actual, Fargo-anchored) via the shared helper
  // (utils/performance.ts). Chip has no rack scores → one finished match = one game.
  const specGamesRows: PerfGame[] = finishedMatches.map((m) => {
    const oppId = m.aId === e.id ? m.bId : m.aId;
    const opp = s.entries.find((x) => x.id === oppId);
    const won = m.winnerId === e.id;
    return {
      opponentFargo: opp?.teamFargo ?? null,
      gamesWon: won ? 1 : 0,
      gamesLost: won ? 0 : 1,
    };
  });
  const specPerf = computePerformance(specGamesRows, e.teamFargo ?? null);
  const avgOpponentFargo = specPerf.avgOpponentFargo;
  const rating = specPerf.rating;
  const delta = specPerf.delta;
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
  viewerProfileId?: number | null,
): ChipSpectatorView => {
  const d = dashboard(s);
  // "(You)" — the viewing user's OWN entry (team-level for doubles: either partner's
  // profile id matches → the one team row is theirs). null for spectators/admins who
  // aren't entered. Matches the player hub's own p1/p2ProfileId test.
  const isMine = (e: ChipEntry) =>
    viewerProfileId != null &&
    (e.p1ProfileId === viewerProfileId || e.p2ProfileId === viewerProfileId);
  const format = s.settings.format;
  const finished = !!s.finishedAt || !!s.winnerId;
  const started =
    !!s.startedAt || s.matches.length > 0 || s.tables.some((t) => !!t.matchId);
  const status: ChipSpectatorView["status"] = finished
    ? "completed"
    : started
      ? "live"
      : "upcoming";
  // Field participants only (checkedIn) — a roster entry that never entered the field is
  // excluded from every standings/leaderboard/players surface, consistent with the engine.
  const alive = s.entries.filter((e) => isAlive(e) && enteredField(e));
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
        startChips: leaderEntry.startChips,
        fargo: leaderEntry.teamFargo,
        wins: leaderEntry.wins,
        losses: leaderEntry.losses,
      }
    : null;

  // Active tables (non-inactive), in board order.
  const activeTables = s.tables
    .filter((t) => !t.inactive)
    .sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));
  // Board is between rounds (draining or ready for the redraw): an empty active table
  // is intentionally empty awaiting the next redraw → "Waiting for Shuffle" (derived
  // from authoritative chip state; no new state).
  const shuffleTransitioning = !!s.reshufflePending || !!s.shuffleReady;
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
        aStartChips: a?.startChips ?? null,
        bName: b ? teamName(b) : "—",
        bChips: b?.chips ?? null,
        bStartChips: b?.startChips ?? null,
        aId: a?.id ?? null,
        bId: b?.id ?? null,
        startedAt: m.startedAt,
        waitingText: null,
        aStreak: a?.streak ?? null,
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
        aStartChips: holder.startChips,
        bName: teamName(pending),
        bChips: pending.chips,
        bStartChips: pending.startChips,
        aId: holder.id,
        bId: pending.id,
        startedAt: null,
        waitingText: "Waiting to Start",
        aStreak: holder.streak ?? null,
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
        aStartChips: holder.startChips,
        bName: null,
        bChips: null,
        bStartChips: null,
        aId: holder.id,
        bId: null,
        startedAt: null,
        waitingText: "Waiting for a challenger",
        aStreak: holder.streak ?? null,
      };
    }
    return {
      id: t.id,
      label: t.label,
      live: false,
      isStream: !!t.isStream,
      aName: null,
      aChips: null,
      aStartChips: null,
      bName: null,
      bChips: null,
      bStartChips: null,
      aId: null,
      bId: null,
      startedAt: null,
      waitingText: shuffleTransitioning ? "Waiting for Shuffle" : "Open",
      aStreak: null,
    };
  });

  // Queue (front = next up). Round turn-status is TEAM-level. Authoritative 3-state
  // derivation (no new state): "waiting" = still in roundRemaining (not yet seated);
  // seated/live (holder/pending of an active table OR an in-progress match participant)
  // = null (at-table, NOT played — these aren't in the queue anyway, but the derivation
  // must never call a seated/live entry "played"); "played" = otherwise (had its turn
  // and returned). NOT derived from !roundRemaining alone.
  const roundRemainingSet = new Set(s.roundRemaining ?? []);
  const onTableIds = new Set<string>();
  for (const t of s.tables) {
    if (t.inactive) continue;
    if (t.holderId) onTableIds.add(t.holderId);
    if (t.pendingChallengerId) onTableIds.add(t.pendingChallengerId);
  }
  for (const mm of s.matches) {
    if (mm.status === "in_progress") { onTableIds.add(mm.aId); onTableIds.add(mm.bId); }
  }
  const roundStatusFor = (id: string): "waiting" | "played" | null => {
    if (!s.shuffleRound) return null;
    if (roundRemainingSet.has(id)) return "waiting";
    if (onTableIds.has(id)) return null; // seated / live — at table, not yet completed
    return "played";
  };
  const fullQueue: SpecQueueRow[] = s.queue
    .map((id, i) => {
      const e = entryById(id);
      if (!e) return null;
      return {
        id: e.id,
        position: i + 1,
        name: teamName(e),
        chips: e.chips,
        startChips: e.startChips,
        fargo: e.teamFargo,
        wins: e.wins,
        losses: e.losses,
        roundStatus: roundStatusFor(e.id),
      };
    })
    .filter((r): r is SpecQueueRow => !!r);
  const queuePreview = fullQueue.slice(0, 5);

  // Standings by chips.
  // Standings = alive ranked by chips, then eliminated below (most-recently-out first,
  // i.e. higher placement). Eliminated rows render "Eliminated" instead of a chip count.
  const eliminatedRanked = s.entries
    .filter((e) => !isAlive(e) && enteredField(e))
    .sort((a, b) => new Date(b.eliminatedAt ?? 0).getTime() - new Date(a.eliminatedAt ?? 0).getTime());
  const fullStandings: SpecStandingRow[] = [...byChips, ...eliminatedRanked].map((e, i) => ({
    id: e.id,
    rank: i + 1,
    name: teamName(e),
    chips: e.chips,
    startChips: e.startChips,
    fargo: e.teamFargo,
    wins: e.wins,
    losses: e.losses,
    eliminated: !isAlive(e),
    isMe: isMine(e),
  }));
  const standingsPreview = fullStandings.slice(0, 5);

  // Activity feed — one centralized event→public mapper (utils/chip-activity),
  // newest first, TD-only noise + reverted events dropped, wording humanized. The
  // FULL feed backs the "View Full Log" modal + its count; the preview shows 5.
  const activity: SpecActivity[] = toPublicActivityFeed(s.events, Number.POSITIVE_INFINITY);
  const activityPreview = activity.slice(0, 5);

  // Players list — sorted by current chip standings (most chips first), with
  // eliminated teams always pinned to the bottom regardless of chips. Status is
  // shown as a badge but never drives the order.
  const players: SpecPlayerRow[] = [...s.entries]
    .filter(enteredField)
    .map((e) => ({
      id: e.id,
      name: teamName(e),
      chips: e.chips,
      startChips: e.startChips,
      fargo: e.teamFargo,
      wins: e.wins,
      losses: e.losses,
      status: statusFor(s, e, finished),
      isMe: isMine(e),
    }))
    .sort((a, b) => {
      const aOut = a.status === "eliminated" ? 1 : 0;
      const bOut = b.status === "eliminated" ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return b.chips - a.chips || a.name.localeCompare(b.name);
    });

  // Payouts — reuse the same money math as the TD Prize Pool setup. Basis = actual FIELD
  // entrants (enteredField), the same set the setup/Review pool uses — NOT a raw paid
  // count, which would inflate the pool with paid-but-not-Ready entries that never entered.
  const paidPlayers = s.entries.filter(enteredField).length;
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
  // Side pots — surface EVERY configured pot (parseSidePots = the authoritative TD
  // config), not only pots that already have a split + non-empty pool. Spectators
  // should see a pot exists and its buy-in even before anyone has entered. Only
  // aggregate entrant COUNT and pool are exposed — never individual payment status.
  const parsedPots = parseSidePots(tournament.side_pots);
  const sidePotEntrantsByName: Record<string, number> = {};
  const sidePotPoolByName: Record<string, number> = {};
  for (const sp of parsedPots) {
    const entrants = s.entries.filter((e) => (e.paidSidePots ?? []).includes(sp.name)).length;
    sidePotEntrantsByName[sp.name] = entrants;
    sidePotPoolByName[sp.name] = sidePotTotal(entrants, sp.amount);
  }
  // Split rows come from the shared payout model — only when a split is configured
  // AND the pool > 0. Pots without that still render (pool/buy-in) with no split.
  const splitByName = new Map(
    sidePotPayoutViews(cfg, sidePotPoolByName).map((v) => [v.name, v]),
  );
  const sidePots: SpecSidePot[] = parsedPots.map((sp) => {
    const view = splitByName.get(sp.name);
    return {
      name: sp.name,
      amount: sp.amount,
      pool: sidePotPoolByName[sp.name] ?? 0,
      entrants: sidePotEntrantsByName[sp.name] ?? 0,
      places: view
        ? view.places.map((p) => ({ place: p.place, amount: p.amount, percent: p.percent }))
        : null,
    };
  });
  const payouts: SpecPayouts = {
    entryFee,
    addedMoney,
    pool,
    paidPlayers,
    finalized: hasSplit && pool > 0,
    places: hasSplit && pool > 0 ? payoutRows : null,
    sidePots,
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
    activityPreview,
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

export const useChipSpectator = (tournamentId?: number, viewerProfileId?: number | null) => {
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
        ? buildSpectatorView(query.data.tournament, query.data.chip, viewerProfileId)
        : null,
    [query.data, viewerProfileId],
  );

  return {
    view,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};
