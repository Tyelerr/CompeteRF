import { supabase } from "../../lib/supabase";
import { normalizeGameType } from "../../utils/game-type.utils";
import {
  AlertMatch,
  CreateSearchAlertRequest,
  SearchAlert,
  UpdateSearchAlertRequest,
} from "../types/search-alert.types";
import { Tournament } from "../types/tournament.types";
import { notificationDispatcher } from "./notification-dispatcher.service";

// Returns today's date as a YYYY-MM-DD string, matching the visibility
// floor tournamentService uses for the public tournament list.
function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const searchAlertService = {
  async getUserAlerts(userId: number): Promise<SearchAlert[]> {
    const { data, error } = await supabase
      .from("search_alerts").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAlert(id: number): Promise<SearchAlert | null> {
    const { data, error } = await supabase
      .from("search_alerts").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  async createAlert(userId: number, alert: CreateSearchAlertRequest): Promise<SearchAlert> {
    const { data, error } = await supabase
      .from("search_alerts")
      .insert({ user_id: userId, name: alert.name, description: alert.description, filter_criteria: alert.filter_criteria, is_active: alert.is_active ?? true, match_count: 0 })
      .select().single();
    if (error) throw error;

    // Populate the matches list with tournaments that already qualify, so the
    // user sees current matches immediately. Best-effort: must never fail creation.
    try {
      const backfilledCount = await this.backfillMatchesForAlert(data);
      if (backfilledCount > 0) data.match_count = backfilledCount;
    } catch (backfillError) {
      console.error("[searchAlert] Error backfilling matches for new alert:", backfillError);
    }

    return data;
  },

  async updateAlert(id: number, updates: UpdateSearchAlertRequest): Promise<SearchAlert> {
    const { data, error } = await supabase
      .from("search_alerts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;

    // If the filter criteria changed, recompute matches so the list reflects
    // the new criteria. Old matches were recorded against the previous
    // criteria and may no longer qualify. Best-effort: never fail the update.
    if (updates.filter_criteria !== undefined) {
      try {
        await this.recomputeMatchesForAlert(data);
        // Re-read so the returned alert reflects the recomputed counts.
        const refreshed = await this.getAlert(id);
        if (refreshed) return refreshed;
      } catch (recomputeError) {
        console.error("[searchAlert] Error recomputing matches after edit:", recomputeError);
      }
    }

    return data;
  },

  async deleteAlert(id: number): Promise<void> {
    const { error } = await supabase.from("search_alerts").delete().eq("id", id);
    if (error) throw error;
  },

  async toggleAlert(id: number, isActive: boolean): Promise<SearchAlert> {
    return this.updateAlert(id, { is_active: isActive });
  },

  async getAlertMatches(alertId: number): Promise<AlertMatch[]> {
    const { data, error } = await supabase
      .from("alert_matches")
      .select(`*, tournaments ( id, name, game_type, tournament_date, venues ( venue, city, state ) )`)
      .eq("alert_id", alertId).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getVenueBrands(venueId: number): Promise<string[]> {
    if (!venueId) return [];
    try {
      const { data, error } = await supabase
        .from("venue_tables").select("brand").eq("venue_id", venueId).not("brand", "is", null);
      if (error) return [];
      return [...new Set(data?.map((d) => d.brand).filter(Boolean) as string[])];
    } catch { return []; }
  },

  async checkTournamentAgainstAlerts(tournament: Tournament): Promise<void> {
    try {
      const { data: alerts, error } = await supabase
        .from("search_alerts").select("*").eq("is_active", true);
      if (error) throw error;
      if (!alerts || alerts.length === 0) return;

      const anyAlertHasBrand = alerts.some((a) => {
        const c = a.filter_criteria;
        return (Array.isArray(c?.brands) && c.brands.length > 0) || (c?.brand && c.brand.trim() !== "");
      });
      const venueId = (tournament as any).venue_id as number | undefined;
      const venueBrands: string[] = anyAlertHasBrand && venueId ? await this.getVenueBrands(venueId) : [];

      const matchingAlerts = alerts.filter((alert) => this.doesTournamentMatchAlert(tournament, alert, venueBrands));
      if (matchingAlerts.length === 0) return;

      const matchingAlertIds = matchingAlerts.map((a) => a.id);
      const { data: existingMatches, error: existingError } = await supabase
        .from("alert_matches").select("alert_id")
        .eq("tournament_id", tournament.id).in("alert_id", matchingAlertIds);
      if (existingError) console.error("[searchAlert] Error checking existing matches:", existingError);

      const existingAlertIds = new Set((existingMatches || []).map((m: any) => m.alert_id));
      const newMatchingAlerts = matchingAlerts.filter((alert) => !existingAlertIds.has(alert.id));
      if (newMatchingAlerts.length === 0) return;

      const matches = newMatchingAlerts.map((alert) => ({ alert_id: alert.id, tournament_id: tournament.id }));
      const { error: insertError } = await supabase.from("alert_matches").insert(matches);
      if (insertError) throw insertError;

      await Promise.all(newMatchingAlerts.map((alert) =>
        supabase.from("search_alerts")
          .update({ match_count: alert.match_count + 1, last_match_date: new Date().toISOString() })
          .eq("id", alert.id),
      ));
      await this.notifyMatchingUsers(newMatchingAlerts, tournament);
    } catch (error) {
      console.error("[searchAlert] Error checking tournament against alerts:", error);
    }
  },

  // Scans existing upcoming tournaments and records the ones that already
  // match this alert, so a freshly created alert shows current matches
  // immediately. Intentionally does NOT send push notifications -- pushes are
  // reserved for genuinely new tournaments via checkTournamentAgainstAlerts.
  // Returns the alert's updated total match_count.
  async backfillMatchesForAlert(alert: SearchAlert): Promise<number> {
    if (!alert || !alert.is_active) return 0;

    // Same visibility rules as the public tournament list: active, not
    // hidden, and dated today or later.
    const { data: tournaments, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("status", "active")
      .eq("is_hidden", false)
      .gte("tournament_date", todayIsoDate());
    if (error) throw error;
    if (!tournaments || tournaments.length === 0) return alert.match_count || 0;

    // Brand criteria require per-venue brand lookups, mirroring
    // checkTournamentAgainstAlerts.
    const criteria = alert.filter_criteria;
    const alertHasBrand =
      (Array.isArray(criteria?.brands) && criteria.brands.length > 0) ||
      (!!criteria?.brand && criteria.brand.trim() !== "");

    const venueBrandsByVenueId = new Map<number, string[]>();
    if (alertHasBrand) {
      const venueIds = [
        ...new Set(
          tournaments
            .map((t: any) => t.venue_id as number | undefined)
            .filter((venueId): venueId is number => typeof venueId === "number"),
        ),
      ];
      await Promise.all(
        venueIds.map(async (venueId) => {
          venueBrandsByVenueId.set(venueId, await this.getVenueBrands(venueId));
        }),
      );
    }

    // Evaluate every upcoming tournament against this single alert.
    const matchingTournamentIds = tournaments
      .filter((tournament: any) => {
        const venueBrands = alertHasBrand
          ? venueBrandsByVenueId.get(tournament.venue_id as number) || []
          : [];
        return this.doesTournamentMatchAlert(tournament as Tournament, alert, venueBrands);
      })
      .map((t: any) => t.id as number);
    if (matchingTournamentIds.length === 0) return alert.match_count || 0;

    // Skip tournaments already recorded for this alert (safe against re-runs).
    const { data: existingMatches, error: existingError } = await supabase
      .from("alert_matches").select("tournament_id")
      .eq("alert_id", alert.id).in("tournament_id", matchingTournamentIds);
    if (existingError) console.error("[searchAlert] Error checking existing matches during backfill:", existingError);

    const existingTournamentIds = new Set((existingMatches || []).map((m: any) => m.tournament_id));
    const newTournamentIds = matchingTournamentIds.filter((tournamentId) => !existingTournamentIds.has(tournamentId));
    if (newTournamentIds.length === 0) return alert.match_count || 0;

    const rows = newTournamentIds.map((tournamentId) => ({ alert_id: alert.id, tournament_id: tournamentId }));
    const { error: insertError } = await supabase.from("alert_matches").insert(rows);
    if (insertError) throw insertError;

    // Reflect the backfilled matches on the alert record.
    const newCount = (alert.match_count || 0) + newTournamentIds.length;
    const { data: updatedAlert, error: updateError } = await supabase
      .from("search_alerts")
      .update({ match_count: newCount, last_match_date: new Date().toISOString() })
      .eq("id", alert.id)
      .select().single();
    if (updateError) throw updateError;

    return updatedAlert?.match_count ?? newCount;
  },

  // Rebuilds a single alert's match list from scratch under its current
  // criteria. Used when a user edits an alert -- old matches may no longer
  // qualify, and new ones may need to be added. Like the backfill, this does
  // NOT send notifications. Returns the resulting match_count.
  async recomputeMatchesForAlert(alert: SearchAlert): Promise<number> {
    if (!alert) return 0;

    // Clear this alert's existing matches so the list reflects only the
    // current criteria.
    const { error: deleteError } = await supabase
      .from("alert_matches").delete().eq("alert_id", alert.id);
    if (deleteError) throw deleteError;

    // Reset counters so the rebuild starts from zero.
    const { error: resetError } = await supabase
      .from("search_alerts")
      .update({ match_count: 0, last_match_date: null })
      .eq("id", alert.id)
      .select().single();
    if (resetError) throw resetError;

    // Re-run the create-time backfill against the now-empty match set.
    return this.backfillMatchesForAlert({ ...alert, match_count: 0, last_match_date: null });
  },

  async notifyMatchingUsers(matchingAlerts: SearchAlert[], tournament: Tournament): Promise<void> {
    try {
      const uniqueUserIds = [...new Set(matchingAlerts.map((alert) => alert.user_id))];
      if (uniqueUserIds.length === 0) return;
      const venue = tournament.venues;
      const locationParts: string[] = [];
      if (venue?.city) locationParts.push(venue.city);
      if (venue?.state) locationParts.push(venue.state);
      const locationStr = locationParts.length > 0 ? ` in ${locationParts.join(", ")}` : "";
      const feeStr = tournament.entry_fee && tournament.entry_fee > 0 ? ` \u2014 $${tournament.entry_fee} entry` : "";
      await notificationDispatcher.send({
        category: "search_alert_match",
        recipientIdAutos: uniqueUserIds,
        title: "\uD83D\uDD14 Tournament Matches Your Alert!",
        body: `${tournament.name}${locationStr}${feeStr}`,
        data: { tournament_id: tournament.id, deep_link: `/tournament-detail?id=${tournament.id}`, type: "search_alert_match" },
      });
    } catch (error) {
      console.error("[searchAlert] Error sending notifications:", error);
    }
  },

  doesTournamentMatchAlert(tournament: Tournament, alert: SearchAlert, venueBrands: string[] = []): boolean {
    const criteria = alert.filter_criteria;

    // --- Game type: array (new) or single string (legacy) ---
    if (Array.isArray(criteria.gameTypes) && criteria.gameTypes.length > 0) {
      if (!criteria.gameTypes.some((gt: string) => this.gameTypesMatch(gt, tournament.game_type))) return false;
    } else if (criteria.gameType && criteria.gameType.trim() !== "") {
      if (!this.gameTypesMatch(criteria.gameType, tournament.game_type)) return false;
    }

    // --- Tournament format: array (new) or single string (legacy) ---
    if (Array.isArray(criteria.tournamentFormats) && criteria.tournamentFormats.length > 0) {
      if (!criteria.tournamentFormats.includes(tournament.tournament_format)) return false;
    } else if (criteria.tournamentFormat && criteria.tournamentFormat.trim() !== "" && tournament.tournament_format !== criteria.tournamentFormat) {
      return false;
    }

    // --- Table size: array (new) or single string (legacy) ---
    if (Array.isArray(criteria.tableSizes) && criteria.tableSizes.length > 0) {
      if (!criteria.tableSizes.includes(tournament.table_size)) return false;
    } else if (criteria.tableSize && criteria.tableSize.trim() !== "" && tournament.table_size !== criteria.tableSize) {
      return false;
    }

    // --- Brands: array (new + legacy) or single string (legacy) ---
    const allBrandFilters: string[] = [
      ...(Array.isArray(criteria.brands) ? criteria.brands : []),
      ...(criteria.brand && criteria.brand.trim() !== "" && !Array.isArray(criteria.brands) ? [criteria.brand] : []),
    ];
    if (allBrandFilters.length > 0) {
      if (!allBrandFilters.some((b: string) => venueBrands.includes(b))) return false;
    }

    // --- Numeric / boolean filters (unchanged) ---
    if (criteria.entryFeeMin !== undefined && tournament.entry_fee && tournament.entry_fee < criteria.entryFeeMin) return false;
    if (criteria.entryFeeMax !== undefined && tournament.entry_fee && tournament.entry_fee > criteria.entryFeeMax) return false;
    if (criteria.fargoMax !== undefined && tournament.max_fargo && tournament.max_fargo > criteria.fargoMax) return false;
    if (criteria.reportsToFargo !== undefined && tournament.reports_to_fargo !== criteria.reportsToFargo) return false;
    if (criteria.calcutta !== undefined && tournament.calcutta !== criteria.calcutta) return false;
    if (criteria.openTournament !== undefined && tournament.open_tournament !== criteria.openTournament) return false;
    if (criteria.dateFrom && tournament.tournament_date < criteria.dateFrom) return false;
    if (criteria.dateTo && tournament.tournament_date > criteria.dateTo) return false;
    if (criteria.daysOfWeek && criteria.daysOfWeek.length > 0) {
      const tournamentDay = new Date(tournament.tournament_date).getUTCDay();
      const allowedDays = criteria.daysOfWeek.map((day: string) => parseInt(day));
      if (!allowedDays.includes(tournamentDay)) return false;
    }
    if (tournament.venues) {
      if (criteria.state && criteria.state.trim() !== "" && tournament.venues.state !== criteria.state) return false;
      if (criteria.city && criteria.city.trim() !== "" && tournament.venues.city !== criteria.city) return false;
    }
    return true;
  },

  gameTypesMatch(alertGameType: string, tournamentGameType: string): boolean {
    const normalizedAlert = normalizeGameType(alertGameType);
    const normalizedTournament = normalizeGameType(tournamentGameType);
    if (normalizedAlert === normalizedTournament) return true;
    if (!normalizedAlert.includes("Scotch Doubles") && normalizedTournament.includes("Scotch Doubles")) {
      return normalizedAlert === normalizedTournament.replace(" Scotch Doubles", "").trim();
    }
    return false;
  },

  generateAlertDescription(criteria: any): string {
    const parts: string[] = [];

    // Game types
    if (Array.isArray(criteria.gameTypes) && criteria.gameTypes.length > 0) {
      parts.push(criteria.gameTypes.map(normalizeGameType).join(", "));
    } else if (criteria.gameType && criteria.gameType.trim() !== "") {
      parts.push(normalizeGameType(criteria.gameType));
    }

    // Tournament formats
    if (Array.isArray(criteria.tournamentFormats) && criteria.tournamentFormats.length > 0) {
      parts.push(criteria.tournamentFormats.map((f: string) => f.replace(/_/g, " ").replace(/-/g, " ")).join(", "));
    } else if (criteria.tournamentFormat && criteria.tournamentFormat.trim() !== "") {
      parts.push(criteria.tournamentFormat.replace(/_/g, " ").replace(/-/g, " "));
    }

    // Table sizes
    if (Array.isArray(criteria.tableSizes) && criteria.tableSizes.length > 0) {
      parts.push(criteria.tableSizes.join("/") + " tables");
    } else if (criteria.tableSize && criteria.tableSize.trim() !== "") {
      parts.push(criteria.tableSize + " table");
    }

    // Brands
    const brandList = Array.isArray(criteria.brands) && criteria.brands.length > 0
      ? criteria.brands
      : (criteria.brand ? [criteria.brand] : []);
    if (brandList.length > 0) parts.push(brandList.join(", ") + " tables");

    if (criteria.state && criteria.state.trim() !== "") parts.push(`in ${criteria.state}`);

    if (criteria.entryFeeMin !== undefined || criteria.entryFeeMax !== undefined) {
      if (criteria.entryFeeMin && criteria.entryFeeMax) parts.push(`$${criteria.entryFeeMin}-${criteria.entryFeeMax}`);
      else if (criteria.entryFeeMin) parts.push(`$${criteria.entryFeeMin}+`);
      else if (criteria.entryFeeMax) parts.push(`up to $${criteria.entryFeeMax}`);
    }

    return parts.join(" \u2022 ") || "All tournaments";
  },
};