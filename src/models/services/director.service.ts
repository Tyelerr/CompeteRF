import { supabase } from "../../lib/supabase";
import {
  AddDirectorData,
  Director,
  DirectorFilters,
  DirectorStats,
  GroupedDirector,
  RemoveDirectorData,
} from "../types/director.types";

class DirectorService {
  // ── Grouped directors for bar owner (2 queries, not N+1) ─────────────────
  async getGroupedDirectors(ownerIdAuto: number): Promise<GroupedDirector[]> {
    try {
      // Step 1: get owner venue IDs
      const { data: ownedVenues } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", ownerIdAuto)
        .is("archived_at", null);

      const venueIds = ownedVenues?.map((v) => v.venue_id) || [];
      if (venueIds.length === 0) return [];

      // Step 2: all assignments with joins — single query
      const { data: assignments, error } = await supabase
        .from("venue_directors")
        .select(`
          id, director_id, venue_id, assigned_at, archived_at,
          profiles!venue_directors_director_id_fkey (id_auto, name, user_name, email, role),
          venues!venue_directors_venue_id_fkey (id, venue, city, state)
        `)
        .in("venue_id", venueIds)
        .order("assigned_at", { ascending: false });

      if (error || !assignments || assignments.length === 0) return [];

      // Step 3: all tournament data in one query, count in JS
      const directorIds = [...new Set(assignments.map((a) => a.director_id))];

      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("director_id, venue_id, tournament_date")
        .in("director_id", directorIds)
        .in("venue_id", venueIds);

      const countMap: Record<string, number> = {};
      const lastDateMap: Record<string, string> = {};
      for (const t of tournaments || []) {
        const key = `${t.director_id}_${t.venue_id}`;
        countMap[key] = (countMap[key] || 0) + 1;
        if (!lastDateMap[key] || t.tournament_date > lastDateMap[key]) {
          lastDateMap[key] = t.tournament_date;
        }
      }

      // Step 4: group by director in JS
      const grouped: Record<number, GroupedDirector> = {};

      for (const a of assignments) {
        const profile = a.profiles as any;
        const venue = a.venues as any;
        if (!profile || !venue) continue;

        const dirId = a.director_id;
        const mapKey = `${dirId}_${a.venue_id}`;

        if (!grouped[dirId]) {
          grouped[dirId] = {
            director_id: dirId,
            profile: {
              id_auto: profile.id_auto,
              name: profile.name || profile.user_name || "Unknown",
              user_name: profile.user_name || "",
              email: profile.email || "",
              role: profile.role || "",
            },
            assignments: [],
            active_venue_count: 0,
            total_tournaments: 0,
            earliest_assigned_at: a.assigned_at,
          };
        }

        const tournamentCount = countMap[mapKey] || 0;
        const isArchived = !!a.archived_at;

        grouped[dirId].assignments.push({
          id: a.id,
          venue_id: a.venue_id,
          venue_name: venue.venue,
          venue_city: venue.city || "",
          venue_state: venue.state || "",
          assigned_at: a.assigned_at,
          tournament_count: tournamentCount,
          last_tournament_date: lastDateMap[mapKey] || null,
          status: isArchived ? "archived" : "active",
        });

        grouped[dirId].total_tournaments += tournamentCount;
        if (!isArchived) grouped[dirId].active_venue_count++;
        if (a.assigned_at < grouped[dirId].earliest_assigned_at) {
          grouped[dirId].earliest_assigned_at = a.assigned_at;
        }
      }

      return Object.values(grouped);
    } catch (error) {
      console.error("Error fetching grouped directors:", error);
      throw error;
    }
  }

  // ── Update venue assignments for a director ───────────────────────────────
  async updateDirectorVenues(
    directorId: number,
    ownerIdAuto: number,
    selectedVenueIds: number[],
    currentAssignments: { id: number; venue_id: number; status: string }[]
  ): Promise<boolean> {
    const selectedSet = new Set(selectedVenueIds);
    const activeAssignments = currentAssignments.filter((a) => a.status === "active");
    const archivedAssignments = currentAssignments.filter((a) => a.status === "archived");
    const activeVenueIds = new Set(activeAssignments.map((a) => a.venue_id));

    // Archive venues that were deselected
    const toArchive = activeAssignments.filter((a) => !selectedSet.has(a.venue_id));
    for (const a of toArchive) {
      await supabase
        .from("venue_directors")
        .update({ archived_at: new Date().toISOString(), archived_by: ownerIdAuto })
        .eq("id", a.id);
    }

    // Add or restore venues that were selected
    const toActivate = selectedVenueIds.filter((vid) => !activeVenueIds.has(vid));
    for (const venueId of toActivate) {
      const existing = archivedAssignments.find((a) => a.venue_id === venueId);
      if (existing) {
        await supabase
          .from("venue_directors")
          .update({ archived_at: null, archived_by: null })
          .eq("id", existing.id);
      } else {
        await supabase.from("venue_directors").insert({
          venue_id: venueId,
          director_id: directorId,
          assigned_by: ownerIdAuto,
          assigned_at: new Date().toISOString(),
        });
      }
    }

    return true;
  }

  // ── Remove director from all owner venues ─────────────────────────────────
  async removeDirectorFromAllVenues(
    directorId: number,
    ownerVenueIds: number[],
    archivedBy: number
  ): Promise<boolean> {
    const { error } = await supabase
      .from("venue_directors")
      .update({ archived_at: new Date().toISOString(), archived_by: archivedBy })
      .eq("director_id", directorId)
      .in("venue_id", ownerVenueIds)
      .is("archived_at", null);

    if (error) throw error;
    return true;
  }

  // ── Legacy getDirectors (kept for super admin / my-directors screen) ──────
  async getDirectors(
    filters: DirectorFilters & { owner_id?: number; director_role?: string; region?: string }
  ): Promise<Director[]> {
    try {
      let query = supabase
        .from("venue_directors")
        .select(`
          *,
          profiles!venue_directors_director_id_fkey (id_auto, name, user_name, email, role),
          venues!venue_directors_venue_id_fkey (id, venue, address, city, state)
        `)
        .order("assigned_at", { ascending: false });

      if (filters.owner_id) {
        const { data: ownedVenues } = await supabase
          .from("venue_owners")
          .select("venue_id")
          .eq("owner_id", filters.owner_id)
          .is("archived_at", null);
        const venueIds = ownedVenues?.map((v) => v.venue_id) || [];
        if (venueIds.length === 0) return [];
        query = query.in("venue_id", venueIds);
      }

      if (filters.status === "active") query = query.is("archived_at", null);
      else if (filters.status === "archived") query = query.not("archived_at", "is", null);
      if (filters.venue_id) query = query.eq("venue_id", filters.venue_id);

      const { data, error } = await query;
      if (error) throw error;

      let directors = data || [];

      if (filters.search) {
        const q = filters.search.toLowerCase();
        directors = directors.filter(
          (d: any) =>
            d.profiles?.name?.toLowerCase().includes(q) ||
            d.profiles?.user_name?.toLowerCase().includes(q) ||
            d.profiles?.email?.toLowerCase().includes(q) ||
            d.venues?.venue?.toLowerCase().includes(q) ||
            d.profiles?.id_auto?.toString().includes(q)
        );
      }

      // Batched tournament counts
      const dirVenuePairs = directors.map((d: any) => ({ director_id: d.director_id, venue_id: d.venue_id }));
      const directorIds = [...new Set(dirVenuePairs.map((p: any) => p.director_id))];
      const venueIds = [...new Set(dirVenuePairs.map((p: any) => p.venue_id))];

      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("director_id, venue_id, tournament_date")
        .in("director_id", directorIds)
        .in("venue_id", venueIds);

      const countMap: Record<string, number> = {};
      const lastDateMap: Record<string, string> = {};
      for (const t of tournaments || []) {
        const key = `${t.director_id}_${t.venue_id}`;
        countMap[key] = (countMap[key] || 0) + 1;
        if (!lastDateMap[key] || t.tournament_date > lastDateMap[key]) {
          lastDateMap[key] = t.tournament_date;
        }
      }

      return directors.map((d: any) => {
        const key = `${d.director_id}_${d.venue_id}`;
        return {
          ...d,
          tournament_count: countMap[key] || 0,
          last_tournament_date: lastDateMap[key] || null,
          status: d.archived_at ? "archived" : "active",
        };
      });
    } catch (error) {
      console.error("Error fetching directors:", error);
      throw error;
    }
  }

  async getDirectorStats(filters: { owner_id?: number }): Promise<DirectorStats> {
    try {
      let query = supabase.from("venue_directors").select("*, venues!venue_directors_venue_id_fkey(id)");
      if (filters.owner_id) {
        const { data: ownedVenues } = await supabase
          .from("venue_owners").select("venue_id").eq("owner_id", filters.owner_id).is("archived_at", null);
        const venueIds = ownedVenues?.map((v) => v.venue_id) || [];
        if (venueIds.length === 0) return { totalDirectors: 0, activeDirectors: 0, archivedDirectors: 0, venuesWithDirectors: 0 };
        query = query.in("venue_id", venueIds);
      }
      const { data } = await query;
      const directors = data || [];
      return {
        totalDirectors: directors.length,
        activeDirectors: directors.filter((d) => !d.archived_at).length,
        archivedDirectors: directors.filter((d) => d.archived_at).length,
        venuesWithDirectors: new Set(directors.map((d) => d.venue_id)).size,
      };
    } catch (error) {
      console.error("Error fetching director stats:", error);
      throw error;
    }
  }

  async addDirector(data: AddDirectorData): Promise<boolean> {
    try {
      const { data: existing } = await supabase
        .from("venue_directors").select("id")
        .eq("venue_id", data.venue_id).eq("director_id", data.director_id).is("archived_at", null).single();
      if (existing) throw new Error("Director is already assigned to this venue");
      const { error } = await supabase.from("venue_directors").insert({
        venue_id: data.venue_id, director_id: data.director_id,
        assigned_by: data.assigned_by, assigned_at: new Date().toISOString(),
      });
      if (error) throw error;
      return true;
    } catch (error) { console.error("Error adding director:", error); throw error; }
  }

  async removeDirector(data: RemoveDirectorData): Promise<boolean> {
    try {
      const { error } = await supabase.from("venue_directors")
        .update({ archived_at: new Date().toISOString(), archived_by: data.archived_by }).eq("id", data.id);
      if (error) throw error;
      return true;
    } catch (error) { console.error("Error removing director:", error); throw error; }
  }

  async restoreDirector(id: number): Promise<boolean> {
    try {
      const { error } = await supabase.from("venue_directors")
        .update({ archived_at: null, archived_by: null }).eq("id", id);
      if (error) throw error;
      return true;
    } catch (error) { console.error("Error restoring director:", error); throw error; }
  }

  async getAvailableDirectors(venueId: number): Promise<any[]> {
    try {
      const { data: assignedDirectors } = await supabase
        .from("venue_directors").select("director_id").eq("venue_id", venueId).is("archived_at", null);
      const assignedIds = assignedDirectors?.map((d) => d.director_id) || [];
      let query = supabase.from("profiles").select("id_auto, name, user_name, email, role")
        .in("role", ["tournament_director", "super_admin", "compete_admin"]).order("name");
      if (assignedIds.length > 0) query = query.not("id_auto", "in", `(${assignedIds.join(",")})`);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) { console.error("Error fetching available directors:", error); throw error; }
  }
}

export const directorService = new DirectorService();
