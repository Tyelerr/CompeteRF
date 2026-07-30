// src/models/types/registration.types.ts
// Mirrors the `tournament_players` table (Phase 0 schema).
// A registration links a tournament to either a real player (player_id ->
// profiles.id_auto) OR a guest (guest_name, no account). One of the two must
// be present (enforced by a DB check constraint).

import { RegistrationStatus } from "./common.types";

export interface Registration {
  id: number;
  tournament_id: number;
  player_id?: number | null;        // legacy id_auto; null for guests AND pending players
  // Phase 5: stable players.id. Set for ACTIVE (dual-written) and PENDING
  // registrations; null for name-only guests. The identity source of truth.
  player_uuid?: string | null;
  guest_name?: string | null;       // used when player_id AND player_uuid are null
  status: RegistrationStatus;
  queue_position?: number | null;
  seed?: number | null;
  fargo_rating?: number | null;
  is_starter_rating: boolean;       // TD assigned a starting rating (no Fargo yet)
  // Immutable snapshot of the Fargo confirmed for THIS event at approval. Does
  // NOT change if the player's profile Fargo later changes.
  fargo_at_registration?: number | null;
  race_override?: number | null;    // TD-set race-to that overrides group/Fargo logic
  paid_entry: boolean;
  paid_side_pots: string[];         // names of side pots the player bought into
  registered_at: string;
  checked_in_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data (from queries)
  profiles?: {
    id_auto: number;
    user_name: string;
    name: string;
  };
}

// Required: tournament_id + an identity (player_id OR guest_name).
// Everything else is optional; DB defaults fill status/paid flags/timestamps.
export interface RegistrationInsert {
  tournament_id: number;
  player_id?: number | null;
  guest_name?: string | null;
  status?: RegistrationStatus;
  queue_position?: number | null;
  seed?: number | null;
  fargo_rating?: number | null;
  is_starter_rating?: boolean;
  race_override?: number | null;
  paid_entry?: boolean;
  paid_side_pots?: string[];
}

// A player's registration joined to its tournament + venue (profile tabs).
export interface PlayerTournament {
  id: number; // registration id
  status: RegistrationStatus;
  registered_at: string;
  tournament: {
    id: number;
    name: string;
    game_type: string;
    tournament_format?: string | null; // e.g. "single-elimination", "chip-tournament"
    tournament_date: string;
    start_time?: string | null;
    status: string; // tournament status (active/completed/archived/...)
    live_state?: string | null; // not_started/registration_open/in_progress/finished
    thumbnail?: string | null;
    venues?: { venue: string; city: string; state: string } | null;
  } | null;
}

export interface RegistrationUpdate {
  status?: RegistrationStatus;
  queue_position?: number | null;
  seed?: number | null;
  fargo_rating?: number | null;
  fargo_at_registration?: number | null;
  is_starter_rating?: boolean;
  race_override?: number | null;
  paid_entry?: boolean;
  paid_side_pots?: string[];
  checked_in_at?: string | null;
}