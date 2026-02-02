import { supabase } from "../../lib/supabase";
import {
  AddDirectorData,
  Director,
  DirectorFilters,
  DirectorStats,
  RemoveDirectorData,
} from "../types/director.types";

class DirectorService {
  // Get directors with role-specific filtering
  async getDirectors(
    filters: DirectorFilters & {
      owner_id?: number; // For bar owners - only their venues
      director_role?: string; // For filtering by director role
      region?: string; // For regional filtering
    },
  ): Promise<Director[]> {
    try {
      let query = supabase
        .from("venue_directors")
        .select(
          `
          *,
          profiles!venue_directors_director_id_fkey (
            id_auto,
            name,
            user_name,
            email,
            role
          ),
          venues!venue_directors_venue_id_fkey (
            id,
            venue,
            address,
            city,
            state
          )
        `,
        )
        .order("assigned_at", { ascending: false });

      // Apply role-specific filters
      if (filters.owner_id) {
        // Bar owner: only directors at venues they own
        const { data: ownedVenues } = await supabase
          .from("venue_owners")
          .select("venue_id")
          .eq("owner_id", filters.owner_id)
          .is("archived_at", null);

        const venueIds = ownedVenues?.map((v) => v.venue_id) || [];
        if (venueIds.length === 0) return [];

        query = query.in("venue_id", venueIds);
      }

      // Status filter
      if (filters.status === "active") {
        query = query.is("archived_at", null);
      } else if (filters.status === "archived") {
        query = query.not("archived_at", "is", null);
      }

      // Venue filter
      if (filters.venue_id) {
        query = query.eq("venue_id", filters.venue_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      let directors = data || [];

      // Search filter (done client-side for complex search)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        directors = directors.filter(
          (director: any) =>
            director.profiles?.name?.toLowerCase().includes(searchLower) ||
            director.profiles?.user_name?.toLowerCase().includes(searchLower) ||
            director.profiles?.email?.toLowerCase().includes(searchLower) ||
            director.venues?.venue?.toLowerCase().includes(searchLower) ||
            director.profiles?.id_auto?.toString().includes(searchLower),
        );
      }

      // Add computed fields
      const directorsWithStats = await Promise.all(
        directors.map(async (director: any) => {
          // Get tournament count for this director at this venue
          const { count } = await supabase
            .from("tournaments")
            .select("*", { count: "exact" })
            .eq("director_id", director.director_id)
            .eq("venue_id", director.venue_id);

          // Get last tournament date
          const { data: lastTournament } = await supabase
            .from("tournaments")
            .select("tournament_date")
            .eq("director_id", director.director_id)
            .eq("venue_id", director.venue_id)
            .order("tournament_date", { ascending: false })
            .limit(1)
            .single();

          return {
            ...director,
            tournament_count: count || 0,
            last_tournament_date: lastTournament?.tournament_date || null,
            status: director.archived_at ? "archived" : "active",
          };
        }),
      );

      return directorsWithStats;
    } catch (error) {
      console.error("Error fetching directors:", error);
      throw error;
    }
  }

  // Get director statistics
  async getDirectorStats(filters: {
    owner_id?: number;
  }): Promise<DirectorStats> {
    try {
      let query = supabase
        .from("venue_directors")
        .select("*, venues!venue_directors_venue_id_fkey(id)");

      // Apply role-specific filters
      if (filters.owner_id) {
        const { data: ownedVenues } = await supabase
          .from("venue_owners")
          .select("venue_id")
          .eq("owner_id", filters.owner_id)
          .is("archived_at", null);

        const venueIds = ownedVenues?.map((v) => v.venue_id) || [];
        if (venueIds.length === 0) {
          return {
            totalDirectors: 0,
            activeDirectors: 0,
            archivedDirectors: 0,
            venuesWithDirectors: 0,
          };
        }

        query = query.in("venue_id", venueIds);
      }

      const { data: allDirectors } = await query;
      const directors = allDirectors || [];

      const activeDirectors = directors.filter((d) => !d.archived_at);
      const archivedDirectors = directors.filter((d) => d.archived_at);
      const uniqueVenues = new Set(directors.map((d) => d.venue_id));

      return {
        totalDirectors: directors.length,
        activeDirectors: activeDirectors.length,
        archivedDirectors: archivedDirectors.length,
        venuesWithDirectors: uniqueVenues.size,
      };
    } catch (error) {
      console.error("Error fetching director stats:", error);
      throw error;
    }
  }

  // Add director to venue
  async addDirector(data: AddDirectorData): Promise<boolean> {
    try {
      // Check if director already assigned to this venue
      const { data: existing } = await supabase
        .from("venue_directors")
        .select("id")
        .eq("venue_id", data.venue_id)
        .eq("director_id", data.director_id)
        .is("archived_at", null)
        .single();

      if (existing) {
        throw new Error("Director is already assigned to this venue");
      }

      const { error } = await supabase.from("venue_directors").insert({
        venue_id: data.venue_id,
        director_id: data.director_id,
        assigned_by: data.assigned_by,
        assigned_at: new Date().toISOString(),
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error adding director:", error);
      throw error;
    }
  }

  // Remove director from venue (archive)
  async removeDirector(data: RemoveDirectorData): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("venue_directors")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: data.archived_by,
        })
        .eq("id", data.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error removing director:", error);
      throw error;
    }
  }

  // Restore archived director
  async restoreDirector(id: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("venue_directors")
        .update({
          archived_at: null,
          archived_by: null,
        })
        .eq("id", id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error restoring director:", error);
      throw error;
    }
  }

  // Get available directors (not yet assigned to a venue)
  async getAvailableDirectors(venueId: number): Promise<any[]> {
    try {
      // Get directors already assigned to this venue
      const { data: assignedDirectors } = await supabase
        .from("venue_directors")
        .select("director_id")
        .eq("venue_id", venueId)
        .is("archived_at", null);

      const assignedIds = assignedDirectors?.map((d) => d.director_id) || [];

      // Get all tournament directors and admins
      let query = supabase
        .from("profiles")
        .select("id_auto, name, user_name, email, role")
        .in("role", ["tournament_director", "super_admin", "compete_admin"])
        .order("name");

      // Exclude already assigned directors
      if (assignedIds.length > 0) {
        query = query.not("id_auto", "in", `(${assignedIds.join(",")})`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error("Error fetching available directors:", error);
      throw error;
    }
  }
}

export const directorService = new DirectorService();
