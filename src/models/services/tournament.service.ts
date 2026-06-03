import { supabase } from "../../lib/supabase";
import { normalizeGameType } from "../../utils/game-type.utils";
import {
  Tournament,
  TournamentFilters,
  TournamentTemplate,
} from "../types/tournament.types";
import { TournamentLiveState } from "../types/common.types";
import { searchAlertService } from "./search-alert.service";

function normalizeTournament<T extends { game_type?: any }>(t: T): T {
  return { ...t, game_type: normalizeGameType(t.game_type) };
}

export { normalizeGameType };

export const tournamentService = {
  async getTournaments(
    filters: TournamentFilters,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Tournament[]; count: number }> {
    let query = supabase
      .from("tournaments")
      .select("*, venues(*), profiles!director_id(*)", { count: "exact" })
      .eq("status", "active")
      .eq("is_hidden", false)
      .gte("tournament_date", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })())
      .order("tournament_date", { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    if (filters.state) query = query.eq("venues.state", filters.state);
    if (filters.city) query = query.eq("venues.city", filters.city);
    if (filters.gameType) query = query.eq("game_type", filters.gameType);
    if (filters.tournamentFormat) query = query.eq("tournament_format", filters.tournamentFormat);
    if (filters.tableSize) query = query.eq("table_size", filters.tableSize);
    if (filters.entryFeeMin !== undefined) query = query.gte("entry_fee", filters.entryFeeMin);
    if (filters.entryFeeMax !== undefined) query = query.lte("entry_fee", filters.entryFeeMax);
    if (filters.fargoMax !== undefined) query = query.lte("max_fargo", filters.fargoMax);
    if (filters.openTournament !== undefined) query = query.eq("open_tournament", filters.openTournament);
    if (filters.reportsToFargo !== undefined) query = query.eq("reports_to_fargo", filters.reportsToFargo);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: (data || []).map(normalizeTournament), count: count || 0 };
  },

  async getTournament(id: number): Promise<Tournament | null> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*), profiles!director_id(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data ? normalizeTournament(data) : null;
  },

  async getTournamentsByVenue(venueId: number): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("venue_id", venueId)
      .eq("status", "active")
      .eq("is_hidden", false)
      .gte("tournament_date", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })())
      .order("tournament_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeTournament);
  },

  async getTournamentsByDirector(directorId: number): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("director_id", directorId)
      .eq("status", "active")
      .gte("tournament_date", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })())
      .order("tournament_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeTournament);
  },

  async createTournament(tournament: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .insert(tournament)
      .select("*, venues(*)")
      .single();
    if (error) throw error;
    if (data) {
      try {
        await searchAlertService.checkTournamentAgainstAlerts(data);
      } catch (err) {
        console.error("[tournament] Error checking alerts on create:", err);
      }
    }
    return normalizeTournament(data);
  },

  async updateTournament(id: number, updates: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, venues(*)")
      .single();
    if (error) throw error;
    const significantFields = ["game_type", "tournament_format", "entry_fee", "max_fargo", "tournament_date", "table_size"];
    const hasSignificantChanges = Object.keys(updates).some((key) => significantFields.includes(key));
    if (hasSignificantChanges && data) {
      try {
        await searchAlertService.checkTournamentAgainstAlerts(data);
      } catch (err) {
        console.error("[tournament] Error re-checking alerts on update:", err);
      }
    }
    return normalizeTournament(data);
  },

  async cancelTournament(id: number, reason: string, cancelledBy: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "cancelled", cancellation_reason: reason, cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  async archiveTournament(id: number, archivedBy: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "archived", archived_at: new Date().toISOString(), archived_by: archivedBy, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  async restoreTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "active", archived_at: null, archived_by: null, cancelled_at: null, cancelled_by: null, cancellation_reason: null, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  async completeTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  async hideTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    if (!data) throw new Error("Hide failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async unhideTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ is_hidden: false, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    if (!data) throw new Error("Unhide failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  // ---- Live engine (live_state / pause / round) --------------------------
  // These drive the runtime engine state, separate from `status` (lifecycle).
  // .select().single() + null guard catches silent RLS failures.

  async setLiveState(
    id: number,
    liveState: TournamentLiveState,
  ): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ live_state: liveState, updated_at: new Date().toISOString() })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Live-state update failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  openRegistration(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "registration_open");
  },

  closeRegistration(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "registration_closed");
  },

  startTournament(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "in_progress");
  },

  finishLiveTournament(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "finished");
  },

  // Pause/resume drive a boolean, NOT a live_state value (the engine stays
  // "in_progress"). paused_at records when the hold started.
  async setPaused(id: number, isPaused: boolean): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({
        is_paused: isPaused,
        paused_at: isPaused ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Pause update failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async setCurrentRound(id: number, round: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ current_round: round, updated_at: new Date().toISOString() })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Round update failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async getTemplates(directorId: number): Promise<TournamentTemplate[]> {
    const { data, error } = await supabase
      .from("tournament_templates")
      .select("*, venues(*)")
      .eq("director_id", directorId)
      .eq("status", "active");
    if (error) throw error;
    return data || [];
  },

  async getTemplate(id: number): Promise<TournamentTemplate | null> {
    const { data, error } = await supabase
      .from("tournament_templates")
      .select("*, venues(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};