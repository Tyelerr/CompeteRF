// Director-related type definitions shared across all roles

export interface Director {
  id: number;
  director_id: number; // References profiles.id_auto
  venue_id: number;
  assigned_by: number | null;
  assigned_at: string;
  archived_at: string | null;
  archived_by: number | null;

  // Joined data from profiles
  profiles?: {
    id_auto: number;
    name: string;
    user_name: string;
    email: string;
    role: string;
  };

  // Joined data from venues
  venues?: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
  };

  // Computed fields
  tournament_count?: number;
  last_tournament_date?: string;
  status?: "active" | "archived";
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

// For dropdowns/selects
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
