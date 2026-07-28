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
  isMe: boolean;
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
  leaderboard: ChipLeaderRow[];
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
// Same Tournament Performance Rating formula as utils/tournament.stats.ts.
const TPR_K = -100 / Math.log(2);

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
  // Tournament Performance Rating — weighted avg opponent Fargo shifted by win
  // rate (each chip match = one game, weighted by the opponent's team Fargo).
  let tprWins = 0;
  let tprGames = 0;
  let tprOppSum = 0;
  let tprWeighted = 0;
  for (const m of myFinished) {
    const oppId = m.aId === me.id ? m.bId : m.aId;
    const opp = s.entries.find((x) => x.id === oppId);
    tprGames += 1;
    if (m.winnerId === me.id) tprWins += 1;
    const of = opp?.teamFargo ?? null;
    if (of != null) {
      tprOppSum += of;
      tprWeighted += 1;
    }
  }
  const avgOpponentFargo = tprWeighted > 0 ? Math.round(tprOppSum / tprWeighted) : null;
  let rating: number | null = null;
  if (tprGames > 0 && tprWeighted > 0) {
    const cap = Math.min(0.99, Math.max(0.01, tprWins / tprGames));
    rating = Math.round(tprOppSum / tprWeighted + TPR_K * Math.log((1 - cap) / cap));
  }
  const ownFargo = me.teamFargo ?? null;
  const delta = rating != null && ownFargo != null ? rating - ownFargo : null;
  const perf: ChipPerf | null =
    rating != null && delta != null
      ? { label: perfLabelFor(delta), winPct, sample: matchesPlayed, rating, delta, avgOpponentFargo }
      : null;

  // Chip ranking among the living.
  const rankIdx = byChips.findIndex((e) => e.id === me.id);
  const chipRank = rankIdx >= 0 ? rankIdx + 1 : null;

  // Queue preview (next 5), highlighting me.
  const fullQueue: ChipQueueSlot[] = s.queue
    .map((id) => s.entries.find((e) => e.id === id))
    .filter((e): e is ChipEntry => !!e)
    .map((e) => ({
      id: e.id,
      name: teamNameOf(e),
      fargo: e.teamFargo,
      chips: e.chips,
      isMe: e.id === me.id,
    }));
  const queuePreview: ChipQueueSlot[] = fullQueue.slice(0, 5);

  const leaderboard: ChipLeaderRow[] = byChips.slice(0, 10).map((e, i) => ({
    id: e.id,
    rank: i + 1,
    name: teamNameOf(e),
    chips: e.chips,
    wins: e.wins,
    losses: e.losses,
    isMe: e.id === me.id,
  }));

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
    liveMatches,
  };
};

export const usePlayerChipTournament = (playerId?: number) => {
  const { live } = useProfileTournaments(playerId);

  // First LIVE chip tournament the player is in.
  const chipEntry = useMemo(
    () =>
      live.find(
        (t) => t.tournament?.tournament_format === "chip-tournament",
      ) ?? null,
    [live],
  );
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
