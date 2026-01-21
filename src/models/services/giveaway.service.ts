import { supabase } from "../../lib/supabase";
import { Giveaway, GiveawayDraw, GiveawayEntry } from "../types/giveaway.types";

export const giveawayService = {
  async getActiveGiveaways(): Promise<Giveaway[]> {
    const { data, error } = await supabase
      .from("giveaways")
      .select("*")
      .eq("status", "active")
      .order("end_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getGiveaway(id: number): Promise<Giveaway | null> {
    const { data, error } = await supabase
      .from("giveaways")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getAllGiveaways(): Promise<Giveaway[]> {
    const { data, error } = await supabase
      .from("giveaways")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createGiveaway(giveaway: Partial<Giveaway>): Promise<Giveaway> {
    const { data, error } = await supabase
      .from("giveaways")
      .insert(giveaway)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateGiveaway(
    id: number,
    updates: Partial<Giveaway>,
  ): Promise<Giveaway> {
    const { data, error } = await supabase
      .from("giveaways")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async enterGiveaway(
    entry: Omit<GiveawayEntry, "id" | "created_at">,
  ): Promise<GiveawayEntry> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .insert(entry)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getEntries(giveawayId: number): Promise<GiveawayEntry[]> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .select("*, profiles:user_id(*)")
      .eq("giveaway_id", giveawayId);
    if (error) throw error;
    return data || [];
  },

  async getEntryCount(giveawayId: number): Promise<number> {
    const { count, error } = await supabase
      .from("giveaway_entries")
      .select("id", { count: "exact", head: true })
      .eq("giveaway_id", giveawayId);
    if (error) throw error;
    return count || 0;
  },

  async hasEntered(giveawayId: number, userId: number): Promise<boolean> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .select("id")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .single();
    if (error && error.code === "PGRST116") return false;
    if (error) throw error;
    return !!data;
  },

  async getUserEntries(userId: number): Promise<GiveawayEntry[]> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .select("*, giveaways(*)")
      .eq("user_id", userId);
    if (error) throw error;
    return data || [];
  },

  async drawWinner(giveawayId: number, drawnBy: number): Promise<GiveawayDraw> {
    const entries = await this.getEntries(giveawayId);
    if (entries.length === 0) throw new Error("No entries to draw from");

    const randomIndex = Math.floor(Math.random() * entries.length);
    const winner = entries[randomIndex];

    const { data: drawData, error: drawError } = await supabase
      .from("giveaway_draws")
      .select("draw_number")
      .eq("giveaway_id", giveawayId)
      .order("draw_number", { ascending: false })
      .limit(1);

    const drawNumber = (drawData?.[0]?.draw_number || 0) + 1;

    const { data, error } = await supabase
      .from("giveaway_draws")
      .insert({
        giveaway_id: giveawayId,
        drawn_by: drawnBy,
        winner_id: winner.user_id,
        draw_number: drawNumber,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase
      .from("giveaways")
      .update({
        winner_id: winner.user_id,
        winner_drawn_at: new Date().toISOString(),
        winner_drawn_by: drawnBy,
        status: "awarded",
      })
      .eq("id", giveawayId);

    return data;
  },
};
