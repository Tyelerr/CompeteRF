import { supabase } from "../../lib/supabase";
import {
  Giveaway,
  GiveawayEntry,
  GiveawayEntryForm,
  GiveawayStats,
  WinnerHistoryRecord,
} from "../types/giveaway.types";

export const giveawayService = {
  // ============================================
  // PUBLIC METHODS (for shop page)
  // ============================================

  /**
   * Get all active giveaways with entry counts
   */
  async getActiveGiveaways(): Promise<Giveaway[]> {
    const { data, error } = await supabase
      .from("giveaways")
      .select(
        `
        *,
        entry_count:giveaway_entries(count)
      `,
      )
      .eq("status", "active")
      .order("end_date", { ascending: true });

    if (error) {
      console.error("Error fetching giveaways:", error);
      throw error;
    }

    // Transform the count from array to number
    return (data || []).map((g) => ({
      ...g,
      entry_count: g.entry_count?.[0]?.count || 0,
    }));
  },

  /**
   * Get single giveaway by ID with entry count
   */
  async getGiveawayById(id: number): Promise<Giveaway | null> {
    const { data, error } = await supabase
      .from("giveaways")
      .select(
        `
        *,
        entry_count:giveaway_entries(count)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching giveaway:", error);
      return null;
    }

    return {
      ...data,
      entry_count: data.entry_count?.[0]?.count || 0,
    };
  },

  /**
   * Get stats for completed giveaways (for stats card)
   */
  async getGiveawayStats(): Promise<GiveawayStats> {
    const { data, error } = await supabase
      .from("giveaways")
      .select("id, prize_value, ended_at")
      .in("status", ["ended", "awarded"])
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: true });

    if (error) {
      console.error("Error fetching giveaway stats:", error);
      return {
        completedCount: 0,
        totalValueGiven: 0,
        frequency: "Ongoing",
      };
    }

    const completedCount = data?.length || 0;
    const totalValueGiven =
      data?.reduce((sum, g) => sum + (g.prize_value || 0), 0) || 0;

    // Calculate frequency
    let frequency: GiveawayStats["frequency"] = "Ongoing";

    if (completedCount >= 2) {
      const dates = data
        .filter((g) => g.ended_at)
        .map((g) => new Date(g.ended_at!).getTime())
        .sort((a, b) => a - b);

      if (dates.length >= 2) {
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        const daySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
        const avgDaysBetween = daySpan / (completedCount - 1);

        if (avgDaysBetween <= 7) {
          frequency = "Weekly";
        } else if (avgDaysBetween <= 14) {
          frequency = "Bi-weekly";
        } else if (avgDaysBetween <= 21) {
          frequency = "2-3x Monthly";
        } else if (avgDaysBetween <= 35) {
          frequency = "Monthly";
        } else {
          frequency = "Ongoing";
        }
      }
    }

    return {
      completedCount,
      totalValueGiven,
      frequency,
    };
  },

  /**
   * Get all entries for current user (to check which giveaways they've entered)
   */
  async getUserEntries(userId: number): Promise<GiveawayEntry[]> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching user entries:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Check if user has already entered a specific giveaway
   */
  async hasUserEntered(giveawayId: number, userId: number): Promise<boolean> {
    const { data, error } = await supabase
      .from("giveaway_entries")
      .select("id")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error checking entry:", error);
      return false;
    }

    return !!data;
  },

  /**
   * Submit a giveaway entry
   */
  async createEntry(
    giveawayId: number,
    userId: number,
    form: GiveawayEntryForm,
  ): Promise<{ success: boolean; error?: string }> {
    // Format birthday as date string
    const birthday = `${form.birthday.year}-${form.birthday.month.padStart(2, "0")}-${form.birthday.day.padStart(2, "0")}`;

    const { error } = await supabase.from("giveaway_entries").insert({
      giveaway_id: giveawayId,
      user_id: userId,
      name_as_on_id: form.name_as_on_id.trim(),
      birthday,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      agreed_to_rules: form.agreed_to_rules,
      agreed_to_privacy: form.agreed_to_privacy,
      confirmed_age: form.confirmed_age,
      opted_in_promotions: form.opted_in_promotions,
    });

    if (error) {
      console.error("Error creating entry:", error);

      // Check for duplicate entry
      if (error.code === "23505") {
        return {
          success: false,
          error: "You have already entered this giveaway.",
        };
      }

      return {
        success: false,
        error: error.message || "Failed to submit entry. Please try again.",
      };
    }

    // Check if giveaway should auto-end (max entries reached)
    const { data: giveaway } = await supabase
      .from("giveaways")
      .select("max_entries")
      .eq("id", giveawayId)
      .single();

    if (giveaway?.max_entries) {
      const { count } = await supabase
        .from("giveaway_entries")
        .select("*", { count: "exact", head: true })
        .eq("giveaway_id", giveawayId);

      if (count && count >= giveaway.max_entries) {
        await supabase
          .from("giveaways")
          .update({
            status: "ended",
            ended_at: new Date().toISOString(),
          })
          .eq("id", giveawayId);
      }
    }

    return { success: true };
  },

  /**
   * Get entry count for a specific giveaway
   */
  async getEntryCount(giveawayId: number): Promise<number> {
    const { count, error } = await supabase
      .from("giveaway_entries")
      .select("*", { count: "exact", head: true })
      .eq("giveaway_id", giveawayId);

    if (error) {
      console.error("Error fetching entry count:", error);
      return 0;
    }

    return count || 0;
  },

  // ============================================
  // ADMIN METHODS
  // ============================================

  /**
   * Get all giveaways for admin (includes all statuses)
   */
  async getAllGiveaways(): Promise<Giveaway[]> {
    const { data, error } = await supabase
      .from("giveaways")
      .select(
        `
        *,
        entry_count:giveaway_entries(count),
        winner:profiles!giveaways_winner_id_fkey(name, email)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all giveaways:", error);
      throw error;
    }

    return (data || []).map((g: any) => ({
      ...g,
      entry_count: g.entry_count?.[0]?.count || 0,
      winner_name: g.winner?.name || null,
      winner_email: g.winner?.email || null,
    }));
  },

  /**
   * Get admin overview stats
   */
  async getAdminStats(): Promise<{
    activeCount: number;
    totalEntries: number;
    totalPrizeValue: number;
  }> {
    // Get active giveaways count
    const { count: activeCount } = await supabase
      .from("giveaways")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Get total entries count
    const { count: totalEntries } = await supabase
      .from("giveaway_entries")
      .select("*", { count: "exact", head: true });

    // Get total prize value of active giveaways
    const { data: activeGiveaways } = await supabase
      .from("giveaways")
      .select("prize_value")
      .eq("status", "active");

    const totalPrizeValue =
      activeGiveaways?.reduce((sum, g) => sum + (g.prize_value || 0), 0) || 0;

    return {
      activeCount: activeCount || 0,
      totalEntries: totalEntries || 0,
      totalPrizeValue,
    };
  },

  /**
   * Create a new giveaway
   */
  async createGiveaway(
    giveaway: {
      name: string;
      description?: string;
      prize_value: number;
      max_entries?: number;
      end_date?: string;
      min_age?: number;
      rules_text?: string;
      image_url?: string;
    },
    createdBy: number,
  ): Promise<{ success: boolean; data?: Giveaway; error?: string }> {
    const { data, error } = await supabase
      .from("giveaways")
      .insert({
        name: giveaway.name.trim(),
        description: giveaway.description?.trim() || null,
        prize_value: giveaway.prize_value,
        max_entries: giveaway.max_entries || null,
        end_date: giveaway.end_date || null,
        min_age: giveaway.min_age || 18,
        rules_text: giveaway.rules_text?.trim() || null,
        image_url: giveaway.image_url || null,
        created_by: createdBy,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating giveaway:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  },

  /**
   * Update a giveaway
   */
  async updateGiveaway(
    id: number,
    updates: Partial<{
      name: string;
      description: string;
      prize_value: number;
      max_entries: number;
      end_date: string;
      min_age: number;
      rules_text: string;
      image_url: string;
    }>,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from("giveaways")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating giveaway:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /**
   * End a giveaway (sets status to 'ended')
   */
  async endGiveaway(id: number): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from("giveaways")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error ending giveaway:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /**
   * Draw a random winner for a giveaway
   */
  async drawWinner(
    giveawayId: number,
    drawnBy: number,
  ): Promise<{
    success: boolean;
    winner?: {
      id: number;
      user_id: number;
      name: string;
      email: string;
      phone: string;
    };
    error?: string;
  }> {
    // Get all entries for this giveaway
    const { data: entries, error: entriesError } = await supabase
      .from("giveaway_entries")
      .select("id, user_id, name_as_on_id, email, phone")
      .eq("giveaway_id", giveawayId);

    if (entriesError) {
      console.error("Error fetching entries:", entriesError);
      return { success: false, error: "Failed to fetch entries" };
    }

    if (!entries || entries.length === 0) {
      return { success: false, error: "No entries found for this giveaway" };
    }

    // Pick random winner
    const randomIndex = Math.floor(Math.random() * entries.length);
    const winnerEntry = entries[randomIndex];

    // Get the giveaway prize value for updating total_winnings
    const { data: giveaway } = await supabase
      .from("giveaways")
      .select("prize_value")
      .eq("id", giveawayId)
      .single();

    const prizeValue = giveaway?.prize_value || 0;

    // Update giveaway with winner
    const { error: updateError } = await supabase
      .from("giveaways")
      .update({
        winner_id: winnerEntry.user_id,
        winner_drawn_at: new Date().toISOString(),
        winner_drawn_by: drawnBy,
        status: "awarded",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", giveawayId);

    if (updateError) {
      console.error("Error updating giveaway with winner:", updateError);
      return { success: false, error: "Failed to record winner" };
    }

    // Add to winner history
    await supabase.from("giveaway_winner_history").insert({
      giveaway_id: giveawayId,
      user_id: winnerEntry.user_id,
      entry_id: winnerEntry.id,
      status: "winner",
      drawn_at: new Date().toISOString(),
      drawn_by: drawnBy,
    });

    // Update winner's total_winnings
    if (prizeValue > 0) {
      const { error: profileError } = await supabase.rpc("increment_winnings", {
        user_id: winnerEntry.user_id,
        amount: prizeValue,
      });

      // If RPC doesn't exist, try direct update
      if (profileError) {
        console.log("RPC not available, using direct update");
        const { data: currentProfile } = await supabase
          .from("profiles")
          .select("total_winnings")
          .eq("id_auto", winnerEntry.user_id)
          .single();

        const currentWinnings = currentProfile?.total_winnings || 0;

        await supabase
          .from("profiles")
          .update({
            total_winnings: currentWinnings + prizeValue,
          })
          .eq("id_auto", winnerEntry.user_id);
      }
    }

    return {
      success: true,
      winner: {
        id: winnerEntry.id,
        user_id: winnerEntry.user_id,
        name: winnerEntry.name_as_on_id,
        email: winnerEntry.email,
        phone: winnerEntry.phone,
      },
    };
  },

  /**
   * Archive a giveaway
   */
  async archiveGiveaway(
    id: number,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from("giveaways")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error archiving giveaway:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /**
   * Restore an archived giveaway
   */
  async restoreGiveaway(
    id: number,
  ): Promise<{ success: boolean; error?: string }> {
    // Check if it had a winner - restore to 'awarded', otherwise 'active'
    const { data: giveaway } = await supabase
      .from("giveaways")
      .select("winner_id")
      .eq("id", id)
      .single();

    const newStatus = giveaway?.winner_id ? "awarded" : "active";

    const { error } = await supabase
      .from("giveaways")
      .update({
        status: newStatus,
        archived_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error restoring giveaway:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /**
   * Get all entries (for admin participants view)
   */
  async getAllEntries(
    giveawayId?: number,
  ): Promise<
    (GiveawayEntry & { giveaway_name?: string; giveaway_prize?: number })[]
  > {
    let query = supabase
      .from("giveaway_entries")
      .select(
        `
        *,
        giveaway:giveaways(name, prize_value)
      `,
      )
      .order("created_at", { ascending: false });

    if (giveawayId) {
      query = query.eq("giveaway_id", giveawayId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching all entries:", error);
      return [];
    }

    return (data || []).map((e: any) => ({
      ...e,
      giveaway_name: e.giveaway?.name || "Unknown",
      giveaway_prize: e.giveaway?.prize_value || 0,
    }));
  },

  /**
   * Get past winners
   */
  async getPastWinners(): Promise<
    {
      giveaway_id: number;
      giveaway_name: string;
      prize_value: number;
      winner_name: string;
      winner_email: string;
      drawn_at: string;
      entry_count: number;
    }[]
  > {
    const { data, error } = await supabase
      .from("giveaways")
      .select(
        `
        id,
        name,
        prize_value,
        winner_drawn_at,
        winner:profiles!giveaways_winner_id_fkey(name, email),
        entry_count:giveaway_entries(count)
      `,
      )
      .eq("status", "awarded")
      .not("winner_id", "is", null)
      .order("winner_drawn_at", { ascending: false });

    if (error) {
      console.error("Error fetching past winners:", error);
      return [];
    }

    return (data || []).map((g: any) => ({
      giveaway_id: g.id,
      giveaway_name: g.name,
      prize_value: g.prize_value || 0,
      winner_name: g.winner?.name || "Unknown",
      winner_email: g.winner?.email || "",
      drawn_at: g.winner_drawn_at,
      entry_count: g.entry_count?.[0]?.count || 0,
    }));
  },

  // ============================================
  // REDRAW WINNER METHODS
  // ============================================

  /**
   * Get winner history for a giveaway
   */
  async getWinnerHistory(giveawayId: number): Promise<WinnerHistoryRecord[]> {
    const { data, error } = await supabase
      .from("giveaway_winner_history")
      .select(
        `
        *,
        entry:giveaway_entries(name_as_on_id, email, phone)
      `,
      )
      .eq("giveaway_id", giveawayId)
      .order("drawn_at", { ascending: true });

    if (error) {
      console.error("Error fetching winner history:", error);
      return [];
    }

    return (data || []).map((record: any) => ({
      ...record,
      user_name: record.entry?.name_as_on_id || "Unknown",
      user_email: record.entry?.email || "",
      user_phone: record.entry?.phone || "",
    }));
  },

  /**
   * Get count of eligible entries (excludes disqualified users)
   */
  async getEligibleEntryCount(giveawayId: number): Promise<number> {
    // Get all disqualified user IDs for this giveaway
    const { data: disqualified } = await supabase
      .from("giveaway_winner_history")
      .select("user_id")
      .eq("giveaway_id", giveawayId)
      .eq("status", "disqualified");

    const disqualifiedUserIds = (disqualified || []).map((d) => d.user_id);

    // Count entries excluding disqualified users
    let query = supabase
      .from("giveaway_entries")
      .select("*", { count: "exact", head: true })
      .eq("giveaway_id", giveawayId);

    if (disqualifiedUserIds.length > 0) {
      query = query.not("user_id", "in", `(${disqualifiedUserIds.join(",")})`);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error fetching eligible entry count:", error);
      return 0;
    }

    return count || 0;
  },

  /**
   * Get current winner details for a giveaway
   */
  async getCurrentWinner(giveawayId: number): Promise<{
    id: number;
    user_id: number;
    name: string;
    email: string;
    phone: string;
    drawn_at: string;
  } | null> {
    // First get the giveaway to find winner_id
    const { data: giveaway } = await supabase
      .from("giveaways")
      .select("winner_id, winner_drawn_at")
      .eq("id", giveawayId)
      .single();

    if (!giveaway?.winner_id) return null;

    // Get the winner's entry details
    const { data: entry } = await supabase
      .from("giveaway_entries")
      .select("id, user_id, name_as_on_id, email, phone")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", giveaway.winner_id)
      .single();

    if (!entry) return null;

    return {
      id: entry.id,
      user_id: entry.user_id,
      name: entry.name_as_on_id,
      email: entry.email,
      phone: entry.phone,
      drawn_at: giveaway.winner_drawn_at,
    };
  },

  /**
   * Redraw a new winner (disqualifies current winner)
   */
  async redrawWinner(
    giveawayId: number,
    redrawBy: number,
    disqualificationReason: string,
  ): Promise<{
    success: boolean;
    winner?: {
      id: number;
      user_id: number;
      name: string;
      email: string;
      phone: string;
    };
    error?: string;
  }> {
    // Get current giveaway info
    const { data: giveaway, error: giveawayError } = await supabase
      .from("giveaways")
      .select("winner_id, prize_value")
      .eq("id", giveawayId)
      .single();

    if (giveawayError || !giveaway?.winner_id) {
      return { success: false, error: "Giveaway not found or has no winner" };
    }

    const prizeValue = giveaway.prize_value || 0;
    const oldWinnerId = giveaway.winner_id;

    // Get all disqualified user IDs for this giveaway
    const { data: disqualified } = await supabase
      .from("giveaway_winner_history")
      .select("user_id")
      .eq("giveaway_id", giveawayId)
      .eq("status", "disqualified");

    const disqualifiedUserIds = [
      ...(disqualified || []).map((d) => d.user_id),
      oldWinnerId, // Add current winner to exclusion list
    ];

    // Get eligible entries (excluding all disqualified users)
    let query = supabase
      .from("giveaway_entries")
      .select("id, user_id, name_as_on_id, email, phone")
      .eq("giveaway_id", giveawayId);

    if (disqualifiedUserIds.length > 0) {
      query = query.not("user_id", "in", `(${disqualifiedUserIds.join(",")})`);
    }

    const { data: entries, error: entriesError } = await query;

    if (entriesError) {
      console.error("Error fetching eligible entries:", entriesError);
      return { success: false, error: "Failed to fetch eligible entries" };
    }

    if (!entries || entries.length === 0) {
      return { success: false, error: "No eligible entries remaining" };
    }

    // Mark current winner as disqualified in history
    const { error: disqualifyError } = await supabase
      .from("giveaway_winner_history")
      .update({
        status: "disqualified",
        disqualified_at: new Date().toISOString(),
        disqualified_by: redrawBy,
        disqualified_reason: disqualificationReason,
      })
      .eq("giveaway_id", giveawayId)
      .eq("user_id", oldWinnerId)
      .eq("status", "winner");

    if (disqualifyError) {
      console.error("Error disqualifying winner:", disqualifyError);
      return { success: false, error: "Failed to disqualify current winner" };
    }

    // Subtract prize value from old winner's total_winnings
    if (prizeValue > 0) {
      const { data: oldProfile } = await supabase
        .from("profiles")
        .select("total_winnings")
        .eq("id_auto", oldWinnerId)
        .single();

      const oldWinnings = oldProfile?.total_winnings || 0;

      await supabase
        .from("profiles")
        .update({
          total_winnings: Math.max(0, oldWinnings - prizeValue),
        })
        .eq("id_auto", oldWinnerId);
    }

    // Pick new random winner
    const randomIndex = Math.floor(Math.random() * entries.length);
    const newWinnerEntry = entries[randomIndex];

    // Add new winner to history
    const { error: historyError } = await supabase
      .from("giveaway_winner_history")
      .insert({
        giveaway_id: giveawayId,
        user_id: newWinnerEntry.user_id,
        entry_id: newWinnerEntry.id,
        status: "winner",
        drawn_at: new Date().toISOString(),
        drawn_by: redrawBy,
      });

    if (historyError) {
      console.error("Error adding new winner to history:", historyError);
      return { success: false, error: "Failed to record new winner" };
    }

    // Update giveaway with new winner
    const { error: updateError } = await supabase
      .from("giveaways")
      .update({
        winner_id: newWinnerEntry.user_id,
        winner_drawn_at: new Date().toISOString(),
        winner_drawn_by: redrawBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", giveawayId);

    if (updateError) {
      console.error("Error updating giveaway with new winner:", updateError);
      return { success: false, error: "Failed to update giveaway" };
    }

    // Add prize value to new winner's total_winnings
    if (prizeValue > 0) {
      const { data: newProfile } = await supabase
        .from("profiles")
        .select("total_winnings")
        .eq("id_auto", newWinnerEntry.user_id)
        .single();

      const newWinnings = newProfile?.total_winnings || 0;

      await supabase
        .from("profiles")
        .update({
          total_winnings: newWinnings + prizeValue,
        })
        .eq("id_auto", newWinnerEntry.user_id);
    }

    return {
      success: true,
      winner: {
        id: newWinnerEntry.id,
        user_id: newWinnerEntry.user_id,
        name: newWinnerEntry.name_as_on_id,
        email: newWinnerEntry.email,
        phone: newWinnerEntry.phone,
      },
    };
  },
};
