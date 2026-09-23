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

  // Venues a user is tied to as EITHER an owner or a director (deduped, active
  // only). Used to scope the tournament-submission venue picker so a user only
  // sees venues they actually run — supports users assigned to multiple venues
  // and users who both own and direct venues.
  async getVenuesForUser(userId: number): Promise<Venue[]> {
    const [owned, directed] = await Promise.all([
      this.getVenuesByOwner(userId),
      this.getVenuesByDirector(userId),
    ]);
    const byId = new Map<number, Venue>();
    for (const v of [...owned, ...directed]) {
      if (v && !byId.has(v.id)) byId.set(v.id, v);
    }
    return [...byId.values()].sort((a, b) =>
      (a.venue || "").localeCompare(b.venue || ""),
    );
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

  // Creates a venue with the caller as its primary owner (plus optional directors) in
  // one authorized server call — clients can no longer self-insert venue_owners rows.
  // Roles of the owner and directors are re-derived server-side. Returns the venue id.
  async createVenueWithOwner(
    venue: {
      venue: string;
      address: string;
      city: string;
      state: string;
      zip_code: string;
      phone?: string | null;
      google_place_id?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    directorIds: number[] = [],
  ): Promise<number> {
    const { data, error } = await supabase.rpc("create_venue", {
      p_venue: venue,
      p_director_ids: directorIds,
    });
    if (error) throw error;
    return data as number;
  },

  // Hard-removes a co-owner or director row from a venue team (venue owner or admin
  // only) and re-derives that user's role server-side. Returns their new role.
  async removeTeamMember(kind: "owner" | "director", rowId: number): Promise<string | null> {
    const { data, error } = await supabase.rpc("remove_venue_team_member", {
      p_kind: kind,
      p_row_id: rowId,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
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

  // Batched equipment summary for a set of venues — ONE query for the whole page,
  // never one-per-card (avoids N+1). Returns venueId → { tableCount, sizes } where
  // tableCount sums quantities and sizes is the distinct list of sizes present.
  async getTableSummariesByVenueIds(
    venueIds: number[],
  ): Promise<Record<number, { tableCount: number; sizes: string[] }>> {
    if (venueIds.length === 0) return {};
    const { data, error } = await supabase
      .from("venue_tables")
      .select("venue_id, table_size, custom_size, quantity")
      .in("venue_id", venueIds);
    if (error) throw error;
    const out: Record<number, { tableCount: number; sizes: string[] }> = {};
    for (const row of data ?? []) {
      const vid = row.venue_id as number | null;
      if (vid == null) continue;
      const entry = out[vid] ?? { tableCount: 0, sizes: [] };
      entry.tableCount += Number(row.quantity) || 0;
      const size = (row.custom_size || row.table_size) as string | null;
      if (size && !entry.sizes.includes(size)) entry.sizes.push(size);
      out[vid] = entry;
    }
    return out;
  },

  // Resolve a venue's Google Places photo (fallback only) via the EXISTING google-places
  // Edge Function — server-side, so the API key never touches the client. Returns null on
  // any miss/failure so the UI silently keeps its initials fallback. Never persisted.
  async getGooglePlacePhoto(
    placeId: string,
    maxWidth = 800,
  ): Promise<{ url: string; attribution: string | null } | null> {
    try {
      const { data, error } = await supabase.functions.invoke("google-places", {
        body: { action: "venuePhoto", placeId, maxWidth },
      });
      if (error) throw error;
      if (!data?.url) return null;
      return { url: data.url as string, attribution: (data.attribution as string) ?? null };
    } catch (err) {
      console.warn("[venue] getGooglePlacePhoto failed:", err);
      return null;
    }
  },

  // Geocode a free-typed venue address back to coordinates using the EXISTING
  // google-places edge function (autocomplete → details) — the same infra
  // useCreateVenue uses. Returns null on any miss/failure so callers never
  // overwrite valid coordinates with null. Isolated: touches no DB here.
  async geocodeAddress(parts: {
    address: string;
    city: string;
    state: string;
    zip: string;
  }): Promise<{ latitude: number; longitude: number; google_place_id: string } | null> {
    const query = [parts.address, parts.city, parts.state, parts.zip]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(", ");
    if (!query) return null;
    try {
      const { data: ac, error: acErr } = await supabase.functions.invoke(
        "google-places",
        { body: { action: "autocomplete", query } },
      );
      if (acErr) throw acErr;
      const placeId = ac?.predictions?.[0]?.place_id as string | undefined;
      if (!placeId) return null;
      const { data: det, error: detErr } = await supabase.functions.invoke(
        "google-places",
        { body: { action: "details", placeId } },
      );
      if (detErr) throw detErr;
      const loc = det?.result?.geometry?.location;
      const lat = loc?.lat;
      const lng = loc?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return { latitude: lat, longitude: lng, google_place_id: placeId };
    } catch (err) {
      console.warn("[venue] geocodeAddress failed:", err);
      return null;
    }
  },
};
