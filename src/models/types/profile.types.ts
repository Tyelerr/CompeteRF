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
  is_disabled?: boolean;       // App Store compliance: eject user
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
