// src/models/services/registration.service.ts
// Data access for tournament_players (registrations).
// Pattern mirrors tournament.service.ts: object literal, async methods,
// throw on error, .maybeSingle() for optional reads, .select().single()
// after mutations to catch silent failures.
//
// FIELD-LEVEL AUTH NOTE: RLS lets a player update their OWN row, but the
// player self-service path must only ever cancel. Approve / check-in / seed /
// fargo / paid-ticks are TD-only and live in the TD methods below. Do not
// expose the TD methods to the player UI.

import { supabase } from "../../lib/supabase";
import {
  PlayerTournament,
  Registration,
  RegistrationInsert,
  RegistrationUpdate,
} from "../types/registration.types";
import { RegistrationStatus } from "../types/common.types";
import { PlayerHistoryRow } from "../../utils/player.performance";
import { TournamentLiveSettings } from "../types/tournament-settings.types";

interface RawHistoryRow {
  id: number;
  tournament: {
    id: number;
    name: string | null;
    game_type: string | null;
    tournament_date: string | null;
    status: string | null;
    live_state: string | null;
    live_settings: TournamentLiveSettings | null;
  } | null;
}

export const registrationService = {
  // ---- Reads -------------------------------------------------------------

  // All registrations for a tournament (TD view + spectator/bracket).
  async getRegistrations(tournamentId: number): Promise<Registration[]> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*, profiles:player_id (id_auto, user_name, name)")
      .eq("tournament_id", tournamentId)
      .order("registered_at", { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as Registration[];
  },

  // Active (non-cancelled, non-no-show) registration count per tournament, for the
  // public billiards status badges. Public SELECT on tournament_players permits
  // this unauthenticated. Returns a { [tournamentId]: count } map.
  async getRegistrationCounts(): Promise<Record<number, number>> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("tournament_id, status")
      .not("status", "in", "(cancelled,no_show)");
    if (error) throw error;
    const counts: Record<number, number> = {};
    for (const row of (data || []) as { tournament_id: number }[]) {
      counts[row.tournament_id] = (counts[row.tournament_id] || 0) + 1;
    }
    return counts;
  },

  // A single player's registrations across tournaments (profile "Registered" bucket).
  async getPlayerRegistrations(playerId: number): Promise<Registration[]> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*")
      .eq("player_id", playerId)
      .order("registered_at", { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as Registration[];
  },

  // A player's registrations joined to tournament + venue, for the profile
  // "My Tournaments" tabs (Live / Registered / Completed are derived from these).
  async getPlayerTournaments(playerId: number): Promise<PlayerTournament[]> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select(
        "id, status, registered_at, eliminated_at, tournament:tournament_id (id, name, game_type, tournament_format, tournament_date, start_time, status, live_state, gameplay_started_at, thumbnail, venues:venue_id (venue, city, state))",
      )
      .eq("player_id", playerId)
      .order("registered_at", { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as PlayerTournament[];
  },

  // The authoritative "am I in a LIVE tournament right now?" lookup. A single
  // SECURITY DEFINER RPC (get_my_live_tournament) resolves the caller from
  // auth.uid() server-side and checks ONLY their own participation across every
  // roster path (tournament_players, tournament_team_members, chip_entries p1/p2),
  // returning just tournaments with live_state='in_progress' — deduped and ordered
  // most-recently-started first. Scoped to the current user and indexed, so it
  // scales regardless of how many tournaments the platform has. Shaped like
  // PlayerTournament so the Profile live bucket consumes it unchanged.
  async getMyLiveTournament(): Promise<PlayerTournament[]> {
    const { data, error } = await supabase.rpc("get_my_live_tournament");
    if (error) throw error;
    return (Array.isArray(data) ? data : []) as unknown as PlayerTournament[];
  },

  // A player's full tournament history (with bracket + match state) for the
  // profile Performance Snapshot. Capped to the most recent 100 events.
  async getPlayerHistory(playerId: number): Promise<PlayerHistoryRow[]> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select(
        "id, tournament:tournament_id (id, name, game_type, tournament_date, status, live_state, live_settings)",
      )
      .eq("player_id", playerId)
      .order("registered_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as RawHistoryRow[])
      .filter((r) => r.tournament != null)
      .map((r) => ({
        regId: r.id,
        tournamentId: r.tournament!.id,
        name: r.tournament!.name ?? "Tournament",
        gameType: r.tournament!.game_type ?? null,
        date: r.tournament!.tournament_date ?? null,
        status: r.tournament!.status ?? null,
        liveState: r.tournament!.live_state ?? null,
        liveSettings: r.tournament!.live_settings ?? null,
      }));
  },

  // One registration by id (optional record -> maybeSingle).
  async getRegistration(id: number): Promise<Registration | null> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*, profiles:player_id (id_auto, user_name, name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Registration | null;
  },

  // Is this player already registered in this tournament? (optional record)
  async getPlayerRegistrationForTournament(
    tournamentId: number,
    playerId: number,
  ): Promise<Registration | null> {
    const { data, error } = await supabase
      .from("tournament_players")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Registration | null;
  },

  // ---- Player self-service ----------------------------------------------

  // A player registers themselves. Always enters as "preregistered".
  async register(registration: RegistrationInsert): Promise<Registration> {
    const { data, error } = await supabase
      .from("tournament_players")
      .insert({ ...registration, status: "preregistered" as RegistrationStatus })
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Registration;
  },

  // A player re-activates their OWN registration (e.g. after cancelling). The
  // (tournament_id, player_id) partial unique index blocks a second insert, so
  // re-registration flips the existing row back to preregistered. RLS allows a
  // player to update their own row.
  async reRegister(id: number): Promise<Registration> {
    const { data, error } = await supabase
      .from("tournament_players")
      .update({ status: "preregistered" as RegistrationStatus })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Re-register failed - no rows modified (possible RLS block).");
    return data as unknown as Registration;
  },

  // A player cancels their OWN preregistration (allowed until the lock window;
  // the UI enforces timing). Soft-cancel via status, preserving the row.
  async cancelOwnRegistration(id: number): Promise<Registration> {
    const { data, error } = await supabase
      .from("tournament_players")
      .update({ status: "cancelled" as RegistrationStatus })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Cancel failed - no rows modified (possible RLS block).");
    return data as unknown as Registration;
  },

  // ---- TD-only methods ---------------------------------------------------

  // TD adds a player (real account or guest) to a tournament.
  async addPlayer(registration: RegistrationInsert): Promise<Registration> {
    const { data, error } = await supabase
      .from("tournament_players")
      .insert(registration)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Registration;
  },

  // TD approves a registration.
  async approve(id: number): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      status: "approved" as RegistrationStatus,
    });
  },

  // TD approves a registration AND confirms the player's Fargo in one atomic
  // step (see migration 20260709120000_fargo_verification). This writes the
  // confirmed Fargo to the player's PROFILE as their verified rating, freezes a
  // per-event snapshot on the registration, and sets status = approved. Runs as
  // a SECURITY DEFINER RPC because the TD is writing another user's profile.
  async approveWithFargo(id: number, fargo: number): Promise<void> {
    const { error } = await supabase.rpc("approve_registration_with_fargo", {
      p_registration_id: id,
      p_fargo: fargo,
    });
    if (error) throw error;
  },

  // TD checks a player in (records the timestamp).
  async checkIn(id: number): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      status: "checked_in" as RegistrationStatus,
      checked_in_at: new Date().toISOString(),
    });
  },

  // TD marks a no-show (Phase 1 just records status; strikes deferred).
  async markNoShow(id: number): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      status: "no_show" as RegistrationStatus,
    });
  },

  // TD removes a registration from a tournament (status cancelled → filtered out of the
  // chip roster / bracket). Used by the chip "Remove Player" action for self-reg entries.
  async markCancelled(id: number): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      status: "cancelled" as RegistrationStatus,
    });
  },

  // TD sets the entered Fargo (or a starter rating when the player has none).
  async setFargo(
    id: number,
    fargoRating: number,
    isStarterRating: boolean,
  ): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      fargo_rating: fargoRating,
      is_starter_rating: isStarterRating,
    });
  },

  // TD records payment ticks at check-in.
  async setPayment(
    id: number,
    paidEntry: boolean,
    paidSidePots: string[],
  ): Promise<Registration> {
    return registrationService.updateRegistration(id, {
      paid_entry: paidEntry,
      paid_side_pots: paidSidePots,
    });
  },

  // TD sets / clears a self-registered player's Fargo-cap override (tournament_players).
  // Direct update (RLS lets the TD write). override=false clears the snapshot. The columns
  // aren't in the generated RegistrationUpdate type, so this writes them directly.
  async setFargoOverride(
    id: number,
    override: boolean,
    snap: { cap: number | null; rating: number | null; reason: string | null; notes: string | null; overriddenBy: string | null },
  ): Promise<void> {
    const updates = override
      ? {
          fargo_cap_override: true,
          fargo_cap_at_override: snap.cap,
          player_fargo_at_override: snap.rating,
          fargo_cap_override_reason: snap.reason,
          fargo_cap_override_notes: snap.notes,
          overridden_by: snap.overriddenBy,
          overridden_at: new Date().toISOString(),
        }
      : {
          fargo_cap_override: false,
          fargo_cap_at_override: null,
          player_fargo_at_override: null,
          fargo_cap_override_reason: null,
          fargo_cap_override_notes: null,
          overridden_by: null,
          overridden_at: null,
        };
    const { error } = await supabase.from("tournament_players").update(updates).eq("id", id);
    if (error) throw error;
  },

  // Generic TD update (used by the helpers above). .select().single() catches
  // silent RLS failures.
  async updateRegistration(
    id: number,
    updates: RegistrationUpdate,
  ): Promise<Registration> {
    const { data, error } = await supabase
      .from("tournament_players")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Update failed - no rows modified (possible RLS block).");
    return data as unknown as Registration;
  },
};