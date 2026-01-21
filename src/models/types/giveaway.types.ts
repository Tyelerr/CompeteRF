import { GiveawayStatus } from "./common.types";

export interface Giveaway {
  id: number;
  name: string;
  description?: string;
  description_es?: string;
  prize_value?: number;
  image_url?: string;
  rules_text?: string;
  min_age: number;
  end_date?: string;
  max_entries?: number;
  status: GiveawayStatus;
  winner_id?: number;
  winner_drawn_at?: string;
  winner_drawn_by?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  ended_at?: string;
  archived_at?: string;
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

export interface GiveawayDraw {
  id: number;
  giveaway_id: number;
  drawn_by: number;
  winner_id: number;
  draw_number: number;
  invalidated: boolean;
  invalidation_reason?: string;
  invalidated_at?: string;
  invalidated_by?: number;
  drawn_at: string;
}
