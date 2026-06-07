// src/viewmodels/useTournamentSpectator.ts
// Read-only viewmodel for the public "View Tournament" spectator screen. Loads the
// tournament (with its live bracket/match state), tables and registrations, and
// derives the screen-ready match list + a trimmed player list (no TD-only fields
// like payment/contact). Polls while live so spectators see scores update.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../models/services/registration.service";
import { tournamentService } from "../models/services/tournament.service";
import { tournamentTableService } from "../models/services/tournament-table.service";
import { RegistrationStatus } from "../models/types/common.types";
import { RaceGroup } from "../models/types/tournament-settings.types";
import { groupForFargo, RaceConfig } from "../utils/bracket.utils";
import { buildLiveMatches } from "../utils/match.utils";

export interface SpectatorPlayer {
  id: number;
  name: string;
  fargo: number | null;
  group: string | null; // race-group label (groups mode only)
  seed: number | null;
  status: RegistrationStatus;
}

const playerName = (r: {
  guest_name?: string | null;
  profiles?: { name?: string; user_name?: string };
}): string =>
  r.profiles?.name ||
  (r.profiles?.user_name ? `@${r.profiles.user_name}` : "") ||
  r.guest_name ||
  "Player";

export const useTournamentSpectator = (tournamentId?: number) => {
  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => tournamentService.getTournament(tournamentId!),
    enabled: !!tournamentId,
    refetchInterval: tournamentId ? 5000 : false, // live score sync
    refetchOnWindowFocus: true,
  });

  const tablesQuery = useQuery({
    queryKey: ["tournament-tables", tournamentId],
    queryFn: () => tournamentTableService.getTables(tournamentId!),
    enabled: !!tournamentId,
    retry: false,
  });

  const registrationsQuery = useQuery({
    queryKey: ["registrations", tournamentId],
    queryFn: () => registrationService.getRegistrations(tournamentId!),
    enabled: !!tournamentId,
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

  const groups: RaceGroup[] = raceConfig.groups;

  const matches = useMemo(
    () =>
      buildLiveMatches(
        tournament?.live_settings?.bracket ?? null,
        tournament?.live_settings?.matchState ?? {},
        tablesQuery.data ?? [],
        tournament?.game_type ?? "",
        raceConfig,
      ),
    [tournament, tablesQuery.data, raceConfig],
  );

  // Trimmed player list (no payment / contact / check-in details). Cancelled
  // registrations are dropped; sorted by seed then name.
  const players: SpectatorPlayer[] = useMemo(() => {
    const rows = registrationsQuery.data ?? [];
    return rows
      .filter((r) => r.status !== "cancelled")
      .map((r) => {
        const fargo = r.fargo_rating ?? null;
        return {
          id: r.id,
          name: playerName(r),
          fargo,
          group:
            raceConfig.mode === "groups"
              ? (groupForFargo(fargo, groups)?.label ?? null)
              : null,
          seed: r.seed ?? null,
          status: r.status,
        };
      })
      .sort((a, b) => {
        if (a.seed != null && b.seed != null) return a.seed - b.seed;
        if (a.seed != null) return -1;
        if (b.seed != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [registrationsQuery.data, raceConfig.mode, groups]);

  return {
    tournament,
    matches,
    tables: tablesQuery.data ?? [],
    players,
    raceConfig,
    groups,
    isLoading:
      tournamentQuery.isLoading ||
      registrationsQuery.isLoading ||
      tablesQuery.isLoading,
    refetch: () =>
      Promise.all([
        tournamentQuery.refetch(),
        tablesQuery.refetch(),
        registrationsQuery.refetch(),
      ]),
  };
};
