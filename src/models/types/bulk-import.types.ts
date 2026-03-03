// ─── Bulk Import Types ───────────────────────────────────────────────────────
// src/models/types/bulk-import.types.ts

/** A single row parsed from the CSV file */
export interface BulkTournamentRow {
  rowNumber: number;
  venue_id: number;
  director_id: number;
  name: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  entry_fee?: number | null;
  added_money?: number | null;
  game_spot?: string | null;
  race?: string | null;
  table_size?: string | null;
  equipment?: string | null;
  number_of_tables?: number | null;
  max_fargo?: number | null;
  required_fargo_games?: number | null;
  reports_to_fargo?: boolean;
  open_tournament?: boolean;
  calcutta?: boolean;
  phone_number?: string | null;
  description?: string | null;
  timezone?: string;
  side_pots?: any | null;
  chip_ranges?: any | null;
  thumbnail?: string | null;
  recurring_flag?: string | null; // NOT imported — reference only
}

/** Validation result for a single row */
export interface RowValidationResult {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  data?: BulkTournamentRow;
}

/** Overall import state */
export interface BulkImportState {
  phase: "idle" | "parsing" | "validated" | "importing" | "complete";
  fileName: string | null;
  totalRows: number;
  validRows: RowValidationResult[];
  errorRows: RowValidationResult[];
  importedCount: number;
  failedDuringImport: { rowNumber: number; error: string }[];
  currentRow: number;
}

/** Initial state */
export const INITIAL_BULK_IMPORT_STATE: BulkImportState = {
  phase: "idle",
  fileName: null,
  totalRows: 0,
  validRows: [],
  errorRows: [],
  importedCount: 0,
  failedDuringImport: [],
  currentRow: 0,
};

/** Valid game types — must match your app's game type options */
export const VALID_GAME_TYPES = [
  "8 Ball",
  "9 Ball",
  "10 Ball",
  "One Pocket",
  "Straight Pool",
  "Banks",
  "8 Ball Scotch Doubles",
  "9 Ball Scotch Doubles",
  "10 Ball Scotch Doubles",
];

/** Valid tournament formats */
export const VALID_FORMATS = [
  "single-elimination",
  "double-elimination",
  "round-robin",
  "chip-tournament",
];
