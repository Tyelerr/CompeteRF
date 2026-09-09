// src/models/services/team.service.ts
// Data access for team registration (tournament_teams / tournament_team_members)
// — see 20260709130000_tournament_teams.sql. Reads are RLS-scoped (a player sees
// their own team + invites; a TD sees all teams for their tournament). Every
// mutation is a SECURITY DEFINER RPC that enforces the rules server-side
// (duplicate prevention, captain-only controls, email lookup, locking).

import { supabase } from "../../lib/supabase";
import {
  InvitePartnerInput,
  TeamInvite,
  TeamInviteInfo,
  TournamentTeam,
} from "../types/team.types";
import { PlayerTournament } from "../types/registration.types";
import { reconcileSidePotMembership, safePaidSidePots } from "../../utils/side-pots";

// Team + its member slots, each with the linked profile (when an account).
const TEAM_SELECT =
  "*, members:tournament_team_members(*, profiles:player_id (id_auto, user_name, name, first_name, last_name, fargo, fargo_status))";

export const teamService = {
  // ---- Reads -------------------------------------------------------------

  // One team by id (with members). Optional record.
  async getTeam(teamId: number): Promise<TournamentTeam | null> {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(TEAM_SELECT)
      .eq("id", teamId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TournamentTeam | null;
  },

  // The team the given player is on for a tournament (captain OR accepted/pending
  // member), or null. Two-step so RLS on the member row does the scoping.
  async getMyTeam(
    tournamentId: number,
    playerId: number,
  ): Promise<TournamentTeam | null> {
    const { data: member, error } = await supabase
      .from("tournament_team_members")
      .select("team_id")
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .neq("invite_status", "declined")
      .maybeSingle();
    if (error) throw error;
    if (!member) return null;
    return teamService.getTeam((member as { team_id: number }).team_id);
  },

  // The player's team registrations, shaped like registrationService
  // .getPlayerTournaments so the profile "My Tournaments" list can treat a team
  // member exactly like a self-registered player. Team members (captain OR
  // invited partner who accepted) only ever have a tournament_team_members row —
  // never a tournament_players row — so without this an invited teammate would
  // never see the event on their profile. Only ACCEPTED memberships count; a
  // still-pending invite lives on the "you've been invited" surface, not here.
  // RLS lets a player read their own member rows, so this is safe for the
  // signed-in user's own profile.
  async getMyTeamRegistrations(playerId: number): Promise<PlayerTournament[]> {
    const { data, error } = await supabase
      .from("tournament_team_members")
      .select(
        "id, created_at, tournament:tournament_id (id, name, game_type, tournament_format, tournament_date, start_time, status, live_state, gameplay_started_at, thumbnail, venues:venue_id (venue, city, state))",
      )
      .eq("player_id", playerId)
      .eq("invite_status", "accepted")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? [])
      .filter((r) => (r as { tournament: unknown }).tournament != null)
      .map((r) => {
        const row = r as { id: number; created_at: string; tournament: unknown };
        return {
          id: row.id,
          status: "preregistered",
          registered_at: row.created_at,
          tournament: row.tournament,
        };
      }) as unknown as PlayerTournament[];
  },

  // A player's pending invites (member rows joined to team + tournament) for the
  // "you've been invited" surface.
  async getMyPendingInvites(playerId: number): Promise<TeamInvite[]> {
    const { data, error } = await supabase
      .from("tournament_team_members")
      .select(
        "id, team_id, tournament_id, invite_status, created_at, team:team_id (id, captain_id, status, profiles:captain_id (id_auto, user_name, name)), tournament:tournament_id (id, name, game_type, tournament_date)",
      )
      .eq("player_id", playerId)
      .eq("invite_status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as TeamInvite[];
  },

  // Resolve a shareable invite token to public invite info (used by the web
  // /join landing page — callable unauthenticated). Returns null if the RPC
  // returns nothing.
  async getInviteByToken(token: string): Promise<TeamInviteInfo | null> {
    const { data, error } = await supabase.rpc("get_team_invite_by_token", {
      p_token: token,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as TeamInviteInfo) ?? null;
  },

  // A team's shareable invite token. Lean read used by the TD chip-manage
  // "Invite Partner" action, which has the team id (from the roster) but not the
  // token (the roster RPC omits it). RLS on tournament_teams already permits this
  // read; no backend change. (See PENDING_ACCOUNTS_MIGRATION.md §O + the invite_token
  // exposure follow-up.)
  async getTeamInviteToken(teamId: number): Promise<string | null> {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select("invite_token")
      .eq("id", teamId)
      .maybeSingle();
    if (error) throw error;
    return (data as { invite_token: string | null } | null)?.invite_token ?? null;
  },

  // All teams for a tournament (TD manager view).
  async getTeams(tournamentId: number): Promise<TournamentTeam[]> {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(TEAM_SELECT)
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as TournamentTeam[];
  },

  // ---- Mutations (RPCs) --------------------------------------------------

  // Create a team; caller becomes captain. Returns the new team id.
  async createTeam(tournamentId: number, captainFargo: number | null): Promise<number> {
    const { data, error } = await supabase.rpc("create_team", {
      p_tournament_id: tournamentId,
      p_captain_fargo: captainFargo,
    });
    if (error) throw error;
    return data as number;
  },

  // Invite (or replace) the partner by contact only. username/email → pending
  // in-app invite to a real account; phone/unmatched → a non-account pending
  // invite. The partner self-reports their Fargo when they accept. Returns the
  // invited account's id_auto (or null for a non-account contact) so the caller
  // can notify that specific player.
  async invitePartner(teamId: number, input: InvitePartnerInput): Promise<number | null> {
    const { data, error } = await supabase.rpc("invite_team_partner", {
      p_team_id: teamId,
      p_method: input.method,
      p_value: input.value,
    });
    if (error) throw error;
    return (data as number | null) ?? null;
  },

  // Join a team from a shared invite link. The opener claims the open partner
  // slot with their own Fargo (validated server-side). Returns the team id.
  async joinByToken(token: string, fargo: number | null): Promise<number> {
    const { data, error } = await supabase.rpc("join_team_by_token", {
      p_token: token,
      p_fargo: fargo,
    });
    if (error) throw error;
    return data as number;
  },

  // The invited player accepts (with their own Fargo) or declines.
  async respondToInvite(
    teamId: number,
    accept: boolean,
    fargo?: number | null,
  ): Promise<void> {
    const { error } = await supabase.rpc("respond_to_team_invite", {
      p_team_id: teamId,
      p_accept: accept,
      p_fargo: fargo ?? null,
    });
    if (error) throw error;
  },

  // Captain clears the current partner slot (to re-invite). Blocked once locked.
  async cancelPartner(teamId: number): Promise<void> {
    const { error } = await supabase.rpc("cancel_team_partner", { p_team_id: teamId });
    if (error) throw error;
  },

  // Captain withdraws the whole team registration.
  async cancelTeam(teamId: number): Promise<void> {
    const { error } = await supabase.rpc("cancel_team", { p_team_id: teamId });
    if (error) throw error;
  },

  // ---- TD-only -----------------------------------------------------------

  // TD confirms a team member's Fargo → verified profile Fargo + event snapshot.
  async confirmMemberFargo(memberId: number, fargo: number): Promise<void> {
    const { error } = await supabase.rpc("confirm_team_member_fargo", {
      p_member_id: memberId,
      p_fargo: fargo,
    });
    if (error) throw error;
  },

  // TD/admin unlocks a locked team so the captain can change the partner.
  async unlockTeam(teamId: number): Promise<void> {
    const { error } = await supabase.rpc("unlock_team", { p_team_id: teamId });
    if (error) throw error;
  },

  // TD approves (or un-approves) a team — a distinct step after Fargo verification.
  async setTeamApproved(teamId: number, approved: boolean): Promise<void> {
    const { error } = await supabase.rpc("set_team_approved", {
      p_team_id: teamId,
      p_approved: approved,
    });
    if (error) throw error;
  },

  // TD sets a manual chip-count override for a team (null = auto from the chart).
  async setTeamChips(teamId: number, chips: number | null): Promise<void> {
    const { error } = await supabase.rpc("set_team_chips", { p_team_id: teamId, p_chips: chips });
    if (error) throw error;
  },

  // TD sets which side pots a team has entered (the full replacement list of
  // pot names). Mirrors tournament_players.paid_side_pots for the elim flow.
  async setTeamSidePots(teamId: number, pots: string[]): Promise<void> {
    const { error } = await supabase.rpc("set_team_side_pots", {
      p_team_id: teamId,
      p_pots: pots,
    });
    if (error) throw error;
  },

  // Reconcile EVERY team's side-pot membership after a Settings rename/remove (B4).
  // Reads the tournament's teams, applies the shared reconciler (keep valid, migrate
  // renames, drop removals) and rewrites only the changed teams via the authoritative
  // set_team_side_pots RPC (so RLS/authorization is enforced). Throws on the first error.
  async reconcileSidePots(
    tournamentId: number,
    renameMap: Record<string, string>,
    validNames: string[],
  ): Promise<void> {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select("id, paid_side_pots")
      .eq("tournament_id", tournamentId);
    if (error) throw error;
    for (const row of (data ?? []) as { id: number; paid_side_pots: unknown }[]) {
      const cur = safePaidSidePots(row.paid_side_pots);
      const next = reconcileSidePotMembership(cur, renameMap, validNames);
      if (next.length !== cur.length || next.some((n, i) => n !== cur[i])) {
        const { error: e2 } = await supabase.rpc("set_team_side_pots", {
          p_team_id: row.id,
          p_pots: next,
        });
        if (e2) throw e2;
      }
    }
  },

  // TD checks a team in / out. Persisted on the team so it survives roster
  // reloads (was previously local-only and lost whenever the roster reloaded).
  async setTeamCheckedIn(teamId: number, checkedIn: boolean): Promise<void> {
    const { error } = await supabase.rpc("set_team_checked_in", {
      p_team_id: teamId,
      p_checked_in: checkedIn,
    });
    if (error) throw error;
  },

  // TD marks a team paid / unpaid (persisted, survives roster reloads).
  async setTeamPaid(teamId: number, paid: boolean): Promise<void> {
    const { error } = await supabase.rpc("set_team_paid", {
      p_team_id: teamId,
      p_paid: paid,
    });
    if (error) throw error;
  },

  // TD sets / clears a team's Fargo-cap override (tournament_teams). override=false clears
  // the whole snapshot. overridden_by/at are stamped server-side (auth.uid() / now()).
  async setTeamFargoOverride(
    teamId: number,
    override: boolean,
    snap: { cap: number | null; rating: number | null; reason: string | null; notes: string | null },
  ): Promise<void> {
    const { error } = await supabase.rpc("set_team_fargo_override", {
      p_team_id: teamId,
      p_override: override,
      p_cap: snap.cap,
      p_rating: snap.rating,
      p_reason: snap.reason,
      p_notes: snap.notes,
    });
    if (error) throw error;
  },

  // TD removes one player from a team (partner → team needs a new partner;
  // captain → the whole team is removed).
  async removeTeamMember(memberId: number): Promise<void> {
    const { error } = await supabase.rpc("td_remove_team_member", { p_member_id: memberId });
    if (error) throw error;
  },

  // TD creates a real team with the chosen player as captain (returns team id).
  async tdCreateTeam(tournamentId: number, captainPlayerId: number, fargo: number | null): Promise<number> {
    const { data, error } = await supabase.rpc("td_create_team", {
      p_tournament_id: tournamentId,
      p_captain_player_id: captainPlayerId,
      p_fargo: fargo,
    });
    if (error) throw error;
    return data as number;
  },

  // TD adds/replaces the partner on a team (a real, verifiable member).
  async addTeamMember(teamId: number, playerId: number, fargo: number | null): Promise<void> {
    const { error } = await supabase.rpc("td_add_team_member", {
      p_team_id: teamId,
      p_player_id: playerId,
      p_fargo: fargo,
    });
    if (error) throw error;
  },
};
