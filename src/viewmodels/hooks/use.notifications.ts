// src/viewmodels/hooks/use.notifications.ts
// --------------------------------------------------------------------
// Push notification registration and incoming notification handling
// ViewModel layer: React hooks + service calls. No JSX. No Supabase.
// --------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { notificationService } from "../../models/services/notification.service";

type PermissionStatus = "granted" | "denied" | "undetermined";

interface UseNotificationsReturn {
  pushToken: string | null;
  permissionStatus: PermissionStatus;
  isRegistering: boolean;
  registerForPush: () => Promise<string | null>;
}

/**
 * Call this hook in AuthProvider or root layout.
 * Handles:
 *   1. Push token registration on mount (when userId provided)
 *   2. Listening for incoming notifications (foreground + tap)
 *   3. Routing tapped notifications to correct screen
 *
 * All native module calls are deferred behind InteractionManager and
 * Device.isDevice checks to avoid iOS 26 / New Arch launch crashes.
 */
export function useNotifications(userId?: string): UseNotificationsReturn {
  const router = useRouter();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>("undetermined");
  const [isRegistering, setIsRegistering] = useState(false);

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const listenersRegisteredRef = useRef(false);

  /**
   * Request permission, get token, register in database.
   * Safe to call on simulator - short-circuits via Device.isDevice.
   */
  const registerForPush = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    if (!Device.isDevice) return null;
    if (Platform.OS === "web") return null;

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

  // Defer registration to after interactions/layout settle. This prevents
  // native module calls during React's initial render phase, which crashes
  // on iOS 26 + RN 0.81 + New Arch.
  useEffect(() => {
    if (!userId) return;
    if (Platform.OS === "web") return;
    if (!Device.isDevice) return;

    const task = InteractionManager.runAfterInteractions(() => {
      registerForPush();
    });

    return () => {
      task.cancel();
    };
  }, [userId, registerForPush]);

  // Register notification listeners only after permission is granted.
  // Wrapped in try/catch and deferred to avoid native launch crashes.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!Device.isDevice) return;
    if (permissionStatus !== "granted") return;
    if (listenersRegisteredRef.current) return;

    const task = InteractionManager.runAfterInteractions(() => {
      try {
        notificationService.ensureHandlerConfigured();

        notificationListener.current =
          Notifications.addNotificationReceivedListener((notification) => {
            console.log(
              "Notification received:",
              notification.request.content.title,
            );
          });

        responseListener.current =
          Notifications.addNotificationResponseReceivedListener((response) => {
            try {
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
            } catch (err) {
              console.warn("Error handling notification response:", err);
            }
          });

        listenersRegisteredRef.current = true;
      } catch (err) {
        console.warn("Failed to register notification listeners:", err);
      }
    });

    return () => {
      task.cancel();
      if (notificationListener.current) {
        try {
          notificationListener.current.remove();
        } catch {}
        notificationListener.current = null;
      }
      if (responseListener.current) {
        try {
          responseListener.current.remove();
        } catch {}
        responseListener.current = null;
      }
      listenersRegisteredRef.current = false;
    };
  }, [permissionStatus, router]);

  return {
    pushToken,
    permissionStatus,
    isRegistering,
    registerForPush,
  };
}
