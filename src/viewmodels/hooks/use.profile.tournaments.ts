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
import { isTournamentViewEligible } from "../../utils/tournament-view";

// Team-format (Scotch Doubles) events register as a TEAM, not an individual
// tournament_players row. A leftover players row (e.g. after a partner swap
// removed this player) must not read as "registered", so those are reconciled
// against actual team membership below.
const isTeamFormat = (t: PlayerTournament) =>
  String(t.tournament?.game_type ?? "").includes("scotch-doubles");

// Tournament View is a GAMEPLAY state — see src/utils/tournament-view.ts (the single
// source of truth, shared with the hub hooks). A tournament qualifies only once gameplay
// has actually begun (elimination: bracket drawn / matches generated; chip: started) AND
// the player is still an active participant. Registration merely closing does NOT qualify
// (a TD can close registration without drawing the bracket).
const isLive = (t: PlayerTournament) => isTournamentViewEligible(t);
// Profile history keeps ALL completed tournaments (no 30-day archive split) so a
// player's career/top-finishes never lose data. Uses the shared completion helper.
const isCompleted = (t: PlayerTournament) =>
  isTournamentCompleted(t.tournament ?? {});

// Adaptive live-poll cadence (only while Profile is the focused tab):
//  • WAITING: the user has a registered-but-not-live tournament that could go
//    live → poll every 25s (mid of the 20–30s "reasonably quick" window).
//  • LIVE: already in a live event → a slow 30s poll ONLY to notice it END; the
//    Tournament View's own live hubs drive in-event updates, so we don't duplicate
//    fast polling here.
// Everything else (not focused, or nothing upcoming) uses NO interval and relies
// on initial load + Profile focus + app-resume (focusManager) refetches.
const LIVE_WAITING_POLL_MS = 25000;
const LIVE_END_POLL_MS = 30000;

export const useProfileTournaments = (
  playerId?: number,
  options?: { focused?: boolean },
) => {
  // When Profile is not the active tab we suppress the recurring live poll
  // entirely (default true so callers that don't pass it behave as "focused").
  const focused = options?.focused ?? true;

  const { data, isLoading: individualLoading, refetch } = useQuery({
    queryKey: ["profile-tournaments", playerId],
    queryFn: () => registrationService.getPlayerTournaments(playerId!),
    enabled: !!playerId,
    // No steady poll: registrations change on discrete events, so mount +
    // Profile-focus + app-resume (refetchOnWindowFocus) refreshes are sufficient.
    refetchOnWindowFocus: true,
  });

  // The player's TEAM registrations (captain / accepted partner), shaped like the
  // individual ones. An invited teammate only has a team-member row, so this is
  // how they appear on their profile at all.
  const teamsQuery = useQuery({
    queryKey: ["profile-team-tournaments", playerId],
    queryFn: () => teamService.getMyTeamRegistrations(playerId!),
    enabled: !!playerId,
    // No steady poll (same rationale as the individual query above).
    refetchOnWindowFocus: true,
  });

  // Merge individual + team registrations. For a team-format event the team
  // membership is the source of truth — so we drop team-format tournament_players
  // rows (a leftover one after a partner swap must not read as registered) and
  // rebuild those events from actual memberships, deduped by tournament. Until
  // the team lookup resolves we leave the raw individual list alone so nothing
  // flickers. Computed BEFORE the live query so its cadence can react to whether
  // the user actually has an upcoming/live event.
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

  // Cheap candidate signals from the already-fetched client data (no extra query):
  //  • hasUpcoming → registered-but-not-live event that could transition to live.
  //  • clientLiveEvent → the client already sees a live event (elim / self-reg / team).
  const hasUpcoming = useMemo(
    () => all.some((t) => !isCompleted(t) && !isLive(t)),
    [all],
  );
  const clientLiveEvent = useMemo(() => all.some(isLive), [all]);

  // The authoritative LIVE check: one SECURITY DEFINER RPC scoped to the current
  // user (auth.uid() server-side) that returns only their in_progress tournaments
  // across ALL roster paths — including chip_entries, which the client cannot read
  // directly (director-scoped RLS). This drives the Profile → Tournament View switch.
  // Steady polling is adaptive + focus-gated (see LIVE_*_POLL_MS above): users who
  // are not actively waiting on a tournament contribute ZERO recurring load. Initial
  // load, Profile focus, and app-resume still each revalidate once. If the RPC isn't
  // deployed yet it errors and the client-derived live list below carries the
  // tournament_players/team paths, so nothing regresses in the meantime.
  const liveQuery = useQuery({
    queryKey: ["profile-live-tournament", playerId],
    queryFn: () => registrationService.getMyLiveTournament(),
    enabled: !!playerId,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (!playerId || !focused) return false; // not the active tab → no interval
      const rpcData = query.state.data as PlayerTournament[] | undefined;
      const liveNow = (rpcData?.length ?? 0) > 0 || clientLiveEvent;
      if (liveNow) return LIVE_END_POLL_MS; // already live → slow end-detection only
      if (hasUpcoming) return LIVE_WAITING_POLL_MS; // waiting for go-live → 25s
      return false; // nothing upcoming → rely on focus/resume, no recurring poll
    },
  });

  // Live (in-progress) events, most-recently-STARTED first (authoritative gameplay_started_at,
  // set by a DB trigger on the go-live transition — not the noisy updated_at). So a
  // later-started Tournament B is the default primary over a still-running Tournament A; the
  // switcher lets the player override during the session.
  //
  // Source = the server RPC (superset: covers chip_entries too), UNIONed with the
  // client-derived live list as a safety net (keeps the tournament_players/team paths
  // working if the RPC isn't deployed yet). Deduped by tournament id — the client row
  // wins when both have it (it carries eliminated_at for the "eliminated but still
  // live" note) — and re-sorted most-recently-started first for a deterministic primary.
  const live = useMemo(() => {
    const clientLive = all.filter(isLive);
    const rpcLive = !liveQuery.isError ? liveQuery.data ?? [] : [];
    const byId = new Map<number, PlayerTournament>();
    for (const t of clientLive) {
      if (t.tournament?.id != null) byId.set(t.tournament.id, t);
    }
    for (const t of rpcLive) {
      if (t.tournament?.id != null && !byId.has(t.tournament.id))
        byId.set(t.tournament.id, t);
    }
    return Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.tournament?.gameplay_started_at ?? 0).getTime() -
        new Date(a.tournament?.gameplay_started_at ?? 0).getTime(),
    );
  }, [all, liveQuery.data, liveQuery.isError]);
  const completed = useMemo(() => all.filter(isCompleted), [all]);
  // "Registered" = signed up but gameplay has NOT begun (and not completed). Once a
  // tournament enters gameplay it moves to the live/Tournament-View bucket, and when it
  // finishes it moves to Completed — so a tournament lives in exactly one bucket.
  const registered = useMemo(
    () => all.filter((t) => !isCompleted(t) && !isLive(t)),
    [all],
  );

  const refetchAll = useMemo(
    () => () => Promise.all([refetch(), teamsQuery.refetch(), liveQuery.refetch()]),
    [refetch, teamsQuery, liveQuery],
  );

  // First-load flag for the whole live check (individual + team). Used by Profile to
  // render the correct view once instead of flashing the normal Profile then swapping
  // in Tournament View. Only true on the initial fetch (no cached data); later polls /
  // focus refetches set isFetching, not isLoading, so this never re-blocks the screen.
  const isLoading =
    individualLoading || teamsQuery.isLoading || liveQuery.isLoading;

  return { all, live, registered, completed, isLoading, refetch: refetchAll };
};
