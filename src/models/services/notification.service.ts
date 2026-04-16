// src/models/services/notification.service.ts
// -----------------------------------------------------------
// Push token management and Expo push notification sending
// Model layer: Supabase + Expo API calls only. No React, no hooks.
// -----------------------------------------------------------

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import {
  DeviceType,
  NotificationPreferences,
  PushToken,
} from "../types/notification.types";

// Lazy initialization flag - notification handler is configured on first use
// rather than at module import. This prevents iOS 26 New Arch TurboModule
// crashes when native push infrastructure is not yet ready at app launch.
let handlerConfigured = false;

const configureNotificationHandler = (): void => {
  if (handlerConfigured) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  } catch (err) {
    console.warn("Failed to configure notification handler:", err);
  }
};

export const notificationService = {
  // -- Initialization -------------------------------------------------------

  /**
   * Configure the foreground notification handler. Safe to call multiple times.
   * Must be called before registering listeners, typically after first
   * permission check succeeds.
   */
  ensureHandlerConfigured(): void {
    configureNotificationHandler();
  },

  // -- Push Token Management ------------------------------------------------

  async getExpoPushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log("Push notifications require a physical device");
        return null;
      }

      const { status: existingStatus, canAskAgain } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted" && canAskAgain) {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Push notification permission denied");
        return null;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#2E86C1",
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn("No projectId found for push token request");
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      return tokenData.data;
    } catch (error) {
      console.error("Error getting push token:", error);
      return null;
    }
  },

  async registerPushToken(userId: string, token: string): Promise<void> {
    const { error: removeError } = await supabase
      .from("push_tokens")
      .delete()
      .eq("token", token)
      .neq("user_id", userId);

    if (removeError) {
      console.warn(
        "Could not remove stale token from other accounts:",
        removeError,
      );
    }

    const deviceType: DeviceType = Platform.OS as DeviceType;

    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: userId,
          token: token,
          device_type: deviceType,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      )
      .select()
      .single();

    if (error) {
      console.error("Error registering push token:", error);
      throw error;
    }
  },

  async deactivateToken(token: string): Promise<void> {
    const { error } = await supabase
      .from("push_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("token", token);

    if (error) console.error("Error deactivating token:", error);
  },

  async removeUserTokens(userId: string): Promise<void> {
    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId);

    if (error) console.error("Error removing tokens:", error);
  },

  async getTokensForUsers(userIds: string[]): Promise<PushToken[]> {
    if (userIds.length === 0) return [];

    const { data, error } = await supabase
      .from("push_tokens")
      .select("*")
      .in("user_id", userIds)
      .eq("is_active", true);

    if (error) throw error;
    return data || [];
  },

  // -- Expo Push API --------------------------------------------------------

  async sendPushBatch(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<{ sent: number; failed: string[] }> {
    if (tokens.length === 0) return { sent: 0, failed: [] };

    const uniqueTokens = [...new Set(tokens)];

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default" as const,
      title,
      body,
      data: data || {},
    }));

    const BATCH_SIZE = 100;
    let totalSent = 0;
    const failedTokens: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        const result = await response.json();

        if (result.data) {
          result.data.forEach(
            (
              receipt: { status: string; details?: { error?: string } },
              index: number,
            ) => {
              if (receipt.status === "ok") {
                totalSent++;
              } else if (receipt.details?.error === "DeviceNotRegistered") {
                failedTokens.push(batch[index].to);
              }
            },
          );
        }
      } catch (error) {
        console.error("Push batch error:", error);
      }
    }

    for (const token of failedTokens) {
      await notificationService.deactivateToken(token);
    }

    return { sent: totalSent, failed: failedTokens };
  },

  // -- Notification Preferences --------------------------------------------

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: newData, error: insertError } = await supabase
        .from("notification_preferences")
        .insert({ user_id: userId })
        .select()
        .single();

      if (insertError) throw insertError;
      return newData;
    }

    return data;
  },

  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const { data, error } = await supabase
      .from("notification_preferences")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async isPreferenceEnabled(
    userId: string,
    category: keyof Pick
      NotificationPreferences,
      | "tournament_updates"
      | "venue_promotions"
      | "app_announcements"
      | "search_alert_matches"
      | "giveaway_updates"
    >,
  ): Promise<boolean> {
    const prefs = await notificationService.getPreferences(userId);
    return prefs[category];
  },

  // -- Permission Status ---------------------------------------------------

  async getPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status as "granted" | "denied" | "undetermined";
    } catch (err) {
      console.warn("Error reading permission status:", err);
      return "undetermined";
    }
  },
};
