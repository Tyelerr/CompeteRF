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
        "id, status, registered_at, tournament:tournament_id (id, name, game_type, tournament_date, start_time, status, live_state, thumbnail, venues:venue_id (venue, city, state))",
      )
      .eq("player_id", playerId)
      .order("registered_at", { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as PlayerTournament[];
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