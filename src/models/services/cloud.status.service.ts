// src/models/services/cloud.status.service.ts
// Web-only helpers for the Chip local-recovery entry point (see chip.local-recovery.ts).
//   • getStoredAuthUserId — the user id of the Supabase session PERSISTED on this browser
//     (localStorage), even when it can't be refreshed offline. Returns the id only — never a
//     token — and grants nothing: it just scopes which local backups may be listed. An
//     explicit sign-out removes the stored session, so the entry point disappears.
//   • probeCloud — can the app reach Supabase right now? (anon, head-only read)

import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { isCloudUnavailableError } from "./chip.local-recovery";

// Same key supabase-js derives by default: `sb-<project ref>-auth-token`.
const storedSessionKey = (): string | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
};

export const cloudStatusService = {
  getStoredAuthUserId(): string | null {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.localStorage) return null;
    const key = storedSessionKey();
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { user?: { id?: unknown } } | null;
      const uid = parsed?.user?.id;
      return typeof uid === "string" && uid ? uid : null;
    } catch {
      return null;
    }
  },

  // true = Supabase answered (even with an error that isn't an outage); false = unreachable.
  async probeCloud(timeoutMs = 6000): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeout = new Promise<{ error: unknown }>((resolve) => {
        timer = setTimeout(() => resolve({ error: new Error("probe timeout") }), timeoutMs);
      });
      const query = supabase
        .from("tournaments")
        .select("id", { head: true })
        .limit(1)
        .then(({ error }) => ({ error: error as unknown }));
      const { error } = await Promise.race([query, timeout]);
      return !error || !isCloudUnavailableError(error);
    } catch (e) {
      return !isCloudUnavailableError(e);
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
};
