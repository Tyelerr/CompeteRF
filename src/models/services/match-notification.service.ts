// src/models/services/match-notification.service.ts
// "You've been assigned to a table" (in-app + push) for elimination matches. The client only
// says WHICH match was assigned; the notify-match-assigned Edge Function derives players,
// opponent, table and races server-side, authorizes the caller with can_manage_tournament,
// and dedupes per assignment instance (safe to call more than once). SMS is NOT sent here —
// the existing SMS alert stays at match start (sms-send-match-ready).
import { supabase } from "../../lib/supabase";

export const matchNotificationService = {
  async notifyMatchAssigned(tournamentId: number, matchId: string): Promise<void> {
    try {
      if (!tournamentId || !matchId) return;
      await supabase.functions.invoke("notify-match-assigned", {
        body: { tournament_id: tournamentId, match_id: matchId },
      });
    } catch (err) {
      console.warn("[matchNotification] notifyMatchAssigned failed:", err);
    }
  },
};
