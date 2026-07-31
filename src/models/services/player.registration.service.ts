// src/models/services/player.registration.service.ts
// Data access for the unified Add Player / Add Team flow (Phase 5 — pending
// accounts). Every method is a thin wrapper over a SECURITY DEFINER RPC applied
// in 20260805120000_phase5_pending_accounts_registration.sql — the RPCs enforce
// authorization (tournament manager) and all the rules (dedup, one-team-per-player,
// verified-email claim) server-side. Screens/hooks call these, never supabase directly.
//
// Identity is the STABLE players.id UUID throughout. profiles.id_auto never appears.

import { supabase } from "../../lib/supabase";
import {
  CreatePendingInput,
  CreatePendingResult,
  InvitationStatus,
  IssuedInvitation,
  PendingPlayerEditFields,
  PlayerSearchResult,
  RosterPlayerDisplay,
  UpdatePendingInput,
  UpdatePendingResult,
} from "../types/player.registration.types";

export const playerRegistrationService = {
  // ---- Search -----------------------------------------------------------

  // Unified ACTIVE + PENDING search. Returns [] for queries under 2 chars
  // (the RPC short-circuits). Masked email, no phone.
  async searchPlayers(
    tournamentId: number,
    query: string,
    limit = 20,
  ): Promise<PlayerSearchResult[]> {
    const { data, error } = await supabase.rpc(
      "search_players_for_registration",
      { p_tournament_id: tournamentId, p_query: query, p_limit: limit },
    );
    if (error) throw error;
    return (data ?? []) as PlayerSearchResult[];
  },

  // Recent players the caller has registered (across tournaments they manage),
  // excluding anyone already on this tournament. Powers the pre-typing list.
  async getRecentPlayers(
    tournamentId: number,
    limit = 10,
  ): Promise<PlayerSearchResult[]> {
    const { data, error } = await supabase.rpc(
      "get_recent_players_for_registration",
      { p_tournament_id: tournamentId, p_limit: limit },
    );
    if (error) throw error;
    return (data ?? []) as PlayerSearchResult[];
  },

  // Display info (name/status/avatar/fargo — no email/phone) for every
  // uuid-registered player in a tournament. Used to render PENDING players in the
  // roster, since the players table is RLS-locked (no PostgREST embed).
  async getRegistrationDisplay(
    tournamentId: number,
  ): Promise<RosterPlayerDisplay[]> {
    const { data, error } = await supabase.rpc(
      "get_registration_players_display",
      { p_tournament_id: tournamentId },
    );
    if (error) throw error;
    return (data ?? []) as RosterPlayerDisplay[];
  },

  // ---- Create / reuse a pending player ----------------------------------

  // Find-or-create by normalized email. Reuses an existing ACTIVE/PENDING player
  // (never duplicates or overwrites); rejects DISABLED. Returns a structured
  // outcome (CREATED_PENDING | MATCHED_PENDING | MATCHED_ACTIVE).
  async createPendingPlayer(
    input: CreatePendingInput,
  ): Promise<CreatePendingResult> {
    const { data, error } = await supabase.rpc("create_pending_player", {
      p_tournament_id: input.tournamentId,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
      p_phone: input.phone ?? null,
    });
    if (error) throw error;
    // RETURNS TABLE -> array with a single row.
    const row = (Array.isArray(data) ? data[0] : data) as CreatePendingResult;
    if (!row) throw new Error("create_pending_player returned no row");
    return row;
  },

  // Raw contact fields of a PENDING player, for prefilling the edit form. Manager-
  // gated + tournament-scoped server-side; returns null if not editable/among this
  // tournament. Never log the returned email/phone in analytics or console.
  async getPendingPlayer(
    tournamentId: number,
    playerId: string,
  ): Promise<PendingPlayerEditFields | null> {
    const { data, error } = await supabase.rpc("get_pending_player", {
      p_tournament_id: tournamentId,
      p_player_id: playerId,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | PendingPlayerEditFields
      | undefined;
    return row ?? null;
  },

  // Edit a PENDING player's contact fields on the same players.id. Structured outcome
  // (UPDATED | EMAIL_BELONGS_TO_ACTIVE_PLAYER | EMAIL_BELONGS_TO_PENDING_PLAYER); never
  // merges/deletes on collision.
  async updatePendingPlayer(
    input: UpdatePendingInput,
  ): Promise<UpdatePendingResult> {
    const { data, error } = await supabase.rpc("update_pending_player", {
      p_tournament_id: input.tournamentId,
      p_player_id: input.playerId,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
      p_phone: input.phone ?? null,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as UpdatePendingResult;
    if (!row) throw new Error("update_pending_player returned no row");
    return row;
  },

  // ---- Registration (singles) -------------------------------------------

  // Register an ACTIVE or PENDING player into a tournament by players.id.
  // Idempotent; returns the tournament_players row id.
  async registerPlayer(
    tournamentId: number,
    playerId: string,
    fargo?: number | null,
    status: string = "approved",
  ): Promise<number> {
    const { data, error } = await supabase.rpc(
      "register_player_for_tournament",
      {
        p_tournament_id: tournamentId,
        p_player_id: playerId,
        p_fargo: fargo ?? null,
        p_status: status,
      },
    );
    if (error) throw error;
    return data as number;
  },

  // ---- Team build --------------------------------------------------------

  // Create a team with the chosen captain (ACTIVE or PENDING). Captain-only team
  // is 'pending_partner' (waiting-for-teammate). Returns the team id.
  async createTeam(
    tournamentId: number,
    captainPlayerId: string,
    fargo: number | null,
  ): Promise<number> {
    const { data, error } = await supabase.rpc("td_create_team_by_uuid", {
      p_tournament_id: tournamentId,
      p_captain_player_id: captainPlayerId,
      p_fargo: fargo,
    });
    if (error) throw error;
    return data as number;
  },

  // Add / replace the partner on an existing team by players.id.
  async addTeamMember(
    teamId: number,
    playerId: string,
    fargo: number | null,
  ): Promise<void> {
    const { error } = await supabase.rpc("td_add_team_member_by_uuid", {
      p_team_id: teamId,
      p_player_id: playerId,
      p_fargo: fargo,
    });
    if (error) throw error;
  },

  // Set (or clear, when blank) a team's display name. Manager-gated server-side.
  async setTeamName(teamId: number, name: string): Promise<void> {
    const { error } = await supabase.rpc("set_team_name", {
      p_team_id: teamId,
      p_name: name,
    });
    if (error) throw error;
  },

  // ---- Invitations (token rules only; email delivery is a separate service) --

  // Create/refresh a pending player's activation token. Returns the RAW token
  // ONCE (for the email edge function to embed). Rate-limited server-side.
  async issueInvitation(
    playerId: string,
    tournamentId: number,
    ttlHours = 168,
  ): Promise<IssuedInvitation> {
    const { data, error } = await supabase.rpc("issue_player_invitation", {
      p_player_id: playerId,
      p_tournament_id: tournamentId,
      p_ttl_hours: ttlHours,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as IssuedInvitation;
    if (!row) throw new Error("issue_player_invitation returned no row");
    return row;
  },

  async revokeInvitation(playerId: string, tournamentId: number): Promise<void> {
    const { error } = await supabase.rpc("revoke_player_invitation", {
      p_player_id: playerId,
      p_tournament_id: tournamentId,
    });
    if (error) throw error;
  },

  async getInvitationStatus(
    playerId: string,
  ): Promise<InvitationStatus | null> {
    const { data, error } = await supabase.rpc("get_player_invitation_status", {
      p_player_id: playerId,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | InvitationStatus
      | undefined;
    return row ?? null;
  },

  // ---- Claim (activation) ------------------------------------------------

  // Links the caller's verified-email player to their profile (idempotent).
  // Safe to call on every session hydration; returns the linked players.id.
  async claimPendingPlayer(): Promise<string | null> {
    const { data, error } = await supabase.rpc("claim_pending_player");
    if (error) throw error;
    return (data as string) ?? null;
  },
};
