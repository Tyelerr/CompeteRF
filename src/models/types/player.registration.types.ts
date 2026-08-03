// src/models/types/player.registration.types.ts
// Types for the unified Add Player / Add Team flow (Phase 5 — pending accounts).
// Everything here is keyed on the STABLE players.id UUID, not profiles.id_auto.
// See supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql
// and PHASE5_REVIEW.md.

export type PlayerAccountStatus = "ACTIVE" | "PENDING" | "DISABLED";

// One search / recent-player result. Shape is identical for ACTIVE and PENDING
// players so the UI renders a single row component. email is MASKED (privacy);
// exact matching happens server-side on the normalized email. No phone.
export interface PlayerSearchResult {
  player_id: string; // players.id (uuid) — the stable identity used everywhere
  id_auto: number | null; // profiles.id_auto (ACTIVE only; NULL for PENDING). Needed by
  // the chip Singles add so an ACTIVE player still writes chip_entries.p1_profile_id.
  account_status: PlayerAccountStatus;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email_masked: string | null; // e.g. "j***@g***.com"
  username: string | null; // profiles.user_name (ACTIVE only)
  avatar_url: string | null; // profiles.avatar_url (ACTIVE only)
  fargo: number | null; // profile Fargo value (ACTIVE only)
  // Identity/disambiguation extras (surfaced by the search + recents RPCs). Optional
  // so the client renders gracefully before the RPC extension is applied.
  fargo_status?: "verified" | "unverified" | null; // distinguishes ✓ vs Needs Verification
  home_city?: string | null; // profiles.home_city
  home_state?: string | null; // profiles.home_state
  is_registered: boolean; // already on THIS tournament as a player (singles)
  on_team: boolean; // already on a (non-declined) team in THIS tournament (doubles)
  team_name: string | null; // that team's custom name, if any
}

// Structured outcome of create_pending_player — lets the UI distinguish a fresh
// create from a reuse without guessing.
export type CreatePendingOutcome =
  | "CREATED_PENDING"
  | "MATCHED_PENDING"
  | "MATCHED_ACTIVE";

export interface CreatePendingResult {
  player_id: string;
  outcome: CreatePendingOutcome;
  account_status: PlayerAccountStatus;
  display_name: string;
  email_masked: string | null;
}

export interface CreatePendingInput {
  tournamentId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

// Edit of an existing PENDING player (attached to the tournament, manager-gated).
export type UpdatePendingOutcome =
  | "UPDATED"
  | "EMAIL_BELONGS_TO_ACTIVE_PLAYER"
  | "EMAIL_BELONGS_TO_PENDING_PLAYER";

export interface UpdatePendingResult {
  player_id: string; // on collision this is the OTHER (existing) player's id
  outcome: UpdatePendingOutcome;
  account_status: PlayerAccountStatus;
  display_name: string;
  email_masked: string | null;
}

export interface UpdatePendingInput {
  tournamentId: number;
  playerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

// Raw fields for prefilling the edit form (manager-gated getter; PENDING only).
export interface PendingPlayerEditFields {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

// Roster display resolver row (get_registration_players_display). Lets a screen
// render PENDING players by name despite the RLS-locked players table. No email/phone.
export interface RosterPlayerDisplay {
  player_id: string;
  account_status: PlayerAccountStatus;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  fargo: number | null;
}

export type InvitationState =
  | "sent"
  | "accepted"
  | "superseded"
  | "expired"
  | "revoked";

export interface InvitationStatus {
  state: InvitationState;
  sent_at: string;
  expires_at: string;
}

export interface IssuedInvitation {
  token: string; // raw token — returned once, for the email service only
  expires_at: string;
}
