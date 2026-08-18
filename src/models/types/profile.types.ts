// src/models/types/profile.types.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: Added first_name and last_name fields
// UPDATED: Added is_disabled for App Store compliance
// "name" kept for backward compat during transition
// ═══════════════════════════════════════════════════════════

import { Language, UserRole, UserStatus } from "./common.types";

export interface Profile {
  id: string;
  id_auto: number;
  email: string;
  name: string;                // kept during transition
  first_name?: string;         // NEW
  last_name?: string;          // NEW
  user_name: string;
  avatar_url?: string;
  home_state: string;
  home_city?: string;
  zip_code?: string;
  preferred_game?: string;
  favorite_player?: string;
  language_preference: Language;
  role: UserRole;
  status: UserStatus;
  // Verified Fargo — an attribute of the account, confirmed by a TD at approval
  // (never typed by the player). See migration 20260709120000_fargo_verification.
  fargo?: number | null;
  fargo_status?: "unverified" | "verified";
  fargo_last_verified_at?: string | null;
  fargo_verified_by?: number | null; // id_auto of the TD who confirmed it
  is_disabled?: boolean;       // App Store compliance: eject user
  // Canonical SMS phone identity — see 20260729120000_sms_phone_consent.sql.
  // Server-authoritative: phone_number changes ONLY via the set_sms_phone() RPC,
  // and phone_verified_at/provider/method are set ONLY by the Phase-3 verify path
  // (a DB trigger blocks direct client writes). Deliberately absent from
  // ProfileUpdate so the type system also forbids client writes.
  phone_number?: string | null;             // E.164
  phone_verified_at?: string | null;        // set on successful verification
  phone_verification_provider?: string | null; // e.g. 'telnyx'
  phone_verification_method?: string | null;    // e.g. 'verify_api'
  notify_saved_search_matches: boolean;
  notify_favorite_updates: boolean;
  notify_tournament_reminders: boolean;
  notify_cancellations: boolean;
  notify_new_giveaways: boolean;
  notify_giveaway_winners: boolean;
  notify_promotions: boolean;
  notify_app_updates: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  deleted_at?: string;
}

export interface ProfileInsert {
  id: string;
  email: string;
  name: string;                // kept: still written for backward compat
  first_name: string;          // NEW
  last_name: string;           // NEW
  user_name: string;
  home_state: string;
  home_city?: string;
  zip_code?: string;
  avatar_url?: string;
  preferred_game?: string;
  favorite_player?: string;
}

export interface ProfileUpdate {
  name?: string;               // kept: still written for backward compat
  first_name?: string;         // NEW
  last_name?: string;          // NEW
  avatar_url?: string;
  home_state?: string;
  home_city?: string;
  zip_code?: string;
  preferred_game?: string;
  favorite_player?: string;
  language_preference?: Language;
  notify_saved_search_matches?: boolean;
  notify_favorite_updates?: boolean;
  notify_tournament_reminders?: boolean;
  notify_cancellations?: boolean;
  notify_new_giveaways?: boolean;
  notify_giveaway_winners?: boolean;
  notify_promotions?: boolean;
  notify_app_updates?: boolean;
}
