import { supabase } from "../../lib/supabase";

export interface UserTemplate {
  id: number;
  user_id: number;
  name: string;
  game_type: string | null;
  tournament_format: string | null;
  game_spot: string | null;
  race: string | null;
  description: string | null;
  max_fargo: number | null;
  required_fargo_games: number | null;
  entry_fee: number | null;
  added_money: number | null;
  side_pots: { name: string; amount: string }[] | null;
  reports_to_fargo: boolean;
  open_tournament: boolean;
  table_size: string | null;
  number_of_tables: number | null;
  equipment: string | null;
  thumbnail: string | null;
  chip_ranges: { label: string; minRating: number; maxRating: number; chips: number }[] | null;
  calcutta: boolean;
  created_at: string;
  updated_at: string;
}

export type UserTemplateInsert = Omit<UserTemplate, "id" | "created_at" | "updated_at">;

export const MAX_USER_TEMPLATES = 5;

export const TournamentTemplateUserService = {
  // ── Fetch all templates for a user (max 5) ───────────────────────────────
  async getUserTemplates(userId: number): Promise<UserTemplate[]> {
    const { data, error } = await supabase
      .from("tournament_templates_user")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_USER_TEMPLATES);

    if (error) throw error;
    return (data as UserTemplate[]) ?? [];
  },

  // ── Save a new template (enforces 5-template max) ────────────────────────
  async saveTemplate(template: UserTemplateInsert): Promise<UserTemplate> {
    // Check current count first
    const { count, error: countError } = await supabase
      .from("tournament_templates_user")
      .select("*", { count: "exact", head: true })
      .eq("user_id", template.user_id);

    if (countError) throw countError;
    if ((count ?? 0) >= MAX_USER_TEMPLATES) {
      throw new Error(`You can only save up to ${MAX_USER_TEMPLATES} templates. Delete one to add a new one.`);
    }

    const { data, error } = await supabase
      .from("tournament_templates_user")
      .insert(template)
      .select()
      .single();

    if (error) throw error;
    return data as UserTemplate;
  },

  // ── Update an existing template ──────────────────────────────────────────
  async updateTemplate(id: number, updates: Partial<UserTemplateInsert>): Promise<UserTemplate> {
    const { data, error } = await supabase
      .from("tournament_templates_user")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as UserTemplate;
  },

  // ── Delete a template ────────────────────────────────────────────────────
  async deleteTemplate(id: number, userId: number): Promise<void> {
    const { error } = await supabase
      .from("tournament_templates_user")
      .delete()
      .eq("id", id)
      .eq("user_id", userId); // safety: only delete own templates

    if (error) throw error;
  },
};
