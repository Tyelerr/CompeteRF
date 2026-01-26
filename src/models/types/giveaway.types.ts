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
  status: "active" | "ended" | "awarded" | "archived";
  winner_id: number | null;
  winner_drawn_at: string | null;
  winner_drawn_by: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  archived_at: string | null;
  // Computed (from join/count)
  entry_count?: number;
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
  created_at: string;
}

export interface GiveawayStats {
  completedCount: number;
  totalValueGiven: number;
  frequency: "Weekly" | "Bi-weekly" | "2-3x Monthly" | "Monthly" | "Ongoing";
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
  // Joined fields
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
  understood_one_entry: boolean; // UI only, not stored in DB
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
