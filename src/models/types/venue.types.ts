import { VenueStatus, TableInfo } from './common.types';

export interface Venue {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  tables?: TableInfo[];
  photo_url?: string;
  status: VenueStatus;
  last_verified?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: number;
  archive_reason?: string;
  featured_until?: string;
  featured_priority: number;
}

export interface VenueOwner {
  id: number;
  venue_id: number;
  owner_id: number;
  assigned_by?: number;
  assigned_at: string;
  archived_at?: string;
  archived_by?: number;
}

export interface VenueDirector {
  id: number;
  venue_id: number;
  director_id: number;
  assigned_by?: number;
  assigned_at: string;
  archived_at?: string;
  archived_by?: number;
}