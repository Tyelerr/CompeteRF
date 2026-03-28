import { supabase } from "../../lib/supabase";
import {
  AlertMatch,
  CreateSearchAlertRequest,
  SearchAlert,
  UpdateSearchAlertRequest,
} from "../types/search-alert.types";
import { Tournament } from "../types/tournament.types";
import { normalizeGameType } from "./tournament.service";
import { notificationDispatcher } from "./notification-dispatcher.service";

export const searchAlertService = {
  async getUserAlerts(userId: number): Promise<SearchAlert[]> {
    const { data, error } = await supabase
      .from("search_alerts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAlert(id: number): Promise<SearchAlert | null> {
    const { data, error } = await supabase
      .from("search_alerts")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async createAlert(
    userId: number,
    alert: CreateSearchAlertRequest,
  ): Promise<SearchAlert> {
    const { data, error } = await supabase
      .from("search_alerts")
      .insert({
        user_id: userId,
        name: alert.name,
        description: alert.description,
        filter_criteria: alert.filter_criteria,
        is_active: alert.is_active ?? true,
        match_count: 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateAlert(
    id: number,
    updates: UpdateSearchAlertRequest,
  ): Promise<SearchAlert> {
    const { data, error } = await supabase
      .from("search_alerts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteAlert(id: number): Promise<void> {
    const { error } = await supabase
      .from("search_alerts")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async toggleAlert(id: number, isActive: boolean): Promise<SearchAlert> {
    return this.updateAlert(id, { is_active: isActive });
  },

  async getAlertMatches(alertId: number): Promise<AlertMatch[]> {
    const { data, error } = await supabase
      .from("alert_matches")
      .select(
        `
        *,
        tournaments (
          id,
          name,
          game_type,
          tournament_date,
          venues (
            venue,
            city,
            state
          )
        )
      `,
      )
      .eq("alert_id", alertId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Fetches the distinct table brands for a given venue.
  async getVenueBrands(venueId: number): Promise<string[]> {
    if (!venueId) return [];
    try {
      const { data, error } = await supabase
        .from("venue_tables")
        .select("brand")
        .eq("venue_id", venueId)
        .not("brand", "is", null);
      if (error) return [];
      return [...new Set(data?.map((d) => d.brand).filter(Boolean) as string[])];
    } catch {
      return [];
    }
  },

  async checkTournamentAgainstAlerts(tournament: Tournament): Promise<void> {
    try {
      console.log(
        "\uD83D\uDD0D Checking tournament against alerts:",
        tournament.name,
        tournament.game_type,
      );

      const { data: alerts, error } = await supabase
        .from("search_alerts")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      console.log(`\uD83D\uDCCB Found ${alerts?.length || 0} active alerts`);
      if (!alerts || alerts.length === 0) return;

      // Pre-fetch venue brands once if any active alert uses brand filtering.
      const anyAlertHasBrand = alerts.some(
        (a) => a.filter_criteria?.brand && a.filter_criteria.brand.trim() !== "",
      );
      const venueId = (tournament as any).venue_id as number | undefined;
      const venueBrands: string[] =
        anyAlertHasBrand && venueId
          ? await this.getVenueBrands(venueId)
          : [];

      const matchingAlerts = alerts.filter((alert) => {
        const matches = this.doesTournamentMatchAlert(tournament, alert, venueBrands);
        console.log(`\uD83C\uDFAF Alert "${alert.name}" matches: ${matches}`);
        return matches;
      });

      console.log(`\u2705 Found ${matchingAlerts.length} matching alerts`);
      if (matchingAlerts.length === 0) return;

      const matchingAlertIds = matchingAlerts.map((a) => a.id);
      const { data: existingMatches, error: existingError } = await supabase
        .from("alert_matches")
        .select("alert_id")
        .eq("tournament_id", tournament.id)
        .in("alert_id", matchingAlertIds);

      if (existingError) {
        console.error("\u26A0\uFE0F Error checking existing matches:", existingError);
      }

      const existingAlertIds = new Set(
        (existingMatches || []).map((m: any) => m.alert_id),
      );
      const newMatchingAlerts = matchingAlerts.filter(
        (alert) => !existingAlertIds.has(alert.id),
      );

      console.log(
        `\uD83D\uDD06 ${newMatchingAlerts.length} new matches (${existingAlertIds.size} already existed)`,
      );

      if (newMatchingAlerts.length > 0) {
        const matches = newMatchingAlerts.map((alert) => ({
          alert_id: alert.id,
          tournament_id: tournament.id,
        }));

        const { error: insertError } = await supabase
          .from("alert_matches")
          .insert(matches);
        if (insertError) throw insertError;

        const updatePromises = newMatchingAlerts.map((alert) =>
          supabase
            .from("search_alerts")
            .update({
              match_count: alert.match_count + 1,
              last_match_date: new Date().toISOString(),
            })
            .eq("id", alert.id),
        );
        await Promise.all(updatePromises);

        await this.notifyMatchingUsers(newMatchingAlerts, tournament);
      }
    } catch (error) {
      console.error("\u274C Error checking tournament against alerts:", error);
    }
  },

  async notifyMatchingUsers(
    matchingAlerts: SearchAlert[],
    tournament: Tournament,
  ): Promise<void> {
    try {
      const uniqueUserIds = [
        ...new Set(matchingAlerts.map((alert) => alert.user_id)),
      ];
      if (uniqueUserIds.length === 0) return;

      const venue = tournament.venues;
      const locationParts: string[] = [];
      if (venue?.city) locationParts.push(venue.city);
      if (venue?.state) locationParts.push(venue.state);
      const locationStr =
        locationParts.length > 0 ? ` in ${locationParts.join(", ")}` : "";
      const feeStr =
        tournament.entry_fee && tournament.entry_fee > 0
          ? ` \u2014 $${tournament.entry_fee} entry`
          : "";

      const result = await notificationDispatcher.send({
        category: "search_alert_match",
        recipientIdAutos: uniqueUserIds,
        title: "\uD83D\uDD14 Tournament Matches Your Alert!",
        body: `${tournament.name}${locationStr}${feeStr}`,
        data: {
          tournament_id: tournament.id,
          deep_link: `/tournament-detail?id=${tournament.id}`,
          type: "search_alert_match",
        },
      });

      console.log(
        `\uD83D\uDD14 Search alert notifications: ${result.sentCount} sent, ${result.filteredCount} filtered, ${result.eligibleCount} eligible`,
      );
    } catch (error) {
      console.error("\u26A0\uFE0F Error sending search alert notifications:", error);
    }
  },

  doesTournamentMatchAlert(
    tournament: Tournament,
    alert: SearchAlert,
    venueBrands: string[] = [],
  ): boolean {
    const criteria = alert.filter_criteria;

    if (criteria.gameType && criteria.gameType.trim() !== "") {
      if (!this.gameTypesMatch(criteria.gameType, tournament.game_type)) return false;
    }

    if (
      criteria.tournamentFormat &&
      criteria.tournamentFormat.trim() !== "" &&
      tournament.tournament_format !== criteria.tournamentFormat
    ) {
      return false;
    }

    if (
      criteria.tableSize &&
      criteria.tableSize.trim() !== "" &&
      tournament.table_size !== criteria.tableSize
    ) {
      return false;
    }

    // Brand filter (single string): venue must have at least one table of this brand.
    if (criteria.brand && criteria.brand.trim() !== "") {
      if (!venueBrands.includes(criteria.brand)) {
        console.log(
          `\uD83C\uDFB1 Brand mismatch: alert wants "${criteria.brand}", venue has [${venueBrands.join(", ")}]`,
        );
        return false;
      }
    }

    // Legacy brands array — backward compat for any old alerts.
    if (Array.isArray(criteria.brands) && criteria.brands.length > 0) {
      const hasMatchingBrand = criteria.brands.some((b: string) => venueBrands.includes(b));
      if (!hasMatchingBrand) return false;
    }

    if (
      criteria.entryFeeMin !== undefined &&
      tournament.entry_fee &&
      tournament.entry_fee < criteria.entryFeeMin
    ) {
      return false;
    }
    if (
      criteria.entryFeeMax !== undefined &&
      tournament.entry_fee &&
      tournament.entry_fee > criteria.entryFeeMax
    ) {
      return false;
    }

    if (
      criteria.fargoMax !== undefined &&
      tournament.max_fargo &&
      tournament.max_fargo > criteria.fargoMax
    ) {
      return false;
    }

    if (
      criteria.reportsToFargo !== undefined &&
      tournament.reports_to_fargo !== criteria.reportsToFargo
    ) {
      return false;
    }
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

    console.log("\u2705 All criteria match!");
    return true;
  },

  gameTypesMatch(alertGameType: string, tournamentGameType: string): boolean {
    const normalizedAlert = normalizeGameType(alertGameType);
    const normalizedTournament = normalizeGameType(tournamentGameType);
    if (normalizedAlert === normalizedTournament) return true;
    if (
      !normalizedAlert.includes("Scotch Doubles") &&
      normalizedTournament.includes("Scotch Doubles")
    ) {
      const baseTournamentType = normalizedTournament.replace(" Scotch Doubles", "").trim();
      return normalizedAlert === baseTournamentType;
    }
    return false;
  },

  generateAlertDescription(criteria: any): string {
    const parts: string[] = [];
    if (criteria.gameType && criteria.gameType.trim() !== "") {
      parts.push(normalizeGameType(criteria.gameType));
    }
    if (criteria.brand && criteria.brand.trim() !== "") {
      parts.push(`${criteria.brand} tables`);
    }
    if (criteria.state && criteria.state.trim() !== "") {
      parts.push(`in ${criteria.state}`);
    }
    if (criteria.entryFeeMin !== undefined || criteria.entryFeeMax !== undefined) {
      if (criteria.entryFeeMin && criteria.entryFeeMax) {
        parts.push(`$${criteria.entryFeeMin}-${criteria.entryFeeMax}`);
      } else if (criteria.entryFeeMin) {
        parts.push(`$${criteria.entryFeeMin}+`);
      } else if (criteria.entryFeeMax) {
        parts.push(`up to $${criteria.entryFeeMax}`);
      }
    }
    return parts.join(" \u2022 ") || "All tournaments";
  },
};
