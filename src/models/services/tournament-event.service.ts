// src/models/services/tournament-event.service.ts
// Durable activity/audit log for elimination tournaments (tournament_events table). Mirrors the
// chip_events pattern: client-generated text id, structured payload (render the feed from
// type + payload, not from a frozen English string), public read, manager-only write (RLS).
// The ONLY place that talks to tournament_events — screens/hooks call this, never supabase direct.

import { supabase } from "../../lib/supabase";

export type TournamentEventType =
  | "tournament_started"
  | "match_started"
  | "match_completed"
  | "table_assigned"
  | "table_changed"
  | "table_unassigned"
  | "match_reopened"
  | "match_timer_adjusted"
  | "bracket_redrawn";

export interface TournamentEvent {
  id: string;
  tournament_id: number;
  type: string;
  text: string;
  actor_id: number | null;
  payload: Record<string, unknown> | null;
  tx_id: string | null;
  created_at: string;
}

export const tournamentEventService = {
  // Append one activity row. `text` is a convenience fallback; `payload` holds the structured
  // data the feed renders from. Never throws to the caller's critical path — an audit-log
  // failure must not roll back the real mutation that already succeeded.
  async log(
    tournamentId: number,
    type: TournamentEventType,
    payload?: Record<string, unknown> | null,
    text = "",
    actorId?: number | null,
  ): Promise<void> {
    const id = `te_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from("tournament_events").insert({
      id,
      tournament_id: tournamentId,
      type,
      text,
      actor_id: actorId ?? null,
      payload: payload ?? null,
    });
    if (error) throw error;
  },

  async list(tournamentId: number, limit = 50): Promise<TournamentEvent[]> {
    const { data, error } = await supabase
      .from("tournament_events")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as unknown as TournamentEvent[];
  },
};
