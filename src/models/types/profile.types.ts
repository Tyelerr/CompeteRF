import { UserRole, UserStatus, Language } from './common.types';

export interface Profile {
  id: string;
  id_auto: number;
  email: string;
  name: string;
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
  name: string;
  user_name: string;
  home_state: string;
  home_city?: string;
  zip_code?: string;
  avatar_url?: string;
  preferred_game?: string;
  favorite_player?: string;
}

export interface ProfileUpdate {
  name?: string;
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