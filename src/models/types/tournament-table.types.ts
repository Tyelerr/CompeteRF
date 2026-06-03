// src/models/types/tournament-table.types.ts
// Mirrors the `tournament_tables` table (Phase 0 schema).
// A table is a physical playing surface owned by a tournament. The TD manages
// them; status drives the Overview "available / unavailable" metrics and (in
// Phase 2) which table a live match is bound to.

import { TableStatus } from "./common.types";

export interface TournamentTable {
  id: number;
  tournament_id: number;
  table_number: number;
  label?: string | null;
  status: TableStatus;
  match_id?: number | null; // bound match (Phase 2); null when free
  created_at: string;
  updated_at: string;
}

// Required: tournament_id + table_number. DB defaults fill status/timestamps.
export interface TournamentTableInsert {
  tournament_id: number;
  table_number: number;
  label?: string | null;
  status?: TableStatus;
  match_id?: number | null;
}

export interface TournamentTableUpdate {
  table_number?: number;
  label?: string | null;
  status?: TableStatus;
  match_id?: number | null;
}
