// src/models/services/rate-limit.service.ts
// ═══════════════════════════════════════════════════════════
// Message rate limiting
// Model layer: Supabase queries only. No React, no hooks.
// ═══════════════════════════════════════════════════════════

import { supabase } from "../../lib/supabase";
import {
  MessageRateLimit,
  RateLimitStatus,
  SenderRole,
  RATE_LIMITS,
} from "../types/notification.types";

export const rateLimitService = {
  /**
   * Check if a sender is allowed to send a message.
   * Auto-resets daily counter if it's a new day.
   * Creates row if first-time sender.
   */
  async checkRateLimit(
    senderId: string,
    senderRole: SenderRole,
  ): Promise<RateLimitStatus> {
    const limits = RATE_LIMITS[senderRole];

    // Get or create rate limit row
    let rateLimit = await this.getOrCreate(senderId, senderRole);

    // Reset daily counter if new day
    const today = new Date().toISOString().split("T")[0];
    if (rateLimit.last_reset_date !== today) {
      rateLimit = await this.resetDaily(senderId, today);
    }

    // Check cooldown
    if (rateLimit.last_message_at && limits.cooldown_minutes > 0) {
      const lastSent = new Date(rateLimit.last_message_at);
      const cooldownEnd = new Date(
        lastSent.getTime() + limits.cooldown_minutes * 60 * 1000,
      );
      const now = new Date();

      if (now < cooldownEnd) {
        return {
          allowed: false,
          reason: `Please wait ${Math.ceil((cooldownEnd.getTime() - now.getTime()) / 60000)} minutes before sending again`,
          daily_remaining: limits.daily - rateLimit.messages_today,
          weekly_remaining: limits.weekly - rateLimit.messages_this_week,
          next_available_at: cooldownEnd.toISOString(),
        };
      }
    }

    // Check daily limit
    if (rateLimit.messages_today >= limits.daily) {
      return {
        allowed: false,
        reason: "Daily message limit reached",
        daily_remaining: 0,
        weekly_remaining: limits.weekly - rateLimit.messages_this_week,
      };
    }

    // Check weekly limit
    if (rateLimit.messages_this_week >= limits.weekly) {
      return {
        allowed: false,
        reason: "Weekly message limit reached",
        daily_remaining: limits.daily - rateLimit.messages_today,
        weekly_remaining: 0,
      };
    }

    return {
      allowed: true,
      daily_remaining: limits.daily - rateLimit.messages_today,
      weekly_remaining: limits.weekly - rateLimit.messages_this_week,
    };
  },

  /**
   * Increment counters after a successful send.
   */
  async incrementCount(senderId: string): Promise<void> {
    // Use raw SQL to do atomic increment
    const { error } = await supabase.rpc("increment_rate_limit", {
      p_sender_id: senderId,
    });

    // Fallback if RPC doesn't exist yet: manual update
    if (error) {
      const { data } = await supabase
        .from("message_rate_limits")
        .select("messages_today, messages_this_week")
        .eq("sender_id", senderId)
        .single();

      if (data) {
        await supabase
          .from("message_rate_limits")
          .update({
            messages_today: data.messages_today + 1,
            messages_this_week: data.messages_this_week + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("sender_id", senderId);
      }
    }
  },

  /**
   * Get existing rate limit row or create one for first-time sender.
   */
  async getOrCreate(
    senderId: string,
    senderRole: SenderRole,
  ): Promise<MessageRateLimit> {
    const { data, error } = await supabase
      .from("message_rate_limits")
      .select("*")
      .eq("sender_id", senderId)
      .maybeSingle();

    if (error) throw error;

    if (data) return data;

    // First-time sender: create row
    const { data: newData, error: insertError } = await supabase
      .from("message_rate_limits")
      .insert({
        sender_id: senderId,
        sender_role: senderRole,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return newData;
  },

  /**
   * Reset daily counter (called when last_reset_date !== today).
   */
  async resetDaily(
    senderId: string,
    today: string,
  ): Promise<MessageRateLimit> {
    const { data, error } = await supabase
      .from("message_rate_limits")
      .update({
        messages_today: 0,
        last_reset_date: today,
      })
      .eq("sender_id", senderId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
