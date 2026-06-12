// src/viewmodels/hooks/use.profile.tournaments.ts
// Profile "My Tournaments" data: a player's registrations joined to tournaments,
// bucketed into Live / Registered / Completed. Favorites + Following are sourced
// separately (favorites hook; following is not built yet).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../../models/services/registration.service";
import { PlayerTournament } from "../../models/types/registration.types";

// A tournament is "live" for the player once the bracket is drawn — i.e. they have
// a bracket position and matches to follow. That's live_state "registration_closed"
// (Bracket Drawn, where TDs assign tables / play matches before formally pressing
// Start) as well as "in_progress" (Running). Either way the profile should surface
// the Tournament View hub.
const isLive = (t: PlayerTournament) =>
  t.tournament?.live_state === "in_progress" ||
  t.tournament?.live_state === "registration_closed";
const isCompleted = (t: PlayerTournament) =>
  t.tournament?.status === "completed" || t.tournament?.live_state === "finished";

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

  const all = useMemo(
    () => (data ?? []).filter((t) => t.tournament != null),
    [data],
  );
  const live = useMemo(() => all.filter(isLive), [all]);
  const completed = useMemo(() => all.filter(isCompleted), [all]);
  // "Registered" = everything you're signed up for that isn't already completed.
  const registered = useMemo(() => all.filter((t) => !isCompleted(t)), [all]);

  return { all, live, registered, completed, isLoading, refetch };
};
