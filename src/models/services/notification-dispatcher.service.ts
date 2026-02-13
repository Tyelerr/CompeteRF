// src/models/services/notification-dispatcher.service.ts
// ═══════════════════════════════════════════════════════════
// Central notification dispatcher
// Every notification trigger calls this. It handles:
//   1. Mapping id_auto → uuid (profiles bridge)
//   2. Checking notification_preferences (filters opted-out users)
//   3. Saving to notifications table (in-app history)
//   4. Fetching push_tokens and sending via Expo Push API
//
// IMPORTANT: Some tables use id_auto (integer), others use uuid.
//   - notifications.user_id     → integer (id_auto)
//   - favorites.user_id         → integer (id_auto)
//   - search_alerts.user_id     → integer (id_auto)
//   - push_tokens.user_id       → uuid
//   - notification_preferences  → uuid
//   - profiles.id_auto (int) ↔ profiles.id (uuid)
// ═══════════════════════════════════════════════════════════

import { supabase } from "../../lib/supabase";
import { NotificationPreferences } from "../types/notification.types";
import { notificationService } from "./notification.service";

// ——— Types ————————————————————————————————————————————————

export type NotificationCategory =
  | "tournament_update"
  | "search_alert_match"
  | "giveaway_update"
  | "venue_promotion"
  | "app_announcement"
  | "admin_alert";

/** Maps each category to the preference column that controls it */
const CATEGORY_TO_PREFERENCE: Record<
  NotificationCategory,
  keyof Pick<
    NotificationPreferences,
    | "tournament_updates"
    | "venue_promotions"
    | "app_announcements"
    | "search_alert_matches"
    | "giveaway_updates"
  > | null
> = {
  tournament_update: "tournament_updates",
  search_alert_match: "search_alert_matches",
  giveaway_update: "giveaway_updates",
  venue_promotion: "venue_promotions",
  app_announcement: "app_announcements",
  admin_alert: null, // Admin alerts always go through — no opt-out
};

export interface SendNotificationRequest {
  /** Category determines which preference toggle controls this */
  category: NotificationCategory;

  /** 
   * User IDs to notify. 
   * Pass id_auto (integers) — the dispatcher maps to uuid internally.
   */
  recipientIdAutos: number[];

  /** Push notification title */
  title: string;

  /** Push notification body text */
  body: string;

  /** Optional data payload (deep_link, tournament_id, etc.) */
  data?: Record<string, unknown>;

  /** Save to notifications table for in-app history? Default: true */
  saveToHistory?: boolean;
}

export interface SendNotificationResult {
  /** Total recipients after preference filtering */
  eligibleCount: number;
  /** Successfully sent push notifications */
  sentCount: number;
  /** Filtered out by preferences */
  filteredCount: number;
  /** Tokens that failed (auto-deactivated) */
  failedTokens: string[];
}

// ——— Dispatcher ———————————————————————————————————————————

export const notificationDispatcher = {
  /**
   * Send a notification to a list of users.
   * Handles preference checking, history saving, and push delivery.
   */
  async send(
    request: SendNotificationRequest,
  ): Promise<SendNotificationResult> {
    const {
      category,
      recipientIdAutos,
      title,
      body,
      data = {},
      saveToHistory = true,
    } = request;

    const result: SendNotificationResult = {
      eligibleCount: 0,
      sentCount: 0,
      filteredCount: 0,
      failedTokens: [],
    };

    try {
      if (recipientIdAutos.length === 0) {
        console.log("📭 No recipients — skipping notification");
        return result;
      }

      console.log(
        `🔔 Dispatching "${category}" to ${recipientIdAutos.length} users: ${title}`,
      );

      // ——— Step 1: Map id_auto → uuid via profiles ———————
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, id_auto")
        .in("id_auto", recipientIdAutos);

      if (profileError) {
        console.error("❌ Profile lookup error:", profileError);
        return result;
      }

      if (!profiles || profiles.length === 0) {
        console.log("⚠️ No profiles found for given id_autos");
        return result;
      }

      // Build mapping: id_auto → uuid
      const idAutoToUuid = new Map<number, string>();
      profiles.forEach((p: { id: string; id_auto: number }) => {
        idAutoToUuid.set(p.id_auto, p.id);
      });

      const allUuids = profiles.map((p: { id: string }) => p.id);

      // ——— Step 2: Check preferences (filter opted-out users) ———
      const preferenceKey = CATEGORY_TO_PREFERENCE[category];
      let eligibleUuids: string[] = allUuids;

      if (preferenceKey) {
        const { data: prefs, error: prefError } = await supabase
          .from("notification_preferences")
          .select("user_id, " + preferenceKey)
          .in("user_id", allUuids);

        if (prefError) {
          console.error("⚠️ Preference check error:", prefError);
          // On error, send to everyone (fail open for notifications)
        } else if (prefs && prefs.length > 0) {
          // Users who explicitly opted out
          const optedOutUuids = new Set(
            prefs
              .filter((p: any) => p[preferenceKey] === false)
              .map((p: any) => p.user_id),
          );

          eligibleUuids = allUuids.filter(
            (uuid: string) => !optedOutUuids.has(uuid),
          );

          result.filteredCount = allUuids.length - eligibleUuids.length;

          if (result.filteredCount > 0) {
            console.log(
              `🔇 Filtered out ${result.filteredCount} users (preference: ${preferenceKey})`,
            );
          }
        }
        // If no preference rows exist, users get defaults (all enabled)
      }

      result.eligibleCount = eligibleUuids.length;

      if (eligibleUuids.length === 0) {
        console.log("📭 All users opted out — no notifications sent");
        return result;
      }

      // ——— Step 3: Save to notifications table (in-app history) ———
      if (saveToHistory) {
        // Map eligible uuids back to id_autos for the notifications table
        const eligibleIdAutos = recipientIdAutos.filter((idAuto) => {
          const uuid = idAutoToUuid.get(idAuto);
          return uuid && eligibleUuids.includes(uuid);
        });

        if (eligibleIdAutos.length > 0) {
          const notificationRows = eligibleIdAutos.map((idAuto) => ({
            user_id: idAuto,
            title,
            body,
            category,
            data,
            status: "sent",
            sent_at: new Date().toISOString(),
          }));

          // Batch insert in chunks of 500
          const CHUNK_SIZE = 500;
          for (let i = 0; i < notificationRows.length; i += CHUNK_SIZE) {
            const chunk = notificationRows.slice(i, i + CHUNK_SIZE);
            const { error: insertError } = await supabase
              .from("notifications")
              .insert(chunk);

            if (insertError) {
              console.error("⚠️ Error saving notification history:", insertError);
            }
          }

          console.log(
            `📝 Saved ${eligibleIdAutos.length} notification history rows`,
          );
        }
      }

      // ——— Step 4: Fetch push tokens and send ————————————
      const tokens = await notificationService.getTokensForUsers(eligibleUuids);

      if (tokens.length === 0) {
        console.log("📭 No active push tokens found — notifications saved but not pushed");
        return result;
      }

      const tokenStrings = tokens.map((t) => t.token);

      console.log(
        `📤 Sending push to ${tokenStrings.length} devices...`,
      );

      const pushResult = await notificationService.sendPushBatch(
        tokenStrings,
        title,
        body,
        data as Record<string, unknown>,
      );

      result.sentCount = pushResult.sent;
      result.failedTokens = pushResult.failed;

      console.log(
        `✅ Push complete: ${pushResult.sent} sent, ${pushResult.failed.length} failed`,
      );

      return result;
    } catch (error) {
      console.error("❌ Notification dispatcher error:", error);
      return result;
    }
  },

  // ——— Convenience Methods ———————————————————————————————

  /**
   * Send to users by uuid instead of id_auto.
   * Useful when you already have uuids (e.g., from push_tokens or auth).
   */
  async sendToUuids(
    category: NotificationCategory,
    recipientUuids: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<SendNotificationResult> {
    if (recipientUuids.length === 0) {
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    // Look up id_autos from uuids
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id_auto")
      .in("id", recipientUuids);

    if (error || !profiles) {
      console.error("❌ UUID → id_auto lookup error:", error);
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    const idAutos = profiles.map((p: { id_auto: number }) => p.id_auto);

    return this.send({
      category,
      recipientIdAutos: idAutos,
      title,
      body,
      data,
    });
  },

  /**
   * Send to all admin users.
   * Used for reports, bar requests, support tickets, etc.
   */
  async sendToAdmins(
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<SendNotificationResult> {
    const { data: admins, error } = await supabase
      .from("profiles")
      .select("id_auto")
      .in("role", ["compete_admin", "super_admin"]);

    if (error || !admins || admins.length === 0) {
      console.error("❌ Admin lookup error:", error);
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    const adminIdAutos = admins.map((a: { id_auto: number }) => a.id_auto);

    return this.send({
      category: "admin_alert",
      recipientIdAutos: adminIdAutos,
      title,
      body,
      data,
    });
  },

  /**
   * Send to all users who favorited a specific tournament.
   * Excludes the triggering user (e.g., the director making the change).
   */
  async sendToTournamentFavorites(
    tournamentId: number,
    excludeIdAuto: number | null,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<SendNotificationResult> {
    const { data: favorites, error } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("tournament_id", tournamentId);

    if (error || !favorites || favorites.length === 0) {
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    let userIdAutos = favorites.map((f: { user_id: number }) => f.user_id);

    // Exclude the person who triggered the change
    if (excludeIdAuto) {
      userIdAutos = userIdAutos.filter((id: number) => id !== excludeIdAuto);
    }

    if (userIdAutos.length === 0) {
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    return this.send({
      category: "tournament_update",
      recipientIdAutos: userIdAutos,
      title,
      body,
      data: { tournament_id: tournamentId, ...data },
    });
  },

  /**
   * Send to all active users (for broadcasts, new giveaways, etc.)
   * Use sparingly!
   */
  async sendToAllUsers(
    category: NotificationCategory,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<SendNotificationResult> {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id_auto")
      .eq("is_disabled", false);

    if (error || !users) {
      console.error("❌ All users lookup error:", error);
      return { eligibleCount: 0, sentCount: 0, filteredCount: 0, failedTokens: [] };
    }

    const allIdAutos = users.map((u: { id_auto: number }) => u.id_auto);

    return this.send({
      category,
      recipientIdAutos: allIdAutos,
      title,
      body,
      data,
    });
  },
};
