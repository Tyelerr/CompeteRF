import { supabase } from "../../lib/supabase";
import {
  Tournament,
  TournamentFilters,
  TournamentTemplate,
} from "../types/tournament.types";

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
      .gte("tournament_date", new Date().toISOString().split("T")[0])
      .order("tournament_date", { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    if (filters.state) {
      query = query.eq("venues.state", filters.state);
    }
    if (filters.city) {
      query = query.eq("venues.city", filters.city);
    }
    if (filters.gameType) {
      query = query.eq("game_type", filters.gameType);
    }
    if (filters.tournamentFormat) {
      query = query.eq("tournament_format", filters.tournamentFormat);
    }
    if (filters.tableSize) {
      query = query.eq("table_size", filters.tableSize);
    }
    if (filters.entryFeeMin !== undefined) {
      query = query.gte("entry_fee", filters.entryFeeMin);
    }
    if (filters.entryFeeMax !== undefined) {
      query = query.lte("entry_fee", filters.entryFeeMax);
    }
    if (filters.fargoMax !== undefined) {
      query = query.lte("max_fargo", filters.fargoMax);
    }
    if (filters.openTournament !== undefined) {
      query = query.eq("open_tournament", filters.openTournament);
    }
    if (filters.reportsToFargo !== undefined) {
      query = query.eq("reports_to_fargo", filters.reportsToFargo);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getTournament(id: number): Promise<Tournament | null> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*), profiles!director_id(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getTournamentsByVenue(venueId: number): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("venue_id", venueId)
      .eq("status", "active")
      .gte("tournament_date", new Date().toISOString().split("T")[0])
      .order("tournament_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getTournamentsByDirector(directorId: number): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("director_id", directorId)
      .eq("status", "active")
      .gte("tournament_date", new Date().toISOString().split("T")[0])
      .order("tournament_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createTournament(tournament: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .insert(tournament)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTournament(
    id: number,
    updates: Partial<Tournament>,
  ): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async cancelTournament(
    id: number,
    reason: string,
    cancelledBy: number,
  ): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
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
