// src/models/services/sms-notification.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Match-ready SMS trigger. This is now a thin, fire-and-forget invoker of the
// server-authorized `sms-send-match-ready` Edge Function. ALL trust decisions
// happen server-side: caller authorization, exact-match recipient membership,
// opponent/table derivation, verified-phone + consent checks, idempotency, and
// the provider call. The client supplies only identifiers.
//
// Best-effort: never throws, never blocks the TD's live flow.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../lib/supabase";

interface MatchReadyParams {
  tournamentId: number;
  matchId: string;
  recipientIdAuto: number; // profiles.id_auto of the player to notify
}

export const smsNotificationService = {
  async notifyMatchReady(params: MatchReadyParams): Promise<void> {
    try {
      if (!params.tournamentId || !params.matchId || !params.recipientIdAuto) return;
      await supabase.functions.invoke("sms-send-match-ready", {
        body: {
          tournament_id: params.tournamentId,
          match_id: params.matchId,
          recipient_id_auto: params.recipientIdAuto,
        },
      });
    } catch (err) {
      console.warn("[smsNotification] notifyMatchReady failed:", err);
    }
  },
};
