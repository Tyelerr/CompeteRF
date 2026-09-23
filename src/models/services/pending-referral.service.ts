// src/models/services/pending-referral.service.ts
// Device-local holding spot for a referral code between a /r link (or the signup field, or the
// Android install referrer) and the server-side claim, surviving signup/login/app restarts.
// Holds only the public code, its source and an optional analytics visit id. Expires after
// 30 days. AsyncStorage maps to localStorage on web; the windowless static-render pass is
// skipped (same guard as src/lib/supabase.ts).
//
// Also remembers the referral_visits id per code for 24 h, so one browser logs at most one Raw
// Click per code per day (the server holds no identity to dedupe on).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { PendingReferral, ReferralSource } from "../types/referral.types";
import { isWellFormedReferralCode, normalizeReferralCode } from "../../utils/referral";

const STORAGE_KEY = "pendingReferral";
const VISIT_KEY_PREFIX = "referralVisit:";
export const PENDING_REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFERRAL_VISIT_DEDUPE_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVisitId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const storageAvailable = () => Platform.OS !== "web" || typeof window !== "undefined";

export const pendingReferralService = {
  async save(code: string, source: ReferralSource, visitId?: string | null): Promise<void> {
    if (!storageAvailable() || !isWellFormedReferralCode(code)) return;
    const value: PendingReferral = {
      code: normalizeReferralCode(code),
      source,
      savedAt: Date.now(),
      visitId: isVisitId(visitId) ? visitId : null,
    };
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
      return { ...(parsed as PendingReferral), visitId: isVisitId(parsed.visitId) ? parsed.visitId : null };
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

  /** This browser's visit id for a code if logged within the last 24 h (dedupe), else null. */
  async getRecentVisit(code: string): Promise<string | null> {
    if (!storageAvailable()) return null;
    try {
      const raw = await AsyncStorage.getItem(VISIT_KEY_PREFIX + normalizeReferralCode(code));
      if (!raw) return null;
      const { id, at } = JSON.parse(raw) as { id?: string; at?: number };
      return isVisitId(id) && typeof at === "number" && Date.now() - at < REFERRAL_VISIT_DEDUPE_MS ? id : null;
    } catch {
      return null;
    }
  },

  async rememberVisit(code: string, visitId: string): Promise<void> {
    if (!storageAvailable() || !isVisitId(visitId)) return;
    try {
      await AsyncStorage.setItem(VISIT_KEY_PREFIX + normalizeReferralCode(code), JSON.stringify({ id: visitId, at: Date.now() }));
    } catch {
      /* ignore */
    }
  },
};
