import { supabase } from "@/src/lib/supabase";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

const BUCKET_NAME = "featured-content-images";

// Interfaces matching your EXISTING table structure
export interface FeaturedPlayer {
  id: number;
  name: string;
  nickname?: string;
  photo_url?: string;
  location?: string;
  bio?: string;
  fargo_rating?: number;
  preferred_game?: string;
  achievements?: string[];
  user_id?: number;
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
  created_at?: string;
  updated_at?: string;
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
  venue_id?: number;
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
  created_at?: string;
  updated_at?: string;
  venues?: {
    venue: string;
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
  fargo_rating?: number;
  preferred_game?: string;
  achievements?: string[];
  user_id?: number;
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
  venue_id?: number;
  is_active?: boolean;
  featured_until?: string;
  featured_priority?: number;
}

// ─────────────────────────────────────────────────────────────
// Featured Content Service (CRUD)
// ─────────────────────────────────────────────────────────────

class FeaturedContentService {
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

  async getAvailableProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id_auto, user_name, name, email")
      .eq("status", "active")
      .order("user_name");

    if (error) throw error;
    return data || [];
  }

  async getAvailableVenues() {
    const { data, error } = await supabase
      .from("venues")
      .select("id, venue, address, city, state")
      .order("venue");

    if (error) throw error;
    return data || [];
  }
}

// ─────────────────────────────────────────────────────────────
// Featured Image Service (Upload / Delete)
// ─────────────────────────────────────────────────────────────

class FeaturedImageService {
  async ensureBucketExists(): Promise<void> {
    try {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });

      if (error && !error.message.includes("already exists")) {
        console.error("❌ Error creating bucket:", error.message);
      }
    } catch (err) {
      console.error("❌ Bucket creation error:", err);
    }
  }

  async uploadImage(
    uri: string,
    type: "players" | "bars",
    entityId: number | string,
  ): Promise<string | null> {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      const extension = uri.split(".").pop()?.toLowerCase() || "jpg";
      const contentType =
        extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg";

      const timestamp = Date.now();
      const filePath = `${type}/${type.slice(0, -1)}_${entityId}_${timestamp}.${extension}`;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, decode(base64), {
          contentType,
          upsert: true,
        });

      if (error) {
        console.error("❌ Upload error:", error.message);
        return null;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

      console.log("✅ Image uploaded:", publicUrl);
      return publicUrl;
    } catch (err) {
      console.error("❌ Upload failed:", err);
      return null;
    }
  }

  async uploadPlayerImage(
    uri: string,
    playerId: number,
  ): Promise<string | null> {
    const publicUrl = await this.uploadImage(uri, "players", playerId);

    if (publicUrl) {
      const { error } = await supabase
        .from("featured_players")
        .update({
          photo_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", playerId);

      if (error) {
        console.error("❌ Failed to update player photo_url:", error.message);
        return null;
      }
    }

    return publicUrl;
  }

  async uploadBarImage(uri: string, barId: number): Promise<string | null> {
    const publicUrl = await this.uploadImage(uri, "bars", barId);

    if (publicUrl) {
      const { error } = await supabase
        .from("featured_bars")
        .update({
          photo_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", barId);

      if (error) {
        console.error("❌ Failed to update bar photo_url:", error.message);
        return null;
      }
    }

    return publicUrl;
  }

  async deleteImage(publicUrl: string): Promise<boolean> {
    try {
      const parts = publicUrl.split(`${BUCKET_NAME}/`);
      if (parts.length < 2) return false;

      const filePath = parts[1];

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

      if (error) {
        console.error("❌ Delete error:", error.message);
        return false;
      }

      console.log("✅ Image deleted:", filePath);
      return true;
    } catch (err) {
      console.error("❌ Delete failed:", err);
      return false;
    }
  }
}

export const featuredContentService = new FeaturedContentService();
export const featuredImageService = new FeaturedImageService();
