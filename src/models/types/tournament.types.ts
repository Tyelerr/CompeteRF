import {
  GameType,
  RecurrenceType,
  SidePot,
  TableSize,
  TournamentFormat,
  TournamentStatus,
} from "./common.types";

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
  open_tournament: boolean;
  phone_number?: string;
  thumbnail?: string;
  is_recurring: boolean;
  status: TournamentStatus;
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: number;
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
  open_tournament: boolean;
  phone_number?: string;
  thumbnail?: string;
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
  open_tournament: boolean;
  table_size?: TableSize;
  number_of_tables?: number;
  equipment?: string;
  thumbnail?: string;
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
  openTournament?: boolean;
}
