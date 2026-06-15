// src/models/services/settings-template.service.ts
// Per-TD saved tournament-settings templates. The whole settings form is stored
// as a JSON blob (partial is fine), capped at 5 per user. Only this service talks
// to the tournament_settings_templates table.

import { supabase } from "../../lib/supabase";

export const MAX_SETTINGS_TEMPLATES = 5;

export interface SettingsTemplate {
  id: number;
  user_id: number;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SettingsTemplateInsert {
  user_id: number;
  name: string;
  settings: Record<string, unknown>;
}

export const settingsTemplateService = {
  // Newest first, capped at the limit.
  async getTemplates(userId: number): Promise<SettingsTemplate[]> {
    const { data, error } = await supabase
      .from("tournament_settings_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_SETTINGS_TEMPLATES);
    if (error) throw error;
    return (data as SettingsTemplate[]) ?? [];
  },

  // Save a new template — rejects past the 5-template limit.
  async saveTemplate(template: SettingsTemplateInsert): Promise<SettingsTemplate> {
    const { count, error: countError } = await supabase
      .from("tournament_settings_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", template.user_id);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_SETTINGS_TEMPLATES) {
      throw new Error(
        `You can only save up to ${MAX_SETTINGS_TEMPLATES} settings templates. Delete one to add a new one.`,
      );
    }
    const { data, error } = await supabase
      .from("tournament_settings_templates")
      .insert(template)
      .select()
      .single();
    if (error) throw error;
    return data as SettingsTemplate;
  },

  async updateTemplate(
    id: number,
    updates: Partial<Pick<SettingsTemplate, "name" | "settings">>,
  ): Promise<SettingsTemplate> {
    const { data, error } = await supabase
      .from("tournament_settings_templates")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as SettingsTemplate;
  },

  async deleteTemplate(id: number, userId: number): Promise<void> {
    const { error } = await supabase
      .from("tournament_settings_templates")
      .delete()
      .eq("id", id)
      .eq("user_id", userId); // safety: only delete own
    if (error) throw error;
  },
};
