// src/viewmodels/hooks/use.registration.realtime.ts
// Cross-client roster freshness for the ACTIVE admin management screen ONLY.
//
// React Query invalidation (see registration-invalidation.ts) only refreshes the
// device that performed the mutation. When a PLAYER self-registers on their phone, the
// DIRECTOR's roster on a different device has a stale cache. This hook closes that gap
// with the smallest scalable mechanism: while a director is actively viewing ONE
// tournament's management screen, it opens a single Supabase Realtime channel scoped by
// `tournament_id` to that tournament's registration tables, and — on any relevant row
// change — invalidates ONLY that tournament's roster query (and optionally asks the
// chip screen to silently reload). It tears the channel down on blur/unmount.
//
// Why it scales to thousands of users:
//   • Not global. Spectators, browse, and the public detail modal do NOT call this — so
//     the number of live channels ≈ directors currently ON a manage screen, a tiny
//     fraction of users, never "every user subscribed to every tournament".
//   • Server-side scoped. Each binding carries `filter: tournament_id=eq.<id>`, so the
//     server sends only that one tournament's registration events (plus RLS), not a
//     firehose. One channel per mounted screen, three table bindings.
//   • No polling. It reacts to actual row changes; between changes it costs nothing.
//   • Bursts coalesced into a single refetch (a team insert + its member insert arrive
//     together) so rapid changes don't fan out into repeated refetches.
//
// Realtime requires the watched tables to be in the `supabase_realtime` publication
// (migration 20260909120000_realtime_registration_tables.sql). Until that is applied
// the hook is inert (no events arrive) but harmless.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

// Registration/roster tables for one tournament. All three carry `tournament_id`
// (tournament_team_members has it denormalized), so every binding is tournament-scoped.
const WATCHED_TABLES = [
  "tournament_players", // singles self-reg, TD add, status/Ready changes, cancel/no-show
  "tournament_teams", // team registration + team status
  "tournament_team_members", // partner invite / accept / cancel
] as const;

export const useRegistrationRealtime = (
  tournamentId: number | undefined,
  enabled: boolean,
  onChange?: () => void,
): void => {
  const queryClient = useQueryClient();
  // Keep the latest onChange without making it a resubscribe trigger (callers may pass
  // an inline function). The subscribe effect depends only on enabled/tournamentId/
  // queryClient; this separate effect syncs the ref so the write never happens in render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tournamentId) return;
    const filter = `tournament_id=eq.${tournamentId}`;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Coalesce a burst of changes into one refetch.
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: ["registrations", tournamentId] });
        onChangeRef.current?.();
      }, 250);
    };

    let channel = supabase.channel(`admin-registrations:${tournamentId}`);
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        bump,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, tournamentId, queryClient]);
};
