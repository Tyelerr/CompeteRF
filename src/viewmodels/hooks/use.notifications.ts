// src/viewmodels/hooks/use.notifications.ts
// ═══════════════════════════════════════════════════════════
// Push notification registration & incoming notification handling
// ViewModel layer: React hooks + service calls. No JSX. No Supabase.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { notificationService } from "../../models/services/notification.service";

interface UseNotificationsReturn {
  pushToken: string | null;
  permissionStatus: "granted" | "denied" | "undetermined";
  isRegistering: boolean;
  registerForPush: () => Promise<string | null>;
}

/**
 * Call this hook in AuthProvider or root layout.
 * Handles:
 *   1. Push token registration on mount (when userId provided)
 *   2. Listening for incoming notifications (foreground + tap)
 *   3. Routing tapped notifications to correct screen
 */
export function useNotifications(userId?: string): UseNotificationsReturn {
  const router = useRouter();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");
  const [isRegistering, setIsRegistering] = useState(false);

  // Refs for notification listeners
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  /**
   * Request permission, get token, register in database.
   */
  const registerForPush = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;

    setIsRegistering(true);
    try {
      const status = await notificationService.getPermissionStatus();
      setPermissionStatus(status);

      const token = await notificationService.getExpoPushToken();

      if (token) {
        await notificationService.registerPushToken(userId, token);
        setPushToken(token);
        setPermissionStatus("granted");
      }

      return token;
    } catch (error) {
      console.error("Push registration error:", error);
      return null;
    } finally {
      setIsRegistering(false);
    }
  }, [userId]);

  // Register push token when userId is available
  useEffect(() => {
    if (userId) {
      registerForPush();
    }
  }, [userId, registerForPush]);

  // Set up notification listeners
  useEffect(() => {
    // Fired when a notification is received while app is in foreground
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log(
          "Notification received:",
          notification.request.content.title,
        );
      });

    // Fired when user taps on a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        if (data?.deep_link) {
          router.push(data.deep_link as string as any);
        } else if (data?.tournament_id) {
          router.push(
            `/tournament-detail?id=${data.tournament_id}` as any,
          );
        } else {
          router.push("/notifications" as any);
        }
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);

  return {
    pushToken,
    permissionStatus,
    isRegistering,
    registerForPush,
  };
}
