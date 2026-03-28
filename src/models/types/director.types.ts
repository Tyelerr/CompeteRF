export interface Director {
  id: number;
  director_id: number;
  venue_id: number;
  assigned_by: number | null;
  assigned_at: string;
  archived_at: string | null;
  archived_by: number | null;
  profiles?: {
    id_auto: number;
    name: string;
    user_name: string;
    email: string;
    role: string;
  };
  venues?: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
  };
  tournament_count?: number;
  last_tournament_date?: string;
  status?: "active" | "archived";
}

export interface DirectorAssignment {
  id: number;
  venue_id: number;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  assigned_at: string;
  tournament_count: number;
  last_tournament_date: string | null;
  status: "active" | "archived";
}

export interface GroupedDirector {
  director_id: number;
  profile: {
    id_auto: number;
    name: string;
    user_name: string;
    email: string;
    role: string;
  };
  assignments: DirectorAssignment[];
  active_venue_count: number;
  total_tournaments: number;
  earliest_assigned_at: string;
}

export interface DirectorStats {
  totalDirectors: number;
  activeDirectors: number;
  archivedDirectors: number;
  venuesWithDirectors: number;
}

export interface AddDirectorData {
  venue_id: number;
  director_id: number;
  assigned_by: number;
}

export interface RemoveDirectorData {
  id: number;
  reason?: string;
  archived_by: number;
}

export interface DirectorFilters {
  search: string;
  venue_id?: number;
  status: "all" | "active" | "archived";
}

export interface DirectorOption {
  label: string;
  value: string;
  email: string;
  role: string;
}

export interface VenueOption {
  label: string;
  value: string;
  id: number;
}
