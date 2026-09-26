// src/viewmodels/hooks/use.player.live.match.ts
// Profile "Match Center" data: for the player's live tournament, resolve the one
// match that matters right now — the match they're currently playing, or the next
// one they're scheduled into — plus their opponent, score, table and round.
//
// Reuses the same bracket resolver the TD Manage hub uses (buildLiveMatches), so
// the player view stays in lock-step with the live bracket. Read-only.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { onlineOnlyWrite } from "../../utils/connection-required";
import { tournamentService } from "../../models/services/tournament.service";
import { tournamentTableService } from "../../models/services/tournament-table.service";
import {
  MatchLiveState,
  MatchResult,
} from "../../models/types/tournament-settings.types";
import { groupForFargo, RaceConfig, raceConfigFromLiveSettings } from "../../utils/bracket.utils";
import { CheckInSettings, readCheckInSettings } from "../../utils/check-in-timer";
import { buildLiveMatches, LiveMatch } from "../../utils/match.utils";
import { useProfileTournaments } from "./use.profile.tournaments";
import { registrationIdOf } from "../../utils/live-entries";

export interface PlayerLiveMatch {
  tournamentId: number;
  tournamentName: string;
  match: LiveMatch;
  matchId: string; // id in the bracket/matchState (e.g. "W1M1", "GF")
  mySlot: 1 | 2; // which side of the match the player is on
  myName: string | null; // the player's own display name in this tournament
  isPlaying: boolean; // true while the match is actually in progress
  opponentName: string | null; // null when the opponent is still TBD
  myScore: number;
  oppScore: number;
  table: string | null;
  raceTo: number | null; // the player's own race
  oppRaceTo: number | null; // the opponent's race (differs under groups / differential)
  roundLabel: string; // e.g. "Winners Round 4", "Finals"
}

// A completed match in the player's path (Match History + its detail summary).
export interface PlayerMatchResult {
  id: string;
  roundLabel: string;
  opponentName: string | null;
  myScore: number;
  oppScore: number;
  won: boolean;
  result: MatchResult | null; // forfeit / withdraw / normal
  myFargo: number | null;
  oppFargo: number | null;
  myGroup: string | null; // race-group label (e.g. "A") when in groups mode, else null
  oppGroup: string | null;
  myRace: number | null;
  oppRace: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

// Everything the profile "Tournament View" hub needs for the player's one live event.
export interface PlayerTournamentHub {
  tournamentId: number;
  tournamentName: string;
  myName: string | null; // the player's own display name in this tournament
  current: PlayerLiveMatch | null; // the match that matters now (or null between rounds / eliminated)
  history: PlayerMatchResult[]; // completed matches, earliest first
  // Tournament check-in settings (live_settings.checkIn) — whether check-in is required before a
  // PLAYER may Start Match, and the timer thresholds. Read-only here.
  checkIn: CheckInSettings;
}

const roundLabelFor = (m: LiveMatch): string => {
  if (m.side === "winners") return `Winners Round ${m.round}`;
  if (m.side === "losers") return `Losers Round ${m.round}`;
  return m.id === "GF2" ? "Finals (2nd Set)" : "Finals";
};

// Pick the single match to surface: an in-progress match wins; otherwise the
// earliest scheduled match the player is in (known opponent preferred).
const pickMatch = (matches: LiveMatch[], myRegId: number): LiveMatch | null => {
  const mine = matches.filter(
    (m) =>
      !m.empty &&
      !m.bye &&
      m.status !== "completed" &&
      (m.p1RegId === myRegId || m.p2RegId === myRegId),
  );
  if (mine.length === 0) return null;
  const playing = mine.find((m) => m.status === "in_progress");
  if (playing) return playing;
  const withOpponent = mine.find((m) => m.p1Name != null && m.p2Name != null);
  return withOpponent ?? mine[0];
};

export const usePlayerLiveMatch = (
  playerId?: number,
  preferredTournamentId?: number | null,
) => {
  const { live } = useProfileTournaments(playerId);

  // The live tournament to surface: the caller's chosen one (multiple-live switcher) if it's
  // present, otherwise the first (most-recently-registered) live tournament.
  const liveEntry =
    (preferredTournamentId != null
      ? live.find((t) => t.tournament?.id === preferredTournamentId)
      : null) ??
    live[0] ??
    null;
  const tournamentId = liveEntry?.tournament?.id;
  // Registration id ONLY from a real registration row — never the tournament id an RPC-only
  // live entry carries (see utils/live-entries.ts). Null → the hub waits for the row.
  const myRegId = registrationIdOf(liveEntry) ?? undefined;

  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
    // Poll while live so both players' Tournament Views stay in sync when either
    // side scores (no realtime subscription wired yet).
    refetchInterval: tournamentId ? 5000 : false,
    refetchOnWindowFocus: true,
  });

  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
  });

  const tournament = tournamentQuery.data ?? null;
  const queryClient = useQueryClient();

  // Merge a patch into one match's live state and persist into the shared
  // matchState (live_settings.matchState[matchId]). Invalidating ["tournament", id]
  // makes the bracket, the Matches tab and this hub all reflect the change.
  //
  // Only path: the row-locked submit_match_state RPC, which merges this one match
  // server-side and only lets a player score a match they are actually in. (The old
  // whole-live_settings fallback was removed — it could overwrite concurrent writes.)
  // Player score entry is ONLINE-ONLY on web: refused up front while offline and never paused
  // + replayed on reconnect (networkMode "always"; see src/utils/connection-required.ts).
  const matchStateMutation = useMutation({
    ...(Platform.OS === "web" ? { networkMode: "always" as const } : {}),
    mutationFn: async (vars: {
      matchId: string;
      patch: Partial<MatchLiveState>;
    }) => {
      if (!tournamentId) throw new Error("No live tournament.");
      const isWeb = Platform.OS === "web";
      const online = isWeb && typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : null;
      await onlineOnlyWrite(isWeb, online, () =>
        tournamentService.submitMatchState(tournamentId, vars.matchId, vars.patch as Record<string, unknown>),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] }),
  });

  const raceConfig: RaceConfig = useMemo(
    () => raceConfigFromLiveSettings(tournament?.live_settings),
    [tournament],
  );

  const hub: PlayerTournamentHub | null = useMemo(() => {
    if (!tournament || !myRegId) return null;
    const matches = buildLiveMatches(
      tournament.live_settings?.bracket ?? null,
      tournament.live_settings?.matchState ?? {},
      tablesQuery.data ?? [],
      tournament.game_type ?? "",
      raceConfig,
    );

    // The player's own display name, taken from any match they appear in.
    let myName: string | null = null;
    for (const mm of matches) {
      if (mm.p1RegId === myRegId && mm.p1Name) {
        myName = mm.p1Name;
        break;
      }
      if (mm.p2RegId === myRegId && mm.p2Name) {
        myName = mm.p2Name;
        break;
      }
    }

    // The match that matters now (in-progress > scheduled-with-opponent).
    const m = pickMatch(matches, myRegId);
    let current: PlayerLiveMatch | null = null;
    if (m) {
      const iAmP1 = m.p1RegId === myRegId;
      const myRace = (iAmP1 ? m.p1Race : m.p2Race) ?? m.raceTo;
      current = {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        match: m,
        matchId: m.id,
        mySlot: iAmP1 ? 1 : 2,
        myName,
        isPlaying: m.status === "in_progress",
        opponentName: iAmP1 ? m.p2Name : m.p1Name,
        myScore: (iAmP1 ? m.p1Score : m.p2Score) ?? 0,
        oppScore: (iAmP1 ? m.p2Score : m.p1Score) ?? 0,
        table: m.tableLabel,
        raceTo: myRace,
        oppRaceTo: (iAmP1 ? m.p2Race : m.p1Race) ?? m.raceTo,
        roundLabel: roundLabelFor(m),
      };
    }

    // Completed matches the player took part in, earliest first (graph order).
    const history: PlayerMatchResult[] = matches
      .filter(
        (mm) =>
          !mm.empty &&
          !mm.bye &&
          mm.status === "completed" &&
          (mm.p1RegId === myRegId || mm.p2RegId === myRegId),
      )
      .map((mm) => {
        const iAmP1 = mm.p1RegId === myRegId;
        const myFargo = iAmP1 ? mm.p1Fargo : mm.p2Fargo;
        const oppFargo = iAmP1 ? mm.p2Fargo : mm.p1Fargo;
        const grp = (f: number | null) =>
          raceConfig.mode === "groups"
            ? (groupForFargo(f, raceConfig.groups)?.label ?? null)
            : null;
        return {
          id: mm.id,
          roundLabel: roundLabelFor(mm),
          opponentName: iAmP1 ? mm.p2Name : mm.p1Name,
          myScore: (iAmP1 ? mm.p1Score : mm.p2Score) ?? 0,
          oppScore: (iAmP1 ? mm.p2Score : mm.p1Score) ?? 0,
          won: mm.winner === (iAmP1 ? 1 : 2),
          result: mm.result,
          myFargo,
          oppFargo,
          myGroup: grp(myFargo),
          oppGroup: grp(oppFargo),
          myRace: iAmP1 ? mm.p1Race : mm.p2Race,
          oppRace: iAmP1 ? mm.p2Race : mm.p1Race,
          startedAt: mm.startedAt,
          completedAt: mm.completedAt,
        };
      });

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      myName,
      current,
      history,
      checkIn: readCheckInSettings(tournament.live_settings ?? null),
    };
  }, [tournament, myRegId, tablesQuery.data, raceConfig]);

  // NOTE: elimination persistence is intentionally NOT done here. Reconciling
  // tournament_players.eliminated_at is restricted to authorized management (the TD/operator
  // manage screen calls sync_tournament_eliminations, which is manager-only) so a normal
  // participant can never set/clear another player's elimination state. This hook only reads
  // live state for the player's own Tournament View; the review prompt reads the persisted
  // eliminated_at from the profile query.

  // Adjust one side's score by +/-1. The score is capped at that side's race, and
  // when a side reaches its race the match auto-completes (winner set) so the
  // resolver advances the player into the next bracket. Lowering a side back below
  // its race re-opens the match (correction path).
  const adjustScore = (matchId: string, slot: 1 | 2, delta: number) => {
    const m = hub?.current?.match;
    if (!m) return Promise.resolve(undefined);

    const r1 = m.p1Race ?? m.raceTo ?? null;
    const r2 = m.p2Race ?? m.raceTo ?? null;
    const cap = (n: number, race: number | null) =>
      Math.max(0, Math.min(n, race ?? 999));

    const p1 = m.p1Score ?? 0;
    const p2 = m.p2Score ?? 0;
    const newP1 = slot === 1 ? cap(p1 + delta, r1) : p1;
    const newP2 = slot === 2 ? cap(p2 + delta, r2) : p2;
    if (newP1 === p1 && newP2 === p2) return Promise.resolve(undefined); // no-op (at cap)

    const reach1 = r1 != null && newP1 >= r1;
    const reach2 = r2 != null && newP2 >= r2;
    const done = reach1 || reach2;

    const patch: Partial<MatchLiveState> = {
      p1Score: newP1,
      p2Score: newP2,
      status: done ? "completed" : "in_progress",
      winner: done ? (reach1 ? 1 : 2) : null,
      completedAt: done ? new Date().toISOString() : null,
      result: done ? "normal" : m.result ?? null,
    };
    return matchStateMutation.mutateAsync({ matchId, patch });
  };

  return {
    hub,
    // Back-compat: the standalone Match Center card reads the current match.
    liveMatch: hub?.current ?? null,
    myRegId: myRegId ?? null, // the viewer's registration id (for bracket highlight)
    adjustScore,
    isScoring: matchStateMutation.isPending,
    isLoading: tournamentQuery.isLoading,
  };
};
