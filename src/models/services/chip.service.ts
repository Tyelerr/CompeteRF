// src/models/services/chip.service.ts
// Persistence for the Chip Tournament format. The entire chip state lives in
// tournaments.live_settings.chip (TD-owned JSONB) — see CHIP_TOURNAMENT.md. This
// service is a thin load/merge-save wrapper; all rules live in chip.engine.ts.

import { supabase } from "../../lib/supabase";
import { ChipFormat, ChipState } from "../types/chip.types";
import { Tournament } from "../types/tournament.types";
import { TournamentLiveSettings } from "../types/tournament-settings.types";
import { TournamentLiveState } from "../types/common.types";
import { emptyChipState } from "./chip.engine";

export interface ChipTournamentBundle {
  tournament: Tournament;
  chip: ChipState; // initialized from settings if the blob is absent
}

export const chipService = {
  // Load the tournament + its chip blob. If the tournament has no chip state yet
  // (just created via the format), seed an empty one (default singles).
  async load(id: number): Promise<ChipTournamentBundle> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (!data) throw new Error("Tournament not found.");
    const t = data as Tournament;
    const ls = (t.live_settings ?? {}) as TournamentLiveSettings;
    const chip = ls.chip ?? emptyChipState("singles");
    return { tournament: t, chip };
  },

  // Merge the chip blob back into live_settings without clobbering sibling keys.
  async save(id: number, chip: ChipState): Promise<void> {
    const { data: cur, error: readErr } = await supabase
      .from("tournaments")
      .select("live_settings")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;
    const ls = ((cur?.live_settings ?? {}) as TournamentLiveSettings) || {};
    const next: TournamentLiveSettings = { ...ls, chip };
    const { error } = await supabase
      .from("tournaments")
      .update({ live_settings: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  // Tournament name lives on the row, not in the chip blob.
  async setName(id: number, name: string): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  async setLiveState(id: number, state: TournamentLiveState): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ live_state: state, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  // Persist chip state AND flip the tournament live (Review & Start).
  async start(id: number, chip: ChipState): Promise<void> {
    await chipService.save(id, chip);
    await chipService.setLiveState(id, "in_progress");
  },
};

export const seedChipFormat = (fmt: ChipFormat): ChipState => emptyChipState(fmt);
