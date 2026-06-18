// src/utils/web-alert.ts
// ─────────────────────────────────────────────────────────────────────────────
// react-native-web ships Alert.alert as a no-op (`static alert() {}`), so every
// confirmation / prompt / menu dialog in the app silently does nothing on web.
//
// Browser confirm()/alert() can only show OK/Cancel, which can't represent an
// action-sheet-style menu (e.g. Settings → Edit Profile / Notifications / Sign
// Out / Cancel). So instead we hand the alert to an in-app host component
// (WebAlertHost) that renders ALL the buttons in a styled modal. Until that host
// mounts we fall back to native confirm()/alert().
//
// Import this once for its side effect at app entry, before any Alert.alert call.
// ─────────────────────────────────────────────────────────────────────────────

import { Alert, Platform } from "react-native";

export interface WebAlertButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
}
export interface WebAlertPayload {
  title?: string;
  message?: string;
  buttons?: WebAlertButton[];
}

let handler: ((payload: WebAlertPayload) => void) | null = null;
export const setWebAlertHandler = (
  fn: ((payload: WebAlertPayload) => void) | null,
): void => {
  handler = fn;
};

if (Platform.OS === "web" && typeof window !== "undefined") {
  const patched = (
    title?: string,
    message?: string,
    buttons?: WebAlertButton[],
  ): void => {
    // Preferred path: the in-app modal host renders every button.
    if (handler) {
      handler({ title, message, buttons });
      return;
    }
    // Fallback before the host mounts: native dialogs (OK/Cancel only).
    const text = [title, message].filter(Boolean).join("\n\n");
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const confirmed = window.confirm(text);
    const cancelBtn = buttons.find((b) => b.style === "cancel");
    const primaryBtn =
      buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];
    if (confirmed) primaryBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  };

  (Alert as unknown as { alert: typeof patched }).alert = patched;
}
