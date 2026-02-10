// src/viewmodels/hooks/use.notification.preferences.ts
// ═══════════════════════════════════════════════════════════
// Notification preferences management
// ViewModel layer: React hooks + service calls. No JSX. No Supabase.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { notificationService } from "../../models/services/notification.service";
import {
  NotificationPreferences,
  PREFERENCE_CATEGORIES,
  PreferenceCategory,
} from "../../models/types/notification.types";

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  devicePermission: "granted" | "denied" | "undetermined";
  categories: PreferenceCategory[];
  togglePreference: (
    key: PreferenceCategory["key"],
    value: boolean,
  ) => Promise<void>;
  setQuietHours: (
    start: string | null,
    end: string | null,
  ) => Promise<void>;
  openDeviceSettings: () => void;
  refresh: () => Promise<void>;
}

export function useNotificationPreferences(
  userId?: string,
): UseNotificationPreferencesReturn {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devicePermission, setDevicePermission] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");

  const loadPreferences = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);

    try {
      const prefs = await notificationService.getPreferences(userId);
      setPreferences(prefs);
    } catch (err) {
      console.error("Load preferences error:", err);
      setError("Failed to load notification preferences");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const checkDevicePermission = useCallback(async () => {
    const status = await notificationService.getPermissionStatus();
    setDevicePermission(status);
  }, []);

  useEffect(() => {
    if (userId) {
      loadPreferences();
      checkDevicePermission();
    }
  }, [userId, loadPreferences, checkDevicePermission]);

  async function togglePreference(
    key: PreferenceCategory["key"],
    value: boolean,
  ): Promise<void> {
    if (!userId || !preferences) return;

    const prev = preferences;
    setPreferences({ ...preferences, [key]: value });
    setIsSaving(true);

    try {
      const updated = await notificationService.updatePreferences(userId, {
        [key]: value,
      });
      setPreferences(updated);
    } catch (err) {
      setPreferences(prev);
      console.error("Toggle preference error:", err);
      Alert.alert("Error", "Failed to update preference. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function setQuietHours(
    start: string | null,
    end: string | null,
  ): Promise<void> {
    if (!userId || !preferences) return;

    setIsSaving(true);
    try {
      const updated = await notificationService.updatePreferences(userId, {
        quiet_hours_start: start,
        quiet_hours_end: end,
      });
      setPreferences(updated);
    } catch (err) {
      console.error("Set quiet hours error:", err);
      Alert.alert("Error", "Failed to update quiet hours.");
    } finally {
      setIsSaving(false);
    }
  }

  function openDeviceSettings() {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  }

  const refresh = useCallback(async () => {
    await loadPreferences();
    await checkDevicePermission();
  }, [loadPreferences, checkDevicePermission]);

  return {
    preferences,
    isLoading,
    isSaving,
    error,
    devicePermission,
    categories: PREFERENCE_CATEGORIES,
    togglePreference,
    setQuietHours,
    openDeviceSettings,
    refresh,
  };
}
