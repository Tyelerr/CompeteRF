// src/models/services/sms-notification.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Domain logic for outbound text alerts. Resolves a player's SMS preferences
// (opt-in + per-alert toggle + phone) and, if they asked for it, composes and
// sends the text via the send-sms edge function.
//
// All sends are best-effort and never throw — a failed/opted-out text must not
// break the TD's live flow (assigning tables, starting matches).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../lib/supabase";
import { sendSms } from "../../services/sms/smsService";

interface MatchReadyParams {
  playerId: number; // tournament_players.player_id == profiles.id_auto
  opponentName?: string | null;
  tableLabel?: string | null; // e.g. "Table 3"
  tournamentName?: string | null;
}

const buildMatchReadyMessage = (p: MatchReadyParams): string => {
  const where = p.tableLabel ? `Head to ${p.tableLabel}` : "You're up next";
  const vs = p.opponentName ? ` to play ${p.opponentName}` : "";
  const event = p.tournamentName ? ` (${p.tournamentName})` : "";
  return `${where}${vs}${event}. — Compete`;
};

export const smsNotificationService = {
  // Text a player that it's their turn — only if they opted into SMS match
  // alerts and have a number on file. Guests (no player account) are skipped.
  async notifyMatchReady(params: MatchReadyParams): Promise<void> {
    try {
      if (!params.playerId) return;

      // notification_preferences is keyed by the auth uid; map id_auto -> id.
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id_auto", params.playerId)
        .maybeSingle();
      if (!profile?.id) return;

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("sms_enabled, sms_match_alerts, sms_phone")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (
        !prefs?.sms_enabled ||
        !prefs.sms_match_alerts ||
        !prefs.sms_phone?.trim()
      ) {
        return;
      }

      await sendSms({
        to: prefs.sms_phone.trim(),
        body: buildMatchReadyMessage(params),
      });
    } catch (err) {
      console.warn("[smsNotification] notifyMatchReady failed:", err);
    }
  },
};
