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
  // SMS (text message) channel — see 20260617120000_sms_notifications.sql +
  // 20260729120000_sms_phone_consent.sql.
  // sms_enabled + all sms_consent_* / sms_opted_out_at are SERVER-SET (via the
  // enable_sms_alerts / disable_sms_alerts RPCs), never written directly by clients.
  sms_enabled: boolean;
  sms_match_alerts: boolean;
  sms_tournament_reminders: boolean;
  sms_weekly_report: boolean;
  sms_consent_at: string | null;
  sms_consent_source: string | null;
  sms_consent_version: string | null;
  sms_opted_out_at: string | null;
  /**
   * @deprecated Canonical phone now lives on `profiles.phone_number`. Kept as a
   * read-only compatibility field until the app is repointed, then removed in a
   * follow-up migration. Do not write new values.
   */
  sms_phone?: string | null;
  created_at: string;
  updated_at: string;
}

// ── SMS consent audit + delivery (20260729120000_sms_phone_consent.sql) ──

export type SmsConsentAction =
  | "phone_changed"
  | "verification_completed"
  | "opted_in"
  | "opted_out";

export type SmsConsentSource =
  | "app_settings"
  | "onboarding"
  | "web_opt_in"
  | "sms_start_keyword"
  | "admin_migration";

/** Immutable row in sms_consent_events — the full SMS lifecycle history. */
export interface SmsConsentEvent {
  id: number;
  user_id: string;
  phone_number: string | null;
  action: SmsConsentAction;
  consent_version: string | null;
  consent_source: SmsConsentSource | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export type SmsMessageType =
  | "verification"
  | "test_message"
  | "match_ready"
  | "tournament_reminder"
  | "account_update";

export type SmsDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "sending_failed"
  | "delivery_failed";

/** Row in sms_messages — outbound delivery log (populated from Phase 5). */
export interface SmsMessage {
  id: number;
  user_id: string | null;
  tournament_id: number | null;
  match_id: string | null;
  to_e164: string; // FULL number — mask everywhere outside trusted backend/logs
  message_type: SmsMessageType;
  telnyx_message_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  status: SmsDeliveryStatus | null;
  error_code: string | null;
  error_detail: string | null;
  retry_count: number | null;
  last_status_at: string | null;
  created_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
}

/**
 * Frozen SMS consent wording. A MATERIAL wording change must create a NEW version
 * (e.g. "sms-consent-v2"); never change the meaning of an existing version.
 */
export const SMS_CONSENT = {
  version: "sms-consent-v1",
  text:
    "By enabling SMS notifications, you agree to receive automated text messages " +
    "from Compete about match assignments, tournament reminders, and account " +
    "updates. Message and data rates may apply. Reply STOP to opt out and HELP for help.",
} as const;

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

/** SMS alert category for the Text Message Alerts settings section. */
export interface SmsPreferenceCategory {
  key: keyof Pick<
    NotificationPreferences,
    "sms_match_alerts" | "sms_tournament_reminders" | "sms_weekly_report"
  >;
  label: string;
  description: string;
  icon: string;
  // When true, the toggle is only shown to users who run tournaments
  // (tournament directors / bar owners / admins).
  directorOnly?: boolean;
}

export const SMS_PREFERENCE_CATEGORIES: SmsPreferenceCategory[] = [
  {
    key: "sms_match_alerts",
    label: "Match Alerts",
    description:
      "Get a text when it's your turn to play — your table number and opponent.",
    icon: "🎱",
  },
  {
    key: "sms_tournament_reminders",
    label: "Tournament Reminders",
    description:
      "Reminders about tournaments you're registered for — start times and updates.",
    icon: "⏰",
  },
  {
    key: "sms_weekly_report",
    label: "Weekly TD Report",
    description:
      "A weekly summary of your tournaments — entries, payouts, and activity.",
    icon: "📊",
    directorOnly: true,
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