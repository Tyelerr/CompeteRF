// src/viewmodels/stores/recovery-link.store.ts
// Holds the most recent password-recovery deep link, captured by app/+native-intent.tsx
// BEFORE expo-router routes it (routing drops the URL's #fragment, where Supabase puts the
// tokens). Works for both a cold start (initial URL) and a link that arrives while the app is
// already running. Kept in memory only; the reset screen clears it once it has been used.

import { create } from "zustand";

interface RecoveryLinkState {
  url: string | null;
  /** Increments per captured link, so the screen can tell a NEW link from a re-render. */
  seq: number;
  capture: (url: string) => void;
  clear: () => void;
}

export const useRecoveryLinkStore = create<RecoveryLinkState>((set) => ({
  url: null,
  seq: 0,
  capture: (url) => set((s) => ({ url, seq: s.seq + 1 })),
  clear: () => set({ url: null }),
}));
