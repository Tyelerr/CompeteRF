// src/viewmodels/hooks/use.profile.tournaments.ts
// Profile "My Tournaments" data: a player's registrations joined to tournaments,
// bucketed into Live / Registered / Completed. Favorites + Following are sourced
// separately (favorites hook; following is not built yet).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../../models/services/registration.service";
import { PlayerTournament } from "../../models/types/registration.types";

const isLive = (t: PlayerTournament) => t.tournament?.live_state === "in_progress";
const isCompleted = (t: PlayerTournament) =>
  t.tournament?.status === "completed" || t.tournament?.live_state === "finished";

export const useProfileTournaments = (playerId?: number) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["profile-tournaments", playerId],
    queryFn: () => registrationService.getPlayerTournaments(playerId!),
    enabled: !!playerId,
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
