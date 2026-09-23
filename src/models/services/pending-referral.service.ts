// src/models/services/pending-referral.service.ts
// Device-local holding spot for a referral code between a /r link (or the signup field) and the
// server-side claim, surviving signup/login/app restarts. Holds only the public code + source.
// Expires after 30 days. AsyncStorage maps to localStorage on web; the windowless static-render
// pass is skipped (same guard as src/lib/supabase.ts).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { PendingReferral, ReferralSource } from "../types/referral.types";
import { isWellFormedReferralCode, normalizeReferralCode } from "../../utils/referral";

const STORAGE_KEY = "pendingReferral";
export const PENDING_REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const storageAvailable = () => Platform.OS !== "web" || typeof window !== "undefined";

export const pendingReferralService = {
  async save(code: string, source: ReferralSource): Promise<void> {
    if (!storageAvailable() || !isWellFormedReferralCode(code)) return;
    const value: PendingReferral = { code: normalizeReferralCode(code), source, savedAt: Date.now() };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* private mode / storage disabled — the manual code field still works */
    }
  },

  /** The pending referral, or null when absent, malformed or older than 30 days (then cleared). */
  async get(): Promise<PendingReferral | null> {
    if (!storageAvailable()) return null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingReferral>;
      const valid =
        typeof parsed.code === "string" &&
        isWellFormedReferralCode(parsed.code) &&
        (parsed.source === "link" || parsed.source === "manual") &&
        typeof parsed.savedAt === "number" &&
        Date.now() - parsed.savedAt < PENDING_REFERRAL_TTL_MS;
      if (!valid) {
        await pendingReferralService.clear();
        return null;
      }
      return parsed as PendingReferral;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    if (!storageAvailable()) return;
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};
