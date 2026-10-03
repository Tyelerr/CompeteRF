// src/models/services/elim-recovery.service.ts
// Elimination Recovery & History data. Reads go straight to tournament_audit / elim_checkpoints
// (RLS: tournament managers only) and are fetched ONLY while the Recovery & History screen is
// open — never part of the Live polling. Undo / Restore are server-side, transactional,
// revision-checked RPCs (elim_undo / elim_restore); a dry run returns the exact impact.

import { supabase } from "../../lib/supabase";
import {
  ElimAuditRow,
  ElimCheckpointRow,
  ElimRecoveryResult,
  ElimRestorePreview,
  ElimUndoPreview,
} from "../types/elim-recovery.types";

export const ELIM_HISTORY_PAGE = 30;

// The server's error code (+ detail) from a thrown RPC error.
export const recoveryErrorCode = (e: unknown): { code: string; detail: string | null } => {
  const o = (e ?? {}) as { message?: string; details?: string | null };
  return { code: String(o.message ?? ""), detail: o.details ?? null };
};

export const elimRecoveryService = {
  // Newest-first audit page; pass the last loaded id to get the next (older) page.
  async listAudit(tournamentId: number, beforeId?: number | null, limit = ELIM_HISTORY_PAGE): Promise<ElimAuditRow[]> {
    let q = supabase
      .from("tournament_audit")
      .select("id, revision, op, match_id, table_id, actor_id, before, after, detail, created_at")
      .eq("tournament_id", tournamentId)
      .order("id", { ascending: false })
      .limit(limit);
    if (beforeId != null) q = q.lt("id", beforeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ElimAuditRow[];
  },

  // Bounded list (30 rolling + milestones) — metadata only, never the snapshot.
  async listCheckpoints(tournamentId: number): Promise<ElimCheckpointRow[]> {
    const { data, error } = await supabase
      .from("elim_checkpoints")
      .select("id, revision, reason, label, match_id, milestone, actor_id, created_at")
      .eq("tournament_id", tournamentId)
      .order("id", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ElimCheckpointRow[];
  },

  // Display names for audit / checkpoint actors (public profile fields only).
  async actorNames(ids: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (uniq.length === 0) return {};
    const { data, error } = await supabase.from("profiles_public").select("id, user_name, name").in("id", uniq);
    if (error) return {};
    const out: Record<string, string> = {};
    for (const p of (data ?? []) as { id: string; user_name: string | null; name: string | null }[])
      out[p.id] = p.user_name || p.name || "TD";
    return out;
  },

  async previewUndo(tournamentId: number): Promise<ElimUndoPreview> {
    const { data, error } = await supabase.rpc("elim_undo", { p_tournament_id: tournamentId, p_dry_run: true });
    if (error) throw error;
    return data as unknown as ElimUndoPreview;
  },

  async undo(tournamentId: number, expectedRevision: number): Promise<ElimRecoveryResult> {
    const { data, error } = await supabase.rpc("elim_undo", {
      p_tournament_id: tournamentId,
      p_expected_revision: expectedRevision,
    });
    if (error) throw error;
    return data as unknown as ElimRecoveryResult;
  },

  async previewRestore(tournamentId: number, checkpointId: number): Promise<ElimRestorePreview> {
    const { data, error } = await supabase.rpc("elim_restore", {
      p_tournament_id: tournamentId,
      p_checkpoint_id: checkpointId,
      p_dry_run: true,
    });
    if (error) throw error;
    return data as unknown as ElimRestorePreview;
  },

  async restore(tournamentId: number, checkpointId: number, expectedRevision: number): Promise<ElimRecoveryResult> {
    const { data, error } = await supabase.rpc("elim_restore", {
      p_tournament_id: tournamentId,
      p_checkpoint_id: checkpointId,
      p_expected_revision: expectedRevision,
    });
    if (error) throw error;
    return data as unknown as ElimRecoveryResult;
  },
};
