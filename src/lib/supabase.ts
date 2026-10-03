import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { authFlowType } from "../utils/google-auth";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loud at module load if env vars are missing. Better to crash with a clear
// error than to let createClient succeed with `undefined` URLs and produce
// confusing network errors on every query.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase environment variables are missing. " +
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY " +
      "in your .env file and rebuild the app.",
  );
}

// ── Auth storage: one adapter per runtime, so auth-js never invokes a storage
// backend that reads `window` where it doesn't exist ─────────────────────────
// Expo Router's web build uses `web.output: "static"`, which renders every route
// in Node (no `window`/`localStorage`) to emit static HTML. Passing AsyncStorage
// there makes auth-js call AsyncStorage's WEB getItem during init, which reads
// `window` → `ReferenceError: window is not defined` at startup. Select by context:
//   • iOS/Android → AsyncStorage (persistent session + auto-refresh preserved).
//   • Web browser → window.localStorage (Supabase's default web store).
//   • Node/static render → no persistence: auth-js uses its in-memory adapter and
//     never touches `window` (persistSession/autoRefresh off for the render pass).
const isNative = Platform.OS !== "web";
const hasWindow = typeof window !== "undefined";

// Minimal no-op used only for the Node render pass (nothing to persist there).
const memoryStorage = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => {},
  removeItem: async (_key: string): Promise<void> => {},
};

const authStorage = isNative
  ? AsyncStorage
  : hasWindow
    ? window.localStorage
    : memoryStorage;
// Persist + auto-refresh everywhere a real storage exists (native + browser);
// off only during the windowless Node render.
const canPersist = isNative || hasWindow;

// App generation marker. The server refuses Chip writes from OLDER app builds once a current build
// has written that tournament (they save without any version check and would overwrite newer
// state) — see supabase/migrations/20261021150000_chip_client_protocol_guard.sql. X-Client-Info is
// the header supabase-js already sends on every request (REST, Functions, Storage) and every Edge
// Function allows in CORS, so overriding it adds no new header. Bump the number only together with
// a server change that relies on it.
export const CHIP_CLIENT_PROTOCOL = 2;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: { "X-Client-Info": `compete-chip/${CHIP_CLIENT_PROTOCOL} supabase-js-${Platform.OS}` },
  },
  auth: {
    storage: authStorage,
    autoRefreshToken: canPersist,
    persistSession: canPersist,
    detectSessionInUrl: false,
    // PKCE only on web and only once web Google sign-in is enabled (src/utils/google-auth.ts);
    // with the flag off this is exactly the previous default ("implicit").
    flowType: authFlowType(!isNative),
  },
});

// On native, Supabase recommends tying the auth auto-refresh loop to the
// foreground/background lifecycle. Without this, the refresh timer can drift
// after long backgrounding and the user can be silently signed out when they
// return to the app. Web uses page visibility internally, so skip there.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}