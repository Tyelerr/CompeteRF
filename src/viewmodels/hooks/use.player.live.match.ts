// src/viewmodels/hooks/use.player.live.match.ts
// Profile "Match Center" data: for the player's live tournament, resolve the one
// match that matters right now — the match they're currently playing, or the next
// one they're scheduled into — plus their opponent, score, table and round.
//
// Reuses the same bracket resolver the TD Manage hub uses (buildLiveMatches), so
// the player view stays in lock-step with the live bracket. Read-only.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { tournamentService } from "../../models/services/tournament.service";
import { tournamentTableService } from "../../models/services/tournament-table.service";
import { MatchResult } from "../../models/types/tournament-settings.types";
import { RaceConfig } from "../../utils/bracket.utils";
import { buildLiveMatches, LiveMatch } from "../../utils/match.utils";
import { useProfileTournaments } from "./use.profile.tournaments";

export interface PlayerLiveMatch {
  tournamentId: number;
  tournamentName: string;
  match: LiveMatch;
  isPlaying: boolean; // true while the match is actually in progress
  opponentName: string | null; // null when the opponent is still TBD
  myScore: number;
  oppScore: number;
  table: string | null;
  raceTo: number | null;
  roundLabel: string; // e.g. "Winners Round 4", "Finals"
}

// A completed match in the player's path (Match History).
export interface PlayerMatchResult {
  id: string;
  roundLabel: string;
  opponentName: string | null;
  myScore: number;
  oppScore: number;
  won: boolean;
  result: MatchResult | null; // forfeit / withdraw / normal
}

// Everything the profile "Tournament View" hub needs for the player's one live event.
export interface PlayerTournamentHub {
  tournamentId: number;
  tournamentName: string;
  current: PlayerLiveMatch | null; // the match that matters now (or null between rounds / eliminated)
  history: PlayerMatchResult[]; // completed matches, earliest first
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

export const usePlayerLiveMatch = (playerId?: number) => {
  const { live } = useProfileTournaments(playerId);

  // First live tournament the player is in (Match Center surfaces one at a time).
  const liveEntry = live[0] ?? null;
  const tournamentId = liveEntry?.tournament?.id;
  const myRegId = liveEntry?.id;

  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
  });

  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
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

  const hub: PlayerTournamentHub | null = useMemo(() => {
    if (!tournament || !myRegId) return null;
    const matches = buildLiveMatches(
      tournament.live_settings?.bracket ?? null,
      tournament.live_settings?.matchState ?? {},
      tablesQuery.data ?? [],
      tournament.game_type ?? "",
      raceConfig,
    );

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
        isPlaying: m.status === "in_progress",
        opponentName: iAmP1 ? m.p2Name : m.p1Name,
        myScore: (iAmP1 ? m.p1Score : m.p2Score) ?? 0,
        oppScore: (iAmP1 ? m.p2Score : m.p1Score) ?? 0,
        table: m.tableLabel,
        raceTo: myRace,
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
        return {
          id: mm.id,
          roundLabel: roundLabelFor(mm),
          opponentName: iAmP1 ? mm.p2Name : mm.p1Name,
          myScore: (iAmP1 ? mm.p1Score : mm.p2Score) ?? 0,
          oppScore: (iAmP1 ? mm.p2Score : mm.p1Score) ?? 0,
          won: mm.winner === (iAmP1 ? 1 : 2),
          result: mm.result,
        };
      });

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      current,
      history,
    };
  }, [tournament, myRegId, tablesQuery.data, raceConfig]);

  return {
    hub,
    // Back-compat: the standalone Match Center card reads the current match.
    liveMatch: hub?.current ?? null,
    isLoading: tournamentQuery.isLoading,
  };
};
