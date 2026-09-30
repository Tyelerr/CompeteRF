// src/models/services/google-signin.provider.ts
// Default (web + fallback) Google provider: unavailable. On iOS/Android Metro resolves
// google-signin.provider.native.ts instead, which is the only file allowed to import the
// native Google Sign-In library — so it can never leak into the React Native Web bundle.
// Web Google sign-in will use Supabase signInWithOAuth (Phase 2), not this provider.
import type { GoogleSignInProvider } from "../types/auth.types";

export const googleSignInProvider: GoogleSignInProvider = {
  isAvailable: async () => false,
  getIdToken: async () => {
    throw new Error("Google sign-in is not available on this platform");
  },
  signOut: async () => {},
};
