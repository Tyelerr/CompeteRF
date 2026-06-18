// src/viewmodels/hooks/use.notification.preferences.ts
// ═══════════════════════════════════════════════════════════
// Notification preferences management
// ViewModel layer: React hooks + service calls. No JSX. No Supabase.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { notificationService } from "../../models/services/notification.service";
import { sendSms } from "../../services/sms/smsService";
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
  // Generic save for fields the typed togglePreference doesn't cover
  // (the SMS toggles and the SMS phone number). Optimistic, like togglePreference.
  savePreferences: (
    updates: Partial<NotificationPreferences>,
  ) => Promise<void>;
  isSendingTest: boolean;
  sendTestSms: () => Promise<void>;
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
  const [isSendingTest, setIsSendingTest] = useState(false);

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

  async function savePreferences(
    updates: Partial<NotificationPreferences>,
  ): Promise<void> {
    if (!userId || !preferences) return;

    const prev = preferences;
    setPreferences({ ...preferences, ...updates });
    setIsSaving(true);

    try {
      const updated = await notificationService.updatePreferences(
        userId,
        updates,
      );
      setPreferences(updated);
    } catch (err) {
      setPreferences(prev);
      console.error("Save preferences error:", err);
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // Fire a one-off test text to the saved number so the user can confirm
  // delivery (e.g. once toll-free verification clears).
  async function sendTestSms(): Promise<void> {
    const to = preferences?.sms_phone?.trim();
    if (!to) {
      Alert.alert(
        "Add a number first",
        "Enter your mobile number above before sending a test.",
      );
      return;
    }
    setIsSendingTest(true);
    try {
      const res = await sendSms({
        to,
        body: "Compete: your text alerts are set up correctly. Reply STOP to opt out.",
      });
      if (res.success) {
        Alert.alert(
          "Test sent",
          "Check your phone. If it doesn't arrive, your sending number may still be pending carrier (toll-free) verification.",
        );
      } else {
        Alert.alert("Couldn't send", res.error ?? "Please try again.");
      }
    } finally {
      setIsSendingTest(false);
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
    savePreferences,
    isSendingTest,
    sendTestSms,
    setQuietHours,
    openDeviceSettings,
    refresh,
  };
}
