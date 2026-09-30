// src/viewmodels/stores/pending-confirmation.store.ts
// The address a confirmation email was (or should be) sent to, for the Check Your Email screen.
// Kept in memory — never in the URL, so the email never lands in browser history or logs. After a
// reload it is gone and the screen simply asks for the address again.

import { create } from "zustand";
import type { CheckEmailMode } from "../../utils/email-confirmation";

interface PendingConfirmationState {
  email: string | null;
  mode: CheckEmailMode;
  /** When a confirmation email was last requested (drives the resend cooldown). */
  lastSentAt: number | null;
  start: (email: string, mode: CheckEmailMode, lastSentAt: number | null) => void;
  markSent: (at: number) => void;
  clear: () => void;
}

export const usePendingConfirmationStore = create<PendingConfirmationState>((set) => ({
  email: null,
  mode: "signup",
  lastSentAt: null,
  start: (email, mode, lastSentAt) => set({ email, mode, lastSentAt }),
  markSent: (at) => set({ lastSentAt: at }),
  clear: () => set({ email: null, mode: "signup", lastSentAt: null }),
}));
