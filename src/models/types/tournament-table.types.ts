// src/models/types/tournament-table.types.ts
// Mirrors the `tournament_tables` table. A table is a physical playing surface
// owned by a tournament. The TD adds them (singly or in bulk), takes them in/out
// of service, and can flag a table as a streaming table with a stream link.

import { TableStatus } from "./common.types";

export interface TournamentTable {
  id: number;
  tournament_id: number;
  table_number: number;
  label?: string | null;
  status: TableStatus;
  is_streaming: boolean;
  stream_link?: string | null;
  match_id?: number | null; // bound match (Phase 2); null when free
  created_at: string;
  updated_at: string;
}

// Required: tournament_id + table_number. DB defaults fill status/flags/timestamps.
export interface TournamentTableInsert {
  tournament_id: number;
  table_number: number;
  label?: string | null;
  status?: TableStatus;
  is_streaming?: boolean;
  stream_link?: string | null;
  match_id?: number | null;
}

export interface TournamentTableUpdate {
  table_number?: number;
  label?: string | null;
  status?: TableStatus;
  is_streaming?: boolean;
  stream_link?: string | null;
  match_id?: number | null;
}
