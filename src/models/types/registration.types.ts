// src/models/types/registration.types.ts
// Mirrors the `tournament_players` table (Phase 0 schema).
// A registration links a tournament to either a real player (player_id ->
// profiles.id_auto) OR a guest (guest_name, no account). One of the two must
// be present (enforced by a DB check constraint).

import { RegistrationStatus } from "./common.types";

export interface Registration {
  id: number;
  tournament_id: number;
  player_id?: number | null;        // null for guests
  guest_name?: string | null;       // used when player_id is null
  status: RegistrationStatus;
  queue_position?: number | null;
  seed?: number | null;
  fargo_rating?: number | null;
  is_starter_rating: boolean;       // TD assigned a starting rating (no Fargo yet)
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
  paid_entry?: boolean;
  paid_side_pots?: string[];
}

export interface RegistrationUpdate {
  status?: RegistrationStatus;
  queue_position?: number | null;
  seed?: number | null;
  fargo_rating?: number | null;
  is_starter_rating?: boolean;
  paid_entry?: boolean;
  paid_side_pots?: string[];
  checked_in_at?: string | null;
}