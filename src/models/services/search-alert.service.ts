import { supabase } from "../../lib/supabase";
import {
  AlertMatch,
  CreateSearchAlertRequest,
  SearchAlert,
  UpdateSearchAlertRequest,
} from "../types/search-alert.types";
import { Tournament } from "../types/tournament.types";

export const searchAlertService = {
  // Get all alerts for a user
  async getUserAlerts(userId: number): Promise<SearchAlert[]> {
    const { data, error } = await supabase
      .from("search_alerts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get single alert
  async getAlert(id: number): Promise<SearchAlert | null> {
    const { data, error } = await supabase
      .from("search_alerts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  // Create new alert
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

  // Update alert
  async updateAlert(
    id: number,
    updates: UpdateSearchAlertRequest,
  ): Promise<SearchAlert> {
    const { data, error } = await supabase
      .from("search_alerts")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete alert
  async deleteAlert(id: number): Promise<void> {
    const { error } = await supabase
      .from("search_alerts")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  // Toggle alert active status
  async toggleAlert(id: number, isActive: boolean): Promise<SearchAlert> {
    return this.updateAlert(id, { is_active: isActive });
  },

  // Get matches for an alert
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

  // Check if tournament matches any user alerts and create matches
  async checkTournamentAgainstAlerts(tournament: Tournament): Promise<void> {
    try {
      console.log(
        "🔍 Checking tournament against alerts:",
        tournament.name,
        tournament.game_type,
      );

      // Get all active alerts
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

      // FIX: Check for existing matches to prevent duplicates on tournament updates
      const matchingAlertIds = matchingAlerts.map((a) => a.id);
      const { data: existingMatches, error: existingError } = await supabase
        .from("alert_matches")
        .select("alert_id")
        .eq("tournament_id", tournament.id)
        .in("alert_id", matchingAlertIds);

      if (existingError) {
        console.error("⚠️ Error checking existing matches:", existingError);
        // Fall through — better to risk a duplicate than silently skip
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

      // Create matches only for alerts that haven't already matched this tournament
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

        // Update match counts only for genuinely new matches
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
        console.log(
          `📊 Updated match counts for ${newMatchingAlerts.length} alerts`,
        );
      }
    } catch (error) {
      console.error("❌ Error checking tournament against alerts:", error);
    }
  },

  // Helper: Check if tournament matches alert criteria
  doesTournamentMatchAlert(tournament: Tournament, alert: SearchAlert): boolean {
    const criteria = alert.filter_criteria;

    // Check game type with smart matching
    if (criteria.gameType && criteria.gameType.trim() !== "") {
      if (!this.gameTypesMatch(criteria.gameType, tournament.game_type)) {
        console.log(
          `🎮 Game type mismatch: alert wants "${criteria.gameType}", tournament is "${tournament.game_type}"`,
        );
        return false;
      }
    }

    // Check tournament format
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

    // Check table size
    if (
      criteria.tableSize &&
      criteria.tableSize.trim() !== "" &&
      tournament.table_size !== criteria.tableSize
    ) {
      console.log(
        `📏 Table size mismatch: alert wants "${criteria.tableSize}", tournament is "${tournament.table_size}"`,
      );
      return false;
    }

    // Check equipment
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

    // Check entry fee range
    if (
      criteria.entryFeeMin !== undefined &&
      tournament.entry_fee &&
      tournament.entry_fee < criteria.entryFeeMin
    ) {
      console.log(
        `💰 Entry fee too low: alert wants min ${criteria.entryFeeMin}, tournament is ${tournament.entry_fee}`,
      );
      return false;
    }
    if (
      criteria.entryFeeMax !== undefined &&
      tournament.entry_fee &&
      tournament.entry_fee > criteria.entryFeeMax
    ) {
      console.log(
        `💰 Entry fee too high: alert wants max ${criteria.entryFeeMax}, tournament is ${tournament.entry_fee}`,
      );
      return false;
    }

    // Check fargo range
    if (
      criteria.fargoMax !== undefined &&
      tournament.max_fargo &&
      tournament.max_fargo > criteria.fargoMax
    ) {
      console.log(
        `📊 Fargo too high: alert wants max ${criteria.fargoMax}, tournament is ${tournament.max_fargo}`,
      );
      return false;
    }

    // Check boolean flags
    if (
      criteria.reportsToFargo !== undefined &&
      tournament.reports_to_fargo !== criteria.reportsToFargo
    ) {
      console.log(
        `📈 Fargo reporting mismatch: alert wants ${criteria.reportsToFargo}, tournament is ${tournament.reports_to_fargo}`,
      );
      return false;
    }
    if (
      criteria.openTournament !== undefined &&
      tournament.open_tournament !== criteria.openTournament
    ) {
      console.log(
        `🔓 Open tournament mismatch: alert wants ${criteria.openTournament}, tournament is ${tournament.open_tournament}`,
      );
      return false;
    }

    // Check date range
    if (criteria.dateFrom && tournament.tournament_date < criteria.dateFrom) {
      console.log(
        `📅 Date too early: alert wants from ${criteria.dateFrom}, tournament is ${tournament.tournament_date}`,
      );
      return false;
    }
    if (criteria.dateTo && tournament.tournament_date > criteria.dateTo) {
      console.log(
        `📅 Date too late: alert wants to ${criteria.dateTo}, tournament is ${tournament.tournament_date}`,
      );
      return false;
    }

    // Check days of week
    if (criteria.daysOfWeek && criteria.daysOfWeek.length > 0) {
      const tournamentDay = new Date(tournament.tournament_date).getDay();
      const allowedDays = criteria.daysOfWeek.map((day) => parseInt(day));
      if (!allowedDays.includes(tournamentDay)) {
        console.log(
          `📅 Day of week mismatch: alert wants ${criteria.daysOfWeek}, tournament is day ${tournamentDay}`,
        );
        return false;
      }
    }

    // Check location (state/city) if tournament has venue info
    if (tournament.venues) {
      if (
        criteria.state &&
        criteria.state.trim() !== "" &&
        tournament.venues.state !== criteria.state
      ) {
        console.log(
          `🗺️ State mismatch: alert wants "${criteria.state}", tournament is in "${tournament.venues.state}"`,
        );
        return false;
      }
      if (
        criteria.city &&
        criteria.city.trim() !== "" &&
        tournament.venues.city !== criteria.city
      ) {
        console.log(
          `🏙️ City mismatch: alert wants "${criteria.city}", tournament is in "${tournament.venues.city}"`,
        );
        return false;
      }
    }

    console.log("✅ All criteria match!");
    return true; // All criteria match
  },

  // Helper: Smart game type matching
  gameTypesMatch(
    alertGameType: string,
    tournamentGameType: string,
  ): boolean {
    // Exact match first
    if (alertGameType === tournamentGameType) {
      return true;
    }

    // One-way matching: general alert types match their specific variations
    // "9-ball" alert should match "9-ball-scotch-doubles" tournament
    // But "9-ball-scotch-doubles" alert should NOT match "9-ball" tournament
    if (
      !alertGameType.includes("-scotch-doubles") &&
      tournamentGameType.includes("-scotch-doubles")
    ) {
      const baseTournamentType = tournamentGameType.replace(
        "-scotch-doubles",
        "",
      );
      return alertGameType === baseTournamentType;
    }

    // No other smart matching - specific alerts only match exactly
    return false;
  },

  // Generate alert description from criteria
  generateAlertDescription(criteria: any): string {
    const parts: string[] = [];

    if (criteria.gameType && criteria.gameType.trim() !== "") {
      parts.push(criteria.gameType);
    }
    if (criteria.state && criteria.state.trim() !== "") {
      parts.push(`in ${criteria.state}`);
    }
    if (
      criteria.entryFeeMin !== undefined ||
      criteria.entryFeeMax !== undefined
    ) {
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
