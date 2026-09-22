// src/utils/live-entries.ts
// Builds the player's Live (Tournament View) list from two sources and keeps the
// REGISTRATION identity correct. Pure — no React, no Supabase.
//
//  • `all`     — the player's own registration rows (tournament_players / team
//                memberships). `entry.id` IS the registration id. Refreshed only on
//                mount / focus / resume, so its embedded tournament fields can be stale.
//  • `rpcLive` — get_my_live_tournament (polled). Authoritative for WHICH events are
//                live, but its `id` is the TOURNAMENT id (it has no registration id).
//
// Bug this fixes: when an event goes live while the Profile is open, `all` still says
// "registration closed", so the entry came only from the RPC and the player hook took the
// tournament id as the player's registration id → no current match, no scoring, empty
// history, wrong bracket highlight (or, on an id collision, another player's match).
// Now: an RPC-live event uses the player's registration row when one exists (fresh live
// fields from the RPC, identity from the row); an RPC-only entry is flagged `liveRpcOnly`
// so its id is never read as a registration id.

import { PlayerTournament } from "../models/types/registration.types";

export const mergeLiveEntries = (
  clientLive: PlayerTournament[],
  rpcLive: PlayerTournament[],
  all: PlayerTournament[],
): PlayerTournament[] => {
  const rowByTournament = new Map<number, PlayerTournament>();
  for (const t of all) if (t.tournament?.id != null) rowByTournament.set(t.tournament.id, t);

  const byId = new Map<number, PlayerTournament>();
  for (const t of clientLive) {
    if (t.tournament?.id != null) byId.set(t.tournament.id, t);
  }
  for (const t of rpcLive) {
    const tid = t.tournament?.id;
    if (tid == null || byId.has(tid)) continue;
    const row = rowByTournament.get(tid);
    byId.set(
      tid,
      row && row.tournament
        ? {
            ...row, // registration identity (id, status) from the player's own row
            eliminated_at: t.eliminated_at ?? row.eliminated_at ?? null,
            tournament: { ...row.tournament, ...t.tournament }, // fresh live fields
          }
        : { ...t, liveRpcOnly: true },
    );
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.tournament?.gameplay_started_at ?? 0).getTime() -
      new Date(a.tournament?.gameplay_started_at ?? 0).getTime(),
  );
};

// True when the live RPC reports an event the registration list doesn't yet show as live
// (stale tournament fields, or a registration added after the list loaded) → the caller
// should refetch the registration list so the real registration row arrives.
export const liveListNeedsResync = (
  clientLive: PlayerTournament[],
  rpcLive: PlayerTournament[],
): boolean => {
  const live = new Set(clientLive.map((t) => t.tournament?.id));
  return rpcLive.some((t) => t.tournament?.id != null && !live.has(t.tournament.id));
};

// The player's registration id for a live entry, or null when the entry does not carry one
// (an RPC-only entry, whose id is the tournament id).
export const registrationIdOf = (entry: PlayerTournament | null | undefined): number | null =>
  entry && !entry.liveRpcOnly ? entry.id : null;
