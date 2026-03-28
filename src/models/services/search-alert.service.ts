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

  async checkTournamentAgainstAlerts(tournament: Tournament): Promise<void> {
    try {
      console.log(
        "🔍 Checking tournament against alerts:",
        tournament.name,
        tournament.game_type,
      );

      const { data: alerts, error } = await supabase
        .from("search_alerts")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      console.log(`📋 Found ${alerts?.length || 0} active alerts`);
      if (!alerts || alerts.length === 0) return;

      const matchingAlerts = alerts.filter((alert) => {
        const matches = this.doesTournamentMatchAlert(tournament, alert);
        console.log(`🎯 Alert "${alert.name}" matches: ${matches}`);
        return matches;
      });

      console.log(`✅ Found ${matchingAlerts.length} matching alerts`);
      if (matchingAlerts.length === 0) return;

      const matchingAlertIds = matchingAlerts.map((a) => a.id);
      const { data: existingMatches, error: existingError } = await supabase
        .from("alert_matches")
        .select("alert_id")
        .eq("tournament_id", tournament.id)
        .in("alert_id", matchingAlertIds);

      if (existingError) {
        console.error("⚠️ Error checking existing matches:", existingError);
      }

      const existingAlertIds = new Set(
        (existingMatches || []).map((m: any) => m.alert_id),
      );
      const newMatchingAlerts = matchingAlerts.filter(
        (alert) => !existingAlertIds.has(alert.id),
      );

      console.log(
        `🆕 ${newMatchingAlerts.length} new matches (${existingAlertIds.size} already existed)`,
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
        console.log(`📝 Created ${matches.length} alert matches`);

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
        console.log(`📊 Updated match counts for ${newMatchingAlerts.length} alerts`);

        await this.notifyMatchingUsers(newMatchingAlerts, tournament);
      }
    } catch (error) {
      console.error("❌ Error checking tournament against alerts:", error);
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
          ? ` — $${tournament.entry_fee} entry`
          : "";

      const result = await notificationDispatcher.send({
        category: "search_alert_match",
        recipientIdAutos: uniqueUserIds,
        title: "🔔 Tournament Matches Your Alert!",
        body: `${tournament.name}${locationStr}${feeStr}`,
        data: {
          tournament_id: tournament.id,
          deep_link: `/tournament-detail?id=${tournament.id}`,
          type: "search_alert_match",
        },
      });

      console.log(
        `🔔 Search alert notifications: ${result.sentCount} sent, ${result.filteredCount} filtered, ${result.eligibleCount} eligible`,
      );
    } catch (error) {
      console.error("⚠️ Error sending search alert notifications:", error);
    }
  },

  doesTournamentMatchAlert(tournament: Tournament, alert: SearchAlert): boolean {
    const criteria = alert.filter_criteria;

    // ── Game type: normalize the alert slug to a display label before comparing.
    // tournament.game_type is already normalized by normalizeTournament() in
    // tournament.service ("8-ball" → "8 Ball"), so we must normalize the
    // alert criteria to the same format before calling gameTypesMatch.
    if (criteria.gameType && criteria.gameType.trim() !== "") {
      if (!this.gameTypesMatch(criteria.gameType, tournament.game_type)) {
        console.log(
          `🎮 Game type mismatch: alert wants "${criteria.gameType}", tournament is "${tournament.game_type}"`,
        );
        return false;
      }
    }

    if (
      criteria.tournamentFormat &&
      criteria.tournamentFormat.trim() !== "" &&
      tournament.tournament_format !== criteria.tournamentFormat
    ) {
      console.log(
        `🏆 Format mismatch: alert wants "${criteria.tournamentFormat}", tournament is "${tournament.tournament_format}"`,
      );
      return false;
    }

    if (
      criteria.tableSize &&
      criteria.tableSize.trim() !== "" &&
      tournament.table_size !== criteria.tableSize
    ) {
      console.log(
        `📐 Table size mismatch: alert wants "${criteria.tableSize}", tournament is "${tournament.table_size}"`,
      );
      return false;
    }

    if (
      criteria.equipment &&
      criteria.equipment.trim() !== "" &&
      tournament.equipment &&
      !tournament.equipment.toLowerCase().includes(criteria.equipment.toLowerCase())
    ) {
      console.log(
        `🎱 Equipment mismatch: alert wants "${criteria.equipment}", tournament has "${tournament.equipment}"`,
      );
      return false;
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
    if (
      criteria.calcutta !== undefined &&
      tournament.calcutta !== criteria.calcutta
    ) {
      return false;
    }
    if (
      criteria.openTournament !== undefined &&
      tournament.open_tournament !== criteria.openTournament
    ) {
      return false;
    }

    if (criteria.dateFrom && tournament.tournament_date < criteria.dateFrom) {
      return false;
    }
    if (criteria.dateTo && tournament.tournament_date > criteria.dateTo) {
      return false;
    }

    if (criteria.daysOfWeek && criteria.daysOfWeek.length > 0) {
      const tournamentDay = new Date(tournament.tournament_date).getUTCDay();
      const allowedDays = criteria.daysOfWeek.map((day) => parseInt(day));
      if (!allowedDays.includes(tournamentDay)) {
        return false;
      }
    }

    if (tournament.venues) {
      if (
        criteria.state &&
        criteria.state.trim() !== "" &&
        tournament.venues.state !== criteria.state
      ) {
        return false;
      }
      if (
        criteria.city &&
        criteria.city.trim() !== "" &&
        tournament.venues.city !== criteria.city
      ) {
        return false;
      }
    }

    console.log("✅ All criteria match!");
    return true;
  },

  // ── Smart game type matching using normalized display labels ──────────────
  // Both sides are normalized to display labels ("8 Ball", "8 Ball Scotch Doubles")
  // before comparing, so slug vs label mismatches are eliminated.
  // A general alert ("8 Ball") matches its scotch doubles variant
  // ("8 Ball Scotch Doubles"), but not vice versa.
  gameTypesMatch(
    alertGameType: string,
    tournamentGameType: string,
  ): boolean {
    const normalizedAlert = normalizeGameType(alertGameType);
    const normalizedTournament = normalizeGameType(tournamentGameType); // normalize regardless of call source

    // Exact match
    if (normalizedAlert === normalizedTournament) return true;

    // One-way: general alert matches scotch doubles variant of the same game
    // e.g. "8 Ball" alert matches "8 Ball Scotch Doubles" tournament
    // but "8 Ball Scotch Doubles" alert does NOT match "8 Ball" tournament
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
    return parts.join(" • ") || "All tournaments";
  },
};



