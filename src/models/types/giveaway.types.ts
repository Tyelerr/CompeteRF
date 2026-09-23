import { GiveawayStatus } from "./common.types";

/**
 * legacy_single — the original model: one free entry per user via the entry form (all giveaways
 *                 created before the wallet system are grandfathered as this).
 * wallet        — users spend Giveaway Entries (1 credit = 1 draw chance), capped per user.
 */
export type GiveawayEntryMode = "legacy_single" | "wallet";

export interface Giveaway {
  id: number;
  name: string;
  description: string | null;
  description_es: string | null;
  prize_value: number | null;
  image_url: string | null;
  rules_text: string | null;
  min_age: number;
  end_date: string | null;
  max_entries: number | null;
  status: GiveawayStatus;
  entry_mode: GiveawayEntryMode;
  /** Wallet giveaways only: max draw entries one user may hold. */
  per_user_max: number | null;
  end_type?: "date" | "entries" | "both" | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  /** Set when a draft is first published (null = never published). */
  published_at?: string | null;
  winner_id: number | null;
  winner_display_name?: string | null;
  winner_drawn_at: string | null;
  winner_drawn_by: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  archived_at: string | null;
  /** Total draw entries (SUM of quantity; equals the entrant count for legacy giveaways). */
  entry_count?: number;
}

/** publish_giveaway outcome ('published' is returned exactly once per giveaway). */
export interface GiveawayPublishResult {
  ok: boolean;
  status:
    | "published"
    | "already_published"
    | "wallet_publish_on_hold"
    | "not_draft"
    | "not_found"
    | "name_required"
    | "end_date_in_past"
    | "end_condition_required"
    | "per_user_max_exceeds_capacity";
  entry_mode?: GiveawayEntryMode;
}

export interface GiveawayEntry {
  id: number;
  giveaway_id: number;
  user_id: number;
  name_as_on_id: string;
  birthday: string;
  email: string;
  phone: string;
  agreed_to_rules: boolean;
  agreed_to_privacy: boolean;
  confirmed_age: boolean;
  opted_in_promotions: boolean;
  /** Draw entries owned (always 1 for legacy giveaways). */
  quantity: number;
  created_at: string;
}

export interface GiveawayStats {
  completedCount: number;
  totalValueGiven: number;
  frequency: "Weekly" | "Bi-weekly" | "2-3x Monthly" | "Monthly" | "Ongoing";
  activeCount: number;
}

export interface WinnerHistoryRecord {
  id: number;
  giveaway_id: number;
  user_id: number;
  entry_id: number;
  status: "winner" | "disqualified";
  drawn_at: string;
  drawn_by: number;
  disqualified_at: string | null;
  disqualified_by: number | null;
  disqualified_reason: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
}

export interface GiveawayEntryForm {
  name_as_on_id: string;
  birthday: { month: string; day: string; year: string };
  email: string;
  phone: string;
  confirmed_age: boolean;
  agreed_to_rules: boolean;
  agreed_to_privacy: boolean;
  understood_one_entry: boolean;
  opted_in_promotions: boolean;
}

export const INITIAL_ENTRY_FORM: GiveawayEntryForm = {
  name_as_on_id: "",
  birthday: { month: "", day: "", year: "" },
  email: "",
  phone: "",
  confirmed_age: false,
  agreed_to_rules: false,
  agreed_to_privacy: false,
  understood_one_entry: false,
  opted_in_promotions: false,
};

// Persisted personal info reused across giveaway entries.
// Sourced from the user most recent giveaway_entries row � no extra table needed.
export interface GiveawaySavedInfo {
  name_as_on_id: string;
  birthday: string; // ISO date: YYYY-MM-DD
  email: string;
  phone: string;
}
