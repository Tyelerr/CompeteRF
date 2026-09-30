// app/+native-intent.tsx
// expo-router calls redirectSystemPath for EVERY native deep link — the one that launched the
// app (initial: true) and ones that arrive while it is running (initial: false) — with the full
// raw URL, before routing (routing drops the #fragment, where Supabase puts recovery tokens and
// errors). Password-recovery links are captured for the reset screen and routed to the clean
// /reset-password path (tokens never go into navigation state); every other link is returned
// unchanged. Web reads the browser URL directly instead.

import { Platform } from "react-native";
import { routeIncomingLink } from "../src/utils/recovery-link";
import { useRecoveryLinkStore } from "../src/viewmodels/stores/recovery-link.store";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (Platform.OS === "web") return path;
  try {
    return routeIncomingLink(path, (url) => useRecoveryLinkStore.getState().capture(url));
  } catch {
    return path; // never break normal deep linking
  }
}
