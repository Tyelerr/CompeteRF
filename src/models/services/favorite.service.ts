import { supabase } from "../../lib/supabase";
import { Favorite } from "../types/tournament.types";
import { analyticsService } from "./analytics.service";

export const favoriteService = {
  async getFavorites(userId: number): Promise<Favorite[]> {
    const { data, error } = await supabase
      .from("favorites")
      .select("*, tournaments(*), tournament_templates(*)")
      .eq("user_id", userId);
    if (error) throw error;
    return data || [];
  },

  async getFavoriteTournaments(userId: number): Promise<Favorite[]> {
    const { data, error } = await supabase
      .from("favorites")
      .select("*, tournaments(*, venues(*))")
      .eq("user_id", userId)
      .eq("favorite_type", "single")
      .not("tournament_id", "is", null);
    if (error) throw error;
    return data || [];
  },

  async getFavoriteSeries(userId: number): Promise<Favorite[]> {
    const { data, error } = await supabase
      .from("favorites")
      .select("*, tournament_templates(*, venues(*))")
      .eq("user_id", userId)
      .eq("favorite_type", "series")
      .not("template_id", "is", null);
    if (error) throw error;
    return data || [];
  },

  async addFavoriteTournament(
    userId: number,
    tournamentId: number,
  ): Promise<Favorite> {
    const { data, error } = await supabase
      .from("favorites")
      .insert({
        user_id: userId,
        tournament_id: tournamentId,
        favorite_type: "single",
      })
      .select()
      .single();
    if (error) throw error;

    // Track analytics (fire-and-forget)
    analyticsService.trackTournamentFavorited(tournamentId);

    return data;
  },

  async addFavoriteSeries(
    userId: number,
    templateId: number,
  ): Promise<Favorite> {
    const { data, error } = await supabase
      .from("favorites")
      .insert({
        user_id: userId,
        template_id: templateId,
        favorite_type: "series",
      })
      .select()
      .single();
    if (error) throw error;

    // Track analytics (fire-and-forget)
    analyticsService.trackTournamentFavorited(templateId);

    return data;
  },

  async removeFavoriteTournament(
    userId: number,
    tournamentId: number,
  ): Promise<void> {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("tournament_id", tournamentId);
    if (error) throw error;

    // Track analytics (fire-and-forget)
    analyticsService.trackTournamentUnfavorited(tournamentId);
  },

  async removeFavoriteSeries(
    userId: number,
    templateId: number,
  ): Promise<void> {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("template_id", templateId);
    if (error) throw error;

    // Track analytics (fire-and-forget)
    analyticsService.trackTournamentUnfavorited(templateId);
  },

  async isFavorited(
    userId: number,
    tournamentId?: number,
    templateId?: number,
  ): Promise<boolean> {
    let query = supabase.from("favorites").select("id").eq("user_id", userId);

    if (tournamentId) {
      query = query.eq("tournament_id", tournamentId);
    }
    if (templateId) {
      query = query.eq("template_id", templateId);
    }

    const { data, error } = await query.single();
    if (error && error.code === "PGRST116") return false;
    if (error) throw error;
    return !!data;
  },

  async getFavoriteCount(
    tournamentId?: number,
    templateId?: number,
  ): Promise<number> {
    let query = supabase
      .from("favorites")
      .select("id", { count: "exact", head: true });

    if (tournamentId) {
      query = query.eq("tournament_id", tournamentId);
    }
    if (templateId) {
      query = query.eq("template_id", templateId);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },
};
