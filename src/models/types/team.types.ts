// src/models/types/team.types.ts
// Team registration for team formats (Scotch Doubles now; generalizes to
// 3-/N-person). A captain creates a team and invites a partner by a specific
// contact — never by browsing a public player list. Mirrors the tables in
// 20260709130000_tournament_teams.sql. All mutations go through the RPCs exposed
// by teamService (which enforce the rules server-side).

export type TeamStatus = "pending_partner" | "registered" | "unverified";
export type TeamMemberRole = "captain" | "member";
export type TeamInviteStatus = "pending" | "accepted" | "declined";
export type TeamInviteMethod = "username" | "email" | "phone";

// A member slot on a team: the captain, an invited real account, or a temp
// (non-account) partner the TD must confirm.
export interface TeamMember {
  id: number;
  team_id: number;
  tournament_id: number;
  player_id?: number | null; // profiles.id_auto; null for a temp partner
  role: TeamMemberRole;
  invite_status: TeamInviteStatus;
  invite_method?: TeamInviteMethod | null;
  invite_value?: string | null; // raw contact used for the invite
  temp_name?: string | null; // non-account partner name
  suggested_fargo?: number | null; // hint entered at registration
  is_verified: boolean; // real account + accepted
  fargo_at_registration?: number | null; // TD-confirmed per-event snapshot
  created_at: string;
  updated_at: string;
  // Joined profile (when player_id is set)
  profiles?: {
    id_auto: number;
    user_name: string;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    fargo?: number | null;
    fargo_status?: string | null;
  } | null;
}

export interface TournamentTeam {
  id: number;
  tournament_id: number;
  captain_id: number; // profiles.id_auto
  name?: string | null;
  status: TeamStatus;
  team_size: number;
  locked: boolean;
  approved?: boolean; // TD-approved (distinct step after Fargo verification)
  chip_override?: number | null; // TD manual chip-count override
  paid_side_pots?: string[] | null; // side-pot names this team entered
  invite_token?: string | null; // for the shareable HTTPS invite link
  created_at: string;
  updated_at: string;
  members?: TeamMember[];
}

// Public invite info resolved from a token (for the web /join landing page).
export interface TeamInviteInfo {
  team_id: number | null;
  tournament_id: number | null;
  tournament_name: string | null;
  captain_name: string | null;
  captain_fargo: number | null;
  team_status: TeamStatus | null;
  is_valid: boolean;
  reason: string | null;
}

// A player's pending invite (member row joined to its team + tournament) for the
// "you've been invited" surface.
export interface TeamInvite {
  id: number; // member row id
  team_id: number;
  tournament_id: number;
  invite_status: TeamInviteStatus;
  created_at: string;
  team?: {
    id: number;
    captain_id: number;
    status: TeamStatus;
    profiles?: { id_auto: number; user_name: string; name: string } | null; // captain
  } | null;
  tournament?: {
    id: number;
    name: string;
    game_type?: string | null;
    tournament_date?: string | null;
  } | null;
}

// Args for inviting/replacing the partner. The captain provides only the
// contact — the partner self-reports their own Fargo when they accept.
export interface InvitePartnerInput {
  method: TeamInviteMethod;
  value: string; // username, email, or phone
}
