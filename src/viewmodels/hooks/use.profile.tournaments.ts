// src/viewmodels/hooks/use.profile.tournaments.ts
// Profile "My Tournaments" data: a player's registrations joined to tournaments,
// bucketed into Live / Registered / Completed. Favorites + Following are sourced
// separately (favorites hook; following is not built yet).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../../models/services/registration.service";
import { teamService } from "../../models/services/team.service";
import { PlayerTournament } from "../../models/types/registration.types";
import { isTournamentCompleted } from "../../utils/tournament.archive";

// Team-format (Scotch Doubles) events register as a TEAM, not an individual
// tournament_players row. A leftover players row (e.g. after a partner swap
// removed this player) must not read as "registered", so those are reconciled
// against actual team membership below.
const isTeamFormat = (t: PlayerTournament) =>
  String(t.tournament?.game_type ?? "").includes("scotch-doubles");

// A tournament is "live" for the player once the bracket is drawn — i.e. they have
// a bracket position and matches to follow. That's live_state "registration_closed"
// (Bracket Drawn, where TDs assign tables / play matches before formally pressing
// Start) as well as "in_progress" (Running). Either way the profile should surface
// the Tournament View hub.
const isLive = (t: PlayerTournament) =>
  t.tournament?.live_state === "in_progress" ||
  t.tournament?.live_state === "registration_closed";
// Profile history keeps ALL completed tournaments (no 30-day archive split) so a
// player's career/top-finishes never lose data. Uses the shared completion helper.
const isCompleted = (t: PlayerTournament) =>
  isTournamentCompleted(t.tournament ?? {});

export const useProfileTournaments = (playerId?: number) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["profile-tournaments", playerId],
    queryFn: () => registrationService.getPlayerTournaments(playerId!),
    enabled: !!playerId,
    // Poll + refetch on focus so the Tournament View pops up promptly when a TD
    // draws the bracket / starts the event, without needing a manual pull-to-refresh.
    refetchInterval: playerId ? 10000 : false,
    refetchOnWindowFocus: true,
  });

  // The player's TEAM registrations (captain / accepted partner), shaped like the
  // individual ones. An invited teammate only has a team-member row, so this is
  // how they appear on their profile at all.
  const teamsQuery = useQuery({
    queryKey: ["profile-team-tournaments", playerId],
    queryFn: () => teamService.getMyTeamRegistrations(playerId!),
    enabled: !!playerId,
    refetchInterval: playerId ? 10000 : false,
    refetchOnWindowFocus: true,
  });

  // Merge individual + team registrations. For a team-format event the team
  // membership is the source of truth — so we drop team-format tournament_players
  // rows (a leftover one after a partner swap must not read as registered) and
  // rebuild those events from actual memberships, deduped by tournament. Until
  // the team lookup resolves we leave the raw individual list alone so nothing
  // flickers.
  const all = useMemo<PlayerTournament[]>(() => {
    const players = (data ?? []).filter((t) => t.tournament != null);
    if (!teamsQuery.isSuccess) return players;
    const teamEntries = (teamsQuery.data ?? []).filter((t) => t.tournament != null);
    const byTournament = new Map<number, PlayerTournament>();
    for (const t of players) {
      if (isTeamFormat(t)) continue; // team events come from memberships below
      byTournament.set(t.tournament!.id, t);
    }
    for (const t of teamEntries) byTournament.set(t.tournament!.id, t);
    return Array.from(byTournament.values());
  }, [data, teamsQuery.isSuccess, teamsQuery.data]);

  const live = useMemo(() => all.filter(isLive), [all]);
  const completed = useMemo(() => all.filter(isCompleted), [all]);
  // "Registered" = everything you're signed up for that isn't already completed.
  const registered = useMemo(() => all.filter((t) => !isCompleted(t)), [all]);

  const refetchAll = useMemo(
    () => () => Promise.all([refetch(), teamsQuery.refetch()]),
    [refetch, teamsQuery],
  );

  return { all, live, registered, completed, isLoading, refetch: refetchAll };
};
