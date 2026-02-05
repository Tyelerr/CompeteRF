// Filter criteria types
export interface SearchAlertFilterCriteria {
  // Game and tournament settings
  gameType?: string;
  tournamentFormat?: string;
  tableSize?: string;
  equipment?: string;
  
  // Fee and skill constraints
  entryFeeMin?: number;
  entryFeeMax?: number;
  fargoMax?: number;
  
  // Boolean flags
  reportsToFargo?: boolean;
  openTournament?: boolean;
  
  // Location
  state?: string;
  city?: string;
  
  // Date constraints
  dateFrom?: string;
  dateTo?: string;
  daysOfWeek?: string[];
  
  // Legacy properties (keep for backward compatibility)
  game_types?: string[];
  states?: string[];
  cities?: string[];
  venues?: string[];
  entry_fee_min?: number;
  entry_fee_max?: number;
  date_range_start?: string;
  date_range_end?: string;
  keywords?: string[];
}

// Alias for the screen that expects SearchAlertFilters
export type SearchAlertFilters = SearchAlertFilterCriteria;

// Main search alert interface
export interface SearchAlert {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  filter_criteria: SearchAlertFilterCriteria;
  is_active: boolean;
  match_count: number;
  last_match_date?: string;
  created_at: string;
  updated_at: string;
}

// Alias for SearchAlert (used in some places)
export type Alert = SearchAlert;

// Create search alert parameters (what the service expects)
export interface CreateSearchAlertRequest {
  name: string;
  description?: string;
  filter_criteria: SearchAlertFilterCriteria;
  is_active?: boolean;
}

// Legacy alias
export interface CreateSearchAlertParams extends CreateSearchAlertRequest {}

// Update search alert parameters (what the service expects)
export interface UpdateSearchAlertRequest {
  name?: string;
  description?: string;
  filter_criteria?: SearchAlertFilterCriteria;
  is_active?: boolean;
}

// Legacy alias
export interface UpdateSearchAlertParams extends UpdateSearchAlertRequest {}

// Alert match interface
export interface AlertMatch {
  id: number;
  alert_id: number;
  tournament_id: number;
  created_at: string;
  notified_at?: string;
  // Tournament data (joined from tournaments table)
  tournament?: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    start_time?: string;
    entry_fee?: number;
    venues?: {
      venue: string;
      city: string;
      state: string;
    };
  };
  // Alternative tournament data structure (your database uses plural)
  tournaments?: {
    id: number;
    name: string;
    game_type: string;
    tournament_date: string;
    start_time?: string;
    entry_fee?: number;
    venues?: {
      venue: string;
      city: string;
      state: string;
    };
  };
}

// Search alert list response
export interface SearchAlertsResponse {
  data: SearchAlert[];
  total: number;
}

// Alert matches response
export interface AlertMatchesResponse {
  data: AlertMatch[];
  total: number;
}

// Game type options for dropdowns
export const GAME_TYPE_OPTIONS = [
  "8-ball",
  "9-ball", 
  "10-ball",
  "8 Ball",
  "9 Ball",
  "10 Ball",
  "8 Ball Scotch Doubles",
  "9 Ball Scotch Doubles", 
  "10 Ball Scotch Doubles",
  "Straight Pool",
  "One Pocket",
  "Banks",
  "Rotation"
] as const;

export type GameType = typeof GAME_TYPE_OPTIONS[number];

// State options for dropdowns
export const STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
] as const;

export type StateCode = typeof STATE_OPTIONS[number];
