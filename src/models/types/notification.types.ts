// src/models/types/notification.types.ts
// ─────────────────────────────────────────────────────────
// Notification System Types
// Works alongside existing message.types.ts
// ─────────────────────────────────────────────────────────

import { MessageType } from "./common.types";

// ── Enums ──

export type NotificationCategory =
  | "tournament_update"
  | "search_alert_match"
  | "giveaway_update"
  | "venue_promotion"
  | "app_announcement"
  | "admin_alert";

export type TargetType = "tournament" | "venue" | "state" | "all_users";

export type SenderRole =
  | "tournament_director"
  | "bar_owner"
  | "super_admin"
  | "compete_admin";

export type DeviceType = "ios" | "android" | "web";

// ── Database Row Types ──

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  device_type: DeviceType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  tournament_updates: boolean;
  venue_promotions: boolean;
  app_announcements: boolean;
  search_alert_matches: boolean;
  giveaway_updates: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRateLimit {
  id: string;
  sender_id: string;
  sender_role: SenderRole;
  messages_today: number;
  messages_this_week: number;
  last_message_at: string | null;
  last_reset_date: string;
}

// ── ViewModel / UI Types ──

/** What the inbox displays (message_recipients joined with messages) */
export interface InboxItem {
  recipient_id: number;
  message_id: number;
  subject: string;
  body: string;
  message_type: MessageType;
  sender_name: string;
  sender_role: string;
  tournament_id?: number;
  venue_id?: number;
  read_at: string | null;
  push_sent: boolean;
  created_at: string;
}

/** Compose form state for sending messages */
export interface ComposeMessageForm {
  subject: string;
  body: string;
  message_type: MessageType;
  target_type: TargetType;
  tournament_id: number | null;
  venue_id: number | null;
  target_name: string;
}

export const INITIAL_COMPOSE_FORM: ComposeMessageForm = {
  subject: "",
  body: "",
  message_type: "general",
  target_type: "tournament",
  tournament_id: null,
  venue_id: null,
  target_name: "",
};

/** Rate limit check result */
export interface RateLimitStatus {
  allowed: boolean;
  reason?: string;
  daily_remaining: number;
  weekly_remaining: number;
  next_available_at?: string;
}

/** Result of sending a message */
export interface SendMessageResult {
  success: boolean;
  message_id?: number;
  recipient_count?: number;
  error?: string;
}

/** Admin broadcast filter */
export interface BroadcastFilter {
  target_type: "all_users" | "state";
  states: string[];
}

/** Message history with delivery stats (admin view) */
export interface MessageStats {
  message_id: number;
  subject: string;
  body: string;
  message_type: MessageType;
  sent_at: string;
  recipient_count: number;
  read_count: number;
  read_rate: number;
  tournament_id?: number;
  venue_id?: number;
  target_name?: string;
}

/** Notification preference category for settings screen */
export interface PreferenceCategory {
  key: keyof Pick<
    NotificationPreferences,
    | "tournament_updates"
    | "venue_promotions"
    | "app_announcements"
    | "search_alert_matches"
    | "giveaway_updates"
  >;
  label: string;
  description: string;
  icon: string;
}

export const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    key: "tournament_updates",
    label: "Tournament Updates",
    description:
      "Cancellations, schedule changes, and updates for tournaments you favorited",
    icon: "\uD83C\uDFC6",
  },
  {
    key: "venue_promotions",
    label: "Venue Promotions",
    description:
      "Drink specials, events, and announcements from bars you follow",
    icon: "\uD83C\uDFE2",
  },
  {
    key: "app_announcements",
    label: "App Announcements",
    description: "New features, updates, and Compete news",
    icon: "\uD83D\uDCE2",
  },
  {
    key: "search_alert_matches",
    label: "Search Alert Matches",
    description: "When a new tournament matches your saved search alerts",
    icon: "\uD83D\uDD14",
  },
  {
    key: "giveaway_updates",
    label: "Giveaway Updates",
    description: "New giveaways, winner announcements, and entry reminders",
    icon: "\uD83C\uDF81",
  },
];

/** Rate limits per role */
export const RATE_LIMITS: Record<
  SenderRole,
  { daily: number; weekly: number; cooldown_minutes: number }> = {
  tournament_director: { daily: 3, weekly: 10, cooldown_minutes: 30 },
  bar_owner: { daily: 3, weekly: 10, cooldown_minutes: 60 },
  super_admin: { daily: 999, weekly: 999, cooldown_minutes: 0 },
  compete_admin: { daily: 5, weekly: 15, cooldown_minutes: 60 },
};