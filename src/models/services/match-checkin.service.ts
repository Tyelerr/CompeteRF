// src/models/services/match-checkin.service.ts
// Per-assignment match check-in + "Contact TD" (migration 20260927120000).
//
// Both writes are narrow SECURITY DEFINER RPCs: the server resolves the caller's OWN registration
// and the match's current assignedAt, so a client can never check someone else in, write another
// player's status, or touch live_settings. Reads come straight from match_player_status, whose
// RLS gives a player their own rows and a tournament manager the whole event's.
import { supabase } from "../../lib/supabase";
import { MatchAssignmentStatus, MatchIssueReason, MatchPlayerStatus } from "../types/match-checkin.types";

const ROW_COLUMNS =
  "id, tournament_id, match_id, registration_id, assigned_at, draw_number, checked_in_at, issue_reason, issue_message, issue_at, resolved_at";

export const matchCheckInService = {
  /** Check the signed-in player in for THIS assignment. Idempotent. */
  async checkIn(tournamentId: number, matchId: string): Promise<{ checkedInAt: string | null }> {
    const { data, error } = await supabase.rpc("match_check_in", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
    });
    if (error) throw error;
    return { checkedInAt: (data as { checkedInAt?: string })?.checkedInAt ?? null };
  },

  /**
   * Raise an issue on this assignment. The RPC records it and writes the in-app notification for
   * the people running this event; the Edge Function then pushes to those same people. A failed
   * push never loses the issue — the in-app notification and the ? indicator are already stored.
   */
  async contactTd(
    tournamentId: number,
    matchId: string,
    reason: MatchIssueReason,
    message?: string | null,
  ): Promise<{ recipients: number }> {
    const { data, error } = await supabase.rpc("match_contact_td", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
      p_reason: reason,
      p_message: message?.trim() ? message.trim() : null,
    });
    if (error) throw error;
    try {
      await supabase.functions.invoke("notify-match-issue", {
        body: { tournament_id: tournamentId, match_id: matchId },
      });
    } catch (err) {
      console.warn("[matchCheckIn] issue push failed (in-app notification already sent):", err);
    }
    return { recipients: Number((data as { recipients?: number })?.recipients ?? 0) };
  },

  /**
   * A PLAYER starts their own match. The server re-checks that they are in this match, that it is
   * assigned and not started, that check-in is complete when the TD requires it, and stamps
   * startedAt itself — the same start path the TD uses. Never another player's match.
   */
  async playerStart(tournamentId: number, matchId: string): Promise<void> {
    const { error } = await supabase.rpc("match_player_start", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
    });
    if (error) throw error;
  },

  /** Manager marks a player present (guest / no phone / verbal), or undoes it. */
  async markCheckedIn(
    tournamentId: number,
    matchId: string,
    registrationId: number,
    checkedIn = true,
  ): Promise<void> {
    const { error } = await supabase.rpc("match_mark_checked_in", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
      p_registration_id: registrationId,
      p_checked_in: checkedIn,
    });
    if (error) throw error;
  },

  /** Manager extends the check-in/start deadline for THIS assignment only. */
  async extendDeadline(tournamentId: number, matchId: string, minutes: number): Promise<number> {
    const { data, error } = await supabase.rpc("match_extend_deadline", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
      p_minutes: minutes,
    });
    if (error) throw error;
    return Number((data as { extendedMinutes?: number })?.extendedMinutes ?? 0);
  },

  /** Match-level assignment rows (extension + review stamps) for a tournament. */
  async listAssignmentStatus(tournamentId: number): Promise<MatchAssignmentStatus[]> {
    const { data, error } = await supabase
      .from("match_assignment_status")
      .select("id, tournament_id, match_id, assigned_at, draw_number, extended_minutes, extended_at, review_alert_at")
      .eq("tournament_id", tournamentId);
    if (error) throw error;
    return (data ?? []) as MatchAssignmentStatus[];
  },

  /**
   * Manager action: mark a player's issue resolved (stamps resolved_at). Narrow RPC — it touches
   * only that one status row, never live_settings, and only for a tournament the caller manages.
   */
  async resolveIssue(tournamentId: number, matchId: string, registrationId: number): Promise<void> {
    const { error } = await supabase.rpc("match_issue_resolve", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
      p_registration_id: registrationId,
    });
    if (error) throw error;
  },

  /**
   * Status rows for a tournament. RLS decides the scope: a player sees only their own rows, a
   * manager sees every player's (that is the TD ✓ / ○ / ? view).
   */
  async listForTournament(tournamentId: number): Promise<MatchPlayerStatus[]> {
    const { data, error } = await supabase
      .from("match_player_status")
      .select(ROW_COLUMNS)
      .eq("tournament_id", tournamentId);
    if (error) throw error;
    return (data ?? []) as MatchPlayerStatus[];
  },
};
