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

  const result: PlayerLiveMatch | null = useMemo(() => {
    if (!tournament || !myRegId) return null;
    const matches = buildLiveMatches(
      tournament.live_settings?.bracket ?? null,
      tournament.live_settings?.matchState ?? {},
      tablesQuery.data ?? [],
      tournament.game_type ?? "",
      raceConfig,
    );
    const m = pickMatch(matches, myRegId);
    if (!m) return null;

    const iAmP1 = m.p1RegId === myRegId;
    const opponentName = iAmP1 ? m.p2Name : m.p1Name;
    const myScore = (iAmP1 ? m.p1Score : m.p2Score) ?? 0;
    const oppScore = (iAmP1 ? m.p2Score : m.p1Score) ?? 0;
    const myRace = (iAmP1 ? m.p1Race : m.p2Race) ?? m.raceTo;

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      match: m,
      isPlaying: m.status === "in_progress",
      opponentName,
      myScore,
      oppScore,
      table: m.tableLabel,
      raceTo: myRace,
      roundLabel: roundLabelFor(m),
    };
  }, [tournament, myRegId, tablesQuery.data, raceConfig]);

  return {
    liveMatch: result,
    isLoading: tournamentQuery.isLoading,
  };
};
