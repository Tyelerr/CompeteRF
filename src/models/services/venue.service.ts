import { supabase } from "../../lib/supabase";
import { Venue, VenueDirector, VenueOwner } from "../types/venue.types";

export const venueService = {
  async getVenues(state?: string, city?: string): Promise<Venue[]> {
    let query = supabase
      .from("venues")
      .select("*")
      .eq("status", "active")
      .order("venue", { ascending: true });

    if (state) query = query.eq("state", state);
    if (city) query = query.eq("city", city);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getVenue(id: number): Promise<Venue | null> {
    const { data, error } = await supabase
      .from("venues")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getCitiesByState(state: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("venues")
      .select("city")
      .eq("state", state)
      .eq("status", "active");
    if (error) throw error;
    const cities = [...new Set(data?.map((v) => v.city) || [])];
    return cities.sort();
  },

  async getVenuesByOwner(ownerId: number): Promise<Venue[]> {
    const { data, error } = await supabase
      .from("venue_owners")
      .select("venue_id, venues(*)")
      .eq("owner_id", ownerId)
      .is("archived_at", null);
    if (error) throw error;
    return data?.map((d) => d.venues as unknown as Venue) || [];
  },

  async getVenuesByDirector(directorId: number): Promise<Venue[]> {
    const { data, error } = await supabase
      .from("venue_directors")
      .select("venue_id, venues(*)")
      .eq("director_id", directorId)
      .is("archived_at", null);
    if (error) throw error;
    return data?.map((d) => d.venues as unknown as Venue) || [];
  },

  async getVenueOwners(venueId: number): Promise<VenueOwner[]> {
    const { data, error } = await supabase
      .from("venue_owners")
      .select("*, profiles:owner_id(*)")
      .eq("venue_id", venueId)
      .is("archived_at", null);
    if (error) throw error;
    return data || [];
  },

  async getVenueDirectors(venueId: number): Promise<VenueDirector[]> {
    const { data, error } = await supabase
      .from("venue_directors")
      .select("*, profiles:director_id(*)")
      .eq("venue_id", venueId)
      .is("archived_at", null);
    if (error) throw error;
    return data || [];
  },

  async assignDirector(
    venueId: number,
    directorId: number,
    assignedBy: number,
  ): Promise<VenueDirector> {
    const { data, error } = await supabase
      .from("venue_directors")
      .insert({
        venue_id: venueId,
        director_id: directorId,
        assigned_by: assignedBy,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async removeDirector(
    venueId: number,
    directorId: number,
    archivedBy: number,
  ): Promise<void> {
    const { error } = await supabase
      .from("venue_directors")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: archivedBy,
      })
      .eq("venue_id", venueId)
      .eq("director_id", directorId);
    if (error) throw error;
  },

  // Returns distinct table brands present in venue_tables,
  // excluding generic catch-all values.
  async getDistinctBrands(): Promise<string[]> {
    const { data, error } = await supabase
      .from("venue_tables")
      .select("brand")
      .not("brand", "is", null)
      .order("brand");
    if (error) throw error;
    const excluded = ["Other", "Unknown"];
    const brands = [
      ...new Set(data?.map((d) => d.brand).filter(Boolean) as string[]),
    ];
    return brands.filter((b) => !excluded.includes(b));
  },

  // Returns venue IDs that have at least one table matching any of the
  // given brands. Used for client-side brand filtering in useBilliards.
  async getVenueIdsByBrands(brands: string[]): Promise<number[]> {
    if (brands.length === 0) return [];
    const { data, error } = await supabase
      .from("venue_tables")
      .select("venue_id")
      .in("brand", brands);
    if (error) throw error;
    return [
      ...new Set(data?.map((d) => d.venue_id).filter(Boolean) as number[]),
    ];
  },
};
