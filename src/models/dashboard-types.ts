export interface DashboardStats {
  myTournaments: number;
  activeEvents: number;
  venues: number;
  totalFavorites: number;
  totalViews: number;
}

export interface VenueWithStats {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  activeTournaments: number;
  totalFavorites: number;
}

export interface TournamentWithStats {
  id: number;
  name: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string;
  start_time: string;
  status: string;
  venue_name: string;
  favorites_count: number;
  views_count: number;
}

export interface EventTypeStats {
  game_type: string;
  count: number;
}

export interface TimePeriod {
  label: string;
  value: string;
  days: number | null; // null = lifetime
}

export const TIME_PERIODS: TimePeriod[] = [
  { label: "Last 7 Days", value: "7d", days: 7 },
  { label: "Last 30 Days", value: "30d", days: 30 },
  { label: "Last 90 Days", value: "90d", days: 90 },
  { label: "This Year", value: "year", days: 365 },
  { label: "Lifetime", value: "lifetime", days: null },
];
