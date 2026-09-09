// src/viewmodels/hooks/use.player.chip.tournament.ts
// Profile "Tournament View" data for a player in a LIVE CHIP tournament (the
// winner-stays chip queue — not a bracket). Read-only: loads the chip state
// (chip_* tables are publicly readable) and derives everything the player/team
// needs — status, chips, queue position, table, performance, queue preview,
// leaderboard, recent history and live matches. For scotch doubles everything is
// team-level (one entry = the team; combined Fargo; team record).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chipService } from "../../models/services/chip.service";
import { teamName as teamNameOf } from "../../models/services/chip.engine";
import {
  ChipEntry,
  ChipFormat,
  ChipState,
} from "../../models/types/chip.types";
import { useProfileTournaments } from "./use.profile.tournaments";
import { computePerformance, PerfGame } from "../../utils/performance";

export type ChipStatus = "waiting" | "next" | "playing" | "eliminated";
export type ChipStreakType = "win" | "loss" | "none";
export type ChipPerfLabel =
  | "exceptional"
  | "above"
  | "expected"
  | "below"
  | "under";

export interface ChipQueueSlot {
  id: string;
  name: string;
  fargo: number | null;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  isMe: boolean;
  // Round turn-status during a Shuffle round (null otherwise): "waiting" = not yet
  // seated for its turn this round; "played" = already had its turn.
  roundStatus: "waiting" | "played" | null;
}
export interface ChipRecent {
  id: string;
  opponentName: string;
  won: boolean;
  tableLabel: string | null;
  durationMs: number | null;
  endedAt: string | null;
}
export interface ChipLeaderRow {
  id: string;
  rank: number;
  name: string;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  wins: number;
  losses: number;
  isMe: boolean;
}
export interface ChipLiveRow {
  id: string;
  aName: string;
  bName: string;
  tableLabel: string | null;
  isStream: boolean;
  startedAt: string;
}

// Read-only table view for the Profile hub (mirrors the spectator SpecTable). The
// a-side is the holder/defender; aStreak (>0) is the authoritative win streak. No
// admin controls — presentation only.
export interface ChipHubTable {
  id: string;
  label: string;
  live: boolean;
  isStream: boolean;
  closing: boolean; // will close after the current match
  aName: string | null;
  aChips: number | null;
  aStartChips: number | null; // starting-stack snapshot → live chip-health color
  aStreak: number | null;
  bName: string | null;
  bChips: number | null;
  bStartChips: number | null;
  startedAt: string | null; // set when live → the screen renders the elapsed timer
  waitingText: string | null; // "Waiting to Start" / "Waiting for a challenger" / "Open"
}
export interface ChipPerf {
  label: ChipPerfLabel;
  winPct: number;
  sample: number; // matches the label is based on
  rating: number | null; // Tournament Performance Rating (Fargo scale)
  delta: number | null; // rating − own Fargo (+ = overperforming)
  avgOpponentFargo: number | null;
}

export interface ChipPlayerHub {
  tournamentId: number;
  tournamentName: string;
  format: ChipFormat;
  isTeam: boolean;
  meId: string;
  myName: string;
  myFargo: number | null;
  // Headline
  status: ChipStatus;
  chips: number;
  startChips: number; // starting-stack snapshot → live chip-health color
  queuePosition: number | null; // 1-based; null when playing/eliminated
  tableLabel: string | null; // when playing
  isStreamed: boolean; // playing on a stream table
  // Performance
  wins: number;
  losses: number;
  winPct: number;
  streak: number;
  streakType: ChipStreakType;
  matchesPlayed: number;
  avgMatchMs: number | null;
  perf: ChipPerf | null; // Fargo/expectation label (enough data only)
  // Standing
  chipRank: number | null; // among still-alive entries
  playersRemaining: number;
  // Sections
  queuePreview: ChipQueueSlot[]; // first 5, for the inline preview
  fullQueue: ChipQueueSlot[]; // the whole queue (for the View Full Queue modal)
  youreNext: boolean;
  recentMatches: ChipRecent[];
  leaderboard: ChipLeaderRow[]; // top-10 preview
  fullLeaderboard: ChipLeaderRow[]; // all ranked entries (for the View Full modal + count)
  tables: ChipHubTable[]; // read-only active tables (preview 2 + View All modal)
  liveMatches: ChipLiveRow[];
}

const isAlive = (e: ChipEntry) => e.status !== "eliminated";

// Label from performance-vs-Fargo delta (Fargo points over/under own rating).
const perfLabelFor = (delta: number): ChipPerfLabel =>
  delta > 50 ? "exceptional"
    : delta > 15 ? "above"
      : delta >= -15 ? "expected"
        : delta >= -50 ? "below"
          : "under";

// Build the player/team hub from a loaded chip state, or null if the viewer
// isn't one of its entries.
const buildChipHub = (
  tournamentId: number,
  tournamentName: string,
  s: ChipState,
  playerId: number,
): ChipPlayerHub | null => {
  const format = s.settings.format;
  const me = s.entries.find(
    (e) => e.p1ProfileId === playerId || e.p2ProfileId === playerId,
  );
  if (!me) return null;

  const nameOf = (id: string | null | undefined): string => {
    const e = id ? s.entries.find((x) => x.id === id) : null;
    return e ? teamNameOf(e) : "—";
  };
  const tableLabelOf = (tid: string | null | undefined): string | null => {
    const t = tid ? s.tables.find((x) => x.id === tid) : null;
    return t ? t.label : null;
  };

  const alive = s.entries.filter(isAlive);
  const byChips = [...alive].sort(
    (a, b) => b.chips - a.chips || b.wins - a.wins,
  );

  // Status + queue position.
  const qi = s.queue.indexOf(me.id);
  const status: ChipStatus = !isAlive(me)
    ? "eliminated"
    : me.status === "playing" || me.tableId
      ? "playing"
      : qi === 0
        ? "next"
        : "waiting";
  const queuePosition = status === "waiting" || status === "next" ? qi + 1 : null;

  // The player's finished matches (most recent first) → history + streak + avg.
  const myFinished = s.matches
    .filter(
      (m) =>
        m.status !== "in_progress" &&
        m.endedAt &&
        (m.aId === me.id || m.bId === me.id),
    )
    .sort(
      (a, b) =>
        new Date(b.endedAt as string).getTime() -
        new Date(a.endedAt as string).getTime(),
    );
  const recentMatches: ChipRecent[] = myFinished.slice(0, 8).map((m) => {
    const oppId = m.aId === me.id ? m.bId : m.aId;
    const dur =
      m.endedAt && m.startedAt
        ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()
        : null;
    return {
      id: m.id,
      opponentName: nameOf(oppId),
      won: m.winnerId === me.id,
      tableLabel: tableLabelOf(m.tableId),
      durationMs: dur != null && dur > 0 ? dur : null,
      endedAt: m.endedAt ?? null,
    };
  });
  // Current streak from the most recent results (win OR loss streak).
  let streak = 0;
  let streakType: ChipStreakType = "none";
  if (recentMatches.length) {
    streakType = recentMatches[0].won ? "win" : "loss";
    for (const r of recentMatches) {
      if ((r.won ? "win" : "loss") === streakType) streak++;
      else break;
    }
  }
  const myDurations = myFinished
    .map((m) =>
      m.endedAt && m.startedAt
        ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()
        : 0,
    )
    .filter((d) => d > 0);
  const avgMatchMs = myDurations.length
    ? Math.round(myDurations.reduce((a, b) => a + b, 0) / myDurations.length)
    : null;

  const matchesPlayed = me.wins + me.losses;
  const winPct = matchesPlayed ? me.wins / matchesPlayed : 0;
  // Performance Rating (expected-vs-actual, Fargo-anchored) via the shared helper
  // (utils/performance.ts). Chip has no rack scores → one finished match = one game
  // (1/0 or 0/1) vs that opponent's team Fargo.
  const chipGamesRows: PerfGame[] = myFinished.map((m) => {
    const oppId = m.aId === me.id ? m.bId : m.aId;
    const opp = s.entries.find((x) => x.id === oppId);
    const won = m.winnerId === me.id;
    return {
      opponentFargo: opp?.teamFargo ?? null,
      gamesWon: won ? 1 : 0,
      gamesLost: won ? 0 : 1,
    };
  });
  const chipPerf = computePerformance(chipGamesRows, me.teamFargo ?? null);
  const avgOpponentFargo = chipPerf.avgOpponentFargo;
  const rating = chipPerf.rating;
  const delta = chipPerf.delta;
  const perf: ChipPerf | null =
    rating != null && delta != null
      ? { label: perfLabelFor(delta), winPct, sample: matchesPlayed, rating, delta, avgOpponentFargo }
      : null;

  // Chip ranking among the living.
  const rankIdx = byChips.findIndex((e) => e.id === me.id);
  const chipRank = rankIdx >= 0 ? rankIdx + 1 : null;

  // Queue preview (next 5), highlighting me. Round turn-status is TEAM-level. 3-state
  // derivation (no new state): "waiting" = still in roundRemaining; seated/live
  // (holder/pending of an active table OR an in-progress match participant) = null
  // (at-table, NOT played); "played" = otherwise. NOT derived from !roundRemaining alone.
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
    if (onTableIds.has(id)) return null;
    return "played";
  };
  const fullQueue: ChipQueueSlot[] = s.queue
    .map((id) => s.entries.find((e) => e.id === id))
    .filter((e): e is ChipEntry => !!e)
    .map((e) => ({
      id: e.id,
      name: teamNameOf(e),
      fargo: e.teamFargo,
      chips: e.chips,
      startChips: e.startChips,
      isMe: e.id === me.id,
      roundStatus: roundStatusFor(e.id),
    }));
  const queuePreview: ChipQueueSlot[] = fullQueue.slice(0, 5);

  // Full ranked leaderboard (all alive entries, by chips) + a top-10 preview. The
  // full list backs the "View Full Leaderboard" count + modal; the preview is shown
  // inline. Mirrors the fullQueue / queuePreview split.
  const fullLeaderboard: ChipLeaderRow[] = byChips.map((e, i) => ({
    id: e.id,
    rank: i + 1,
    name: teamNameOf(e),
    chips: e.chips,
    startChips: e.startChips,
    wins: e.wins,
    losses: e.losses,
    isMe: e.id === me.id,
  }));
  const leaderboard: ChipLeaderRow[] = fullLeaderboard.slice(0, 10);

  const liveMatches: ChipLiveRow[] = s.matches
    .filter((m) => m.status === "in_progress")
    .map((m) => {
      const t = s.tables.find((x) => x.id === m.tableId);
      return {
        id: m.id,
        aName: nameOf(m.aId),
        bName: nameOf(m.bId),
        tableLabel: t?.label ?? null,
        isStream: !!t?.isStream,
        startedAt: m.startedAt,
      };
    });

  const myTable = me.tableId ? s.tables.find((t) => t.id === me.tableId) : null;

  // Read-only active tables (mirrors the spectator's table build): a-side = holder/
  // defender, aStreak = ChipEntry.streak. Presentation only — no admin state.
  const entryOf = (id: string | null | undefined) =>
    id ? s.entries.find((e) => e.id === id) ?? null : null;
  const activeTables = s.tables
    .filter((t) => !t.inactive)
    .sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));
  // Between-rounds (draining or ready for redraw): an empty active table is awaiting
  // the next redraw → "Waiting for Shuffle" (derived; no new state).
  const shuffleTransitioning = !!s.reshufflePending || !!s.shuffleReady;
  const tables: ChipHubTable[] = activeTables.map((t) => {
    const live = s.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (live) {
      const a = entryOf(live.aId);
      const b = entryOf(live.bId);
      return {
        id: t.id, label: t.label, live: true, isStream: !!t.isStream, closing: !!t.closing,
        aName: a ? teamNameOf(a) : null, aChips: a?.chips ?? null, aStartChips: a?.startChips ?? null, aStreak: a?.streak ?? null,
        bName: b ? teamNameOf(b) : null, bChips: b?.chips ?? null, bStartChips: b?.startChips ?? null,
        startedAt: live.startedAt, waitingText: null,
      };
    }
    const holder = entryOf(t.holderId);
    const pending = entryOf(t.pendingChallengerId);
    if (holder && pending) {
      return {
        id: t.id, label: t.label, live: false, isStream: !!t.isStream, closing: !!t.closing,
        aName: teamNameOf(holder), aChips: holder.chips, aStartChips: holder.startChips, aStreak: holder.streak ?? null,
        bName: teamNameOf(pending), bChips: pending.chips, bStartChips: pending.startChips,
        startedAt: null, waitingText: "Waiting to Start",
      };
    }
    if (holder) {
      return {
        id: t.id, label: t.label, live: false, isStream: !!t.isStream, closing: !!t.closing,
        aName: teamNameOf(holder), aChips: holder.chips, aStartChips: holder.startChips, aStreak: holder.streak ?? null,
        bName: null, bChips: null, bStartChips: null, startedAt: null, waitingText: "Waiting for a challenger",
      };
    }
    return {
      id: t.id, label: t.label, live: false, isStream: !!t.isStream, closing: !!t.closing,
      aName: null, aChips: null, aStartChips: null, aStreak: null, bName: null, bChips: null, bStartChips: null,
      startedAt: null, waitingText: shuffleTransitioning ? "Waiting for Shuffle" : "Open",
    };
  });

  return {
    tournamentId,
    tournamentName,
    format,
    isTeam: format === "scotch_doubles",
    meId: me.id,
    myName: teamNameOf(me),
    myFargo: me.teamFargo,
    status,
    chips: me.chips,
    startChips: me.startChips,
    queuePosition,
    tableLabel: status === "playing" ? tableLabelOf(me.tableId) : null,
    isStreamed: status === "playing" && !!myTable?.isStream,
    wins: me.wins,
    losses: me.losses,
    winPct,
    streak,
    streakType,
    matchesPlayed,
    avgMatchMs,
    perf,
    chipRank,
    playersRemaining: alive.length,
    queuePreview,
    fullQueue,
    youreNext: qi === 0 && isAlive(me),
    recentMatches: recentMatches.slice(0, 5),
    leaderboard,
    fullLeaderboard,
    tables,
    liveMatches,
  };
};

export const usePlayerChipTournament = (
  playerId?: number,
  preferredTournamentId?: number | null,
) => {
  const { live } = useProfileTournaments(playerId);

  // The live chip tournament to surface. When the caller has explicitly selected a live
  // tournament (multiple-live switcher), only resolve it if THAT tournament is a chip event —
  // otherwise return null so the elimination hub handles the selection. With no selection,
  // fall back to the first live chip tournament.
  const chipEntry = useMemo(() => {
    const isChip = (t: (typeof live)[number]) =>
      t.tournament?.tournament_format === "chip-tournament";
    if (preferredTournamentId != null) {
      const sel = live.find((t) => t.tournament?.id === preferredTournamentId);
      return sel && isChip(sel) ? sel : null;
    }
    return live.find(isChip) ?? null;
  }, [live, preferredTournamentId]);
  const tournamentId = chipEntry?.tournament?.id;
  const tournamentName = chipEntry?.tournament?.name ?? "Chip Tournament";

  const stateQuery = useQuery({
    queryKey: ["player-chip-hub", tournamentId, playerId],
    queryFn: () => chipService.load(tournamentId!),
    enabled: !!tournamentId && !!playerId,
    // Poll while live so the player's status/queue stays fresh (no realtime yet).
    refetchInterval: tournamentId ? 8000 : false,
    refetchOnWindowFocus: true,
  });

  const hub = useMemo<ChipPlayerHub | null>(() => {
    if (!tournamentId || !playerId || !stateQuery.data) return null;
    return buildChipHub(
      tournamentId,
      tournamentName,
      stateQuery.data.chip,
      playerId,
    );
  }, [tournamentId, tournamentName, playerId, stateQuery.data]);

  return {
    hub,
    present: !!hub,
    isLoading: stateQuery.isLoading,
  };
};
