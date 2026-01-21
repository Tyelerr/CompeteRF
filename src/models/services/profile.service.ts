import { supabase } from "../../lib/supabase";
import { Profile, ProfileInsert, ProfileUpdate } from "../types/profile.types";

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  async getProfileByIdAuto(idAuto: number): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id_auto", idAuto)
      .single();
    if (error) throw error;
    return data;
  },

  async getProfileByUsername(username: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_name", username)
      .single();
    if (error) throw error;
    return data;
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

  async checkUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_name", username)
      .single();
    if (error && error.code === "PGRST116") return true;
    if (error) throw error;
    return !data;
  },

  async searchProfiles(query: string, limit: number = 20): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`name.ilike.%${query}%,user_name.ilike.%${query}%`)
      .eq("status", "active")
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
};
