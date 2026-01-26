import { supabase } from "@/src/lib/supabase";

// Interfaces matching your EXISTING table structure
export interface FeaturedPlayer {
  id: number;
  name: string;
  nickname?: string;
  photo_url?: string;
  location?: string;
  bio?: string;
  achievements?: string[];
  user_id?: number; // References profiles.id_auto (integer)
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
  created_at?: string;
  updated_at?: string;
  // Joined data from profiles table
  profiles?: {
    user_name: string;
    name: string;
    email: string;
  };
}

export interface FeaturedBar {
  id: number;
  name: string;
  description?: string;
  photo_url?: string;
  location?: string;
  hours_of_operation?: string;
  special_features?: string;
  highlights?: string[];
  venue_id?: number; // References venues.id (integer)
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
  created_at?: string;
  updated_at?: string;
  // Joined data from venues table
  venues?: {
    venue: string; // Fixed: was 'name', now 'venue'
    address: string;
    city: string;
    state: string;
  };
}

export interface CreateFeaturedPlayerData {
  name: string;
  nickname?: string;
  photo_url?: string;
  location?: string;
  bio?: string;
  achievements?: string[];
  user_id?: number; // profiles.id_auto
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
}

export interface CreateFeaturedBarData {
  name: string;
  description?: string;
  photo_url?: string;
  location?: string;
  hours_of_operation?: string;
  special_features?: string;
  highlights?: string[];
  venue_id?: number; // venues.id
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
}

class FeaturedContentService {
  // Featured Players - using your existing table structure
  async getFeaturedPlayers(): Promise<FeaturedPlayer[]> {
    const { data, error } = await supabase
      .from("featured_players")
      .select(
        `
        *,
        profiles!featured_players_user_id_fkey (
          user_name,
          name,
          email
        )
      `,
      )
      .order("featured_priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createFeaturedPlayer(
    playerData: CreateFeaturedPlayerData,
  ): Promise<FeaturedPlayer> {
    const { data, error } = await supabase
      .from("featured_players")
      .insert({
        ...playerData,
        is_active: playerData.is_active ?? true,
        featured_priority: playerData.featured_priority ?? 0,
      })
      .select(
        `
        *,
        profiles!featured_players_user_id_fkey (
          user_name,
          name,
          email
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async updateFeaturedPlayer(
    id: number,
    updates: Partial<CreateFeaturedPlayerData>,
  ): Promise<FeaturedPlayer> {
    const { data, error } = await supabase
      .from("featured_players")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        profiles!featured_players_user_id_fkey (
          user_name,
          name,
          email
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async toggleFeaturedPlayerStatus(id: number): Promise<FeaturedPlayer> {
    const { data: current, error: fetchError } = await supabase
      .from("featured_players")
      .select("is_active")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from("featured_players")
      .update({
        is_active: !current.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        profiles!featured_players_user_id_fkey (
          user_name,
          name,
          email
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async deleteFeaturedPlayer(id: number): Promise<void> {
    const { error } = await supabase
      .from("featured_players")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  // Featured Bars
  async getFeaturedBars(): Promise<FeaturedBar[]> {
    const { data, error } = await supabase
      .from("featured_bars")
      .select(
        `
        *,
        venues (
          venue,
          address,
          city,
          state
        )
      `,
      )
      .order("featured_priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createFeaturedBar(
    barData: CreateFeaturedBarData,
  ): Promise<FeaturedBar> {
    const { data, error } = await supabase
      .from("featured_bars")
      .insert({
        ...barData,
        is_active: barData.is_active ?? true,
        featured_priority: barData.featured_priority ?? 0,
      })
      .select(
        `
        *,
        venues (
          venue,
          address,
          city,
          state
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async updateFeaturedBar(
    id: number,
    updates: Partial<CreateFeaturedBarData>,
  ): Promise<FeaturedBar> {
    const { data, error } = await supabase
      .from("featured_bars")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        venues (
          venue,
          address,
          city,
          state
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async toggleFeaturedBarStatus(id: number): Promise<FeaturedBar> {
    const { data: current, error: fetchError } = await supabase
      .from("featured_bars")
      .select("is_active")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from("featured_bars")
      .update({
        is_active: !current.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        venues (
          venue,
          address,
          city,
          state
        )
      `,
      )
      .single();

    if (error) throw error;
    return data;
  }

  async deleteFeaturedBar(id: number): Promise<void> {
    const { error } = await supabase
      .from("featured_bars")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  // Helper methods for dropdowns
  async getAvailableProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id_auto, user_name, name, email") // Using id_auto instead of id
      .eq("status", "active")
      .order("user_name");

    if (error) throw error;
    return data || [];
  }

  async getAvailableVenues() {
    const { data, error } = await supabase
      .from("venues")
      .select("id, venue, address, city, state") // Fixed: was 'name', now 'venue'
      .order("venue"); // Fixed: was 'name', now 'venue'

    if (error) throw error;
    return data || [];
  }
}

export const featuredContentService = new FeaturedContentService();
