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
  account_status: PlayerAccountStatus;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email_masked: string | null; // e.g. "j***@g***.com"
  username: string | null; // profiles.user_name (ACTIVE only)
  avatar_url: string | null; // profiles.avatar_url (ACTIVE only)
  fargo: number | null; // verified profile Fargo (ACTIVE only)
  is_registered: boolean; // already on THIS tournament (non-cancelled)
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
