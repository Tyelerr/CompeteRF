import { supabase } from "../../lib/supabase";
import {
  Profile,
  ProfileInsert,
  ProfileUpdate,
  PUBLIC_PROFILE_COLUMNS,
  PublicProfile,
} from "../types/profile.types";

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Another user's profile: safe public fields only (profiles_public view).
  async getProfileByIdAuto(idAuto: number): Promise<PublicProfile | null> {
    const { data, error } = await supabase
      .from("profiles_public")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("id_auto", idAuto)
      .maybeSingle();
    if (error) throw error;
    return (data as PublicProfile | null) ?? null;
  },

  async getProfileByUsername(username: string): Promise<PublicProfile | null> {
    const { data, error } = await supabase
      .from("profiles_public")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("user_name", username)
      .maybeSingle();
    if (error) throw error;
    return (data as PublicProfile | null) ?? null;
  },

  async createProfile(profile: ProfileInsert): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .insert(profile)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(
    userId: string,
    updates: ProfileUpdate,
  ): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Case-insensitive, server-side (is_username_available RPC) — callable signed out.
  async checkUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_username_available", { p_username: username });
    if (error) throw error;
    return data === true;
  },

  // Player / partner search (signed-in): safe public fields only (search_players RPC). Matches
  // username, display name and first/last name — never email or phone.
  async searchProfiles(query: string, limit: number = 20): Promise<PublicProfile[]> {
    const { data, error } = await supabase.rpc("search_players", { p_query: query, p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as PublicProfile[]).map((p) => ({ ...p, status: "active" }));
  },
};
