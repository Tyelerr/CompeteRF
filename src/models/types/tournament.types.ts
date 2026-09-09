import {
  ChipRange,
  GameType,
  RecurrenceType,
  SidePot,
  TableSize,
  TournamentFormat,
  TournamentLiveState,
  TournamentStatus,
} from "./common.types";
import { TournamentLiveSettings } from "./tournament-settings.types";

export interface Tournament {
  id: number;
  venue_id: number;
  director_id: number;
  template_id?: number;
  name: string;
  description?: string;
  description_es?: string;
  game_type: GameType;
  tournament_format: TournamentFormat;
  game_spot?: string;
  race?: string;
  table_size?: TableSize;
  equipment?: string;
  number_of_tables?: number;
  tournament_date: string;
  start_time: string;
  timezone: string;
  entry_fee?: number;
  added_money?: number;
  side_pots?: SidePot[];
  max_fargo?: number;
  required_fargo_games?: number;
  reports_to_fargo: boolean;
  calcutta: boolean;
  open_tournament: boolean;
  phone_number?: string;
  contact_name?: string;       // public contact person (defaults to director's name)
  thumbnail?: string;
  is_recurring: boolean;
  recurrence_type?: string;    // weekly | biweekly | monthly (for recurring listings)
  is_hidden?: boolean;         // App Store compliance: soft-hide
  is_draft?: boolean;          // brand-new, unsaved tournament — hidden until first save
  // Chip Tournament data
  chip_ranges?: ChipRange[];
  status: TournamentStatus;
  // 'compete' = run on the live bracket engine; 'external' = run in other
  // software and just listed here, with external_bracket_url for "View Bracket".
  bracket_source?: "compete" | "external";
  external_bracket_url?: string;
  // Live-engine runtime state (Phase 0 columns; separate from `status`).
  live_state?: TournamentLiveState;
  is_paused?: boolean;
  paused_at?: string | null;
  current_round?: number;
  // Live-engine setup choices without dedicated columns (JSONB blob).
  live_settings?: TournamentLiveSettings;
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: number;
  created_at: string;
  updated_at: string;
  // When the tournament finished (status → completed). Drives the 30-day
  // retention clock before it auto-moves to Archived.
  completed_at?: string;
  archived_at?: string;
  archived_by?: number;
  // Computed (attached by viewmodels): active registration count for status badges.
  registered_count?: number;
  // Joined data (from queries)
  venues?: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    phone?: string;
  };
  profiles?: {
    id_auto: number;
    user_name: string;
    name: string;
  };
}

export interface TournamentTemplate {
  id: number;
  venue_id: number;
  director_id: number;
  name: string;
  description?: string;
  description_es?: string;
  game_type: GameType;
  tournament_format: TournamentFormat;
  game_spot?: string;
  race?: string;
  table_size?: TableSize;
  equipment?: string;
  number_of_tables?: number;
  entry_fee?: number;
  added_money?: number;
  side_pots?: SidePot[];
  max_fargo?: number;
  required_fargo_games?: number;
  reports_to_fargo: boolean;
  calcutta: boolean;
  open_tournament: boolean;
  phone_number?: string;
  thumbnail?: string;
  // Chip Tournament data
  chip_ranges?: ChipRange[];
  recurrence_type: RecurrenceType;
  recurrence_day: string;
  recurrence_week?: number;
  start_time: string;
  series_start_date: string;
  series_end_date?: string;
  horizon_days: number;
  status: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: number;
}

export interface TournamentTemplateUser {
  id: number;
  user_id: number;
  name: string;
  game_type?: GameType;
  tournament_format?: TournamentFormat;
  game_spot?: string;
  race?: string;
  description?: string;
  max_fargo?: number;
  required_fargo_games?: number;
  entry_fee?: number;
  added_money?: number;
  side_pots?: SidePot[];
  reports_to_fargo: boolean;
  calcutta: boolean;
  open_tournament: boolean;
  table_size?: TableSize;
  number_of_tables?: number;
  equipment?: string;
  thumbnail?: string;
  // Chip Tournament data
  chip_ranges?: ChipRange[];
  created_at: string;
  updated_at: string;
}

export interface Favorite {
  id: number;
  user_id: number;
  tournament_id?: number;
  template_id?: number;
  favorite_type: "single" | "series";
  created_at: string;
}

export interface TournamentFilters {
  state?: string;
  city?: string;
  zipCode?: string;
  radius?: number;
  gameType?: GameType;
  tournamentFormat?: TournamentFormat;
  tableSize?: TableSize;
  equipment?: string;
  daysOfWeek?: string[];
  dateFrom?: string;
  dateTo?: string;
  entryFeeMin?: number;
  entryFeeMax?: number;
  fargoMin?: number;
  fargoMax?: number;
  reportsToFargo?: boolean;
  calcutta?: boolean;
  openTournament?: boolean;
  // Status → Completed browse (item 35): "completed" returns completed tournaments from
  // ~the last 90 days instead of the default upcoming/live + 8-day-completed feed.
  status?: "" | "completed";
}
