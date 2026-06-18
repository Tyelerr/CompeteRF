// src/utils/web-alert.ts
// ─────────────────────────────────────────────────────────────────────────────
// react-native-web ships Alert.alert as a no-op (`static alert() {}`), so every
// confirmation / prompt / success dialog in the app silently does nothing on web
// — buttons and icon actions that rely on a confirm just appear "dead."
//
// This patches Alert.alert on web to a working implementation backed by the
// browser's native alert()/confirm(), mapping the pressed result to the matching
// RN button's onPress. Import this once for its side effect at app entry, before
// any Alert.alert call.
// ─────────────────────────────────────────────────────────────────────────────

import { Alert, Platform } from "react-native";

interface WebAlertButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
}

if (Platform.OS === "web" && typeof window !== "undefined") {
  const patched = (
    title?: string,
    message?: string,
    buttons?: WebAlertButton[],
  ): void => {
    const text = [title, message].filter(Boolean).join("\n\n");

    // No buttons or a single button → informational alert, then fire its handler.
    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }
    if (buttons.length === 1) {
      window.alert(text);
      buttons[0]?.onPress?.();
      return;
    }

    // Two or more buttons → confirm. OK runs the primary (first non-cancel, or the
    // last button); Cancel runs the cancel-styled button if there is one.
    const confirmed = window.confirm(text);
    const cancelBtn = buttons.find((b) => b.style === "cancel");
    const primaryBtn =
      buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];
    if (confirmed) primaryBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  };

  (Alert as unknown as { alert: typeof patched }).alert = patched;
}
