// src/models/types/elim-recovery.types.ts
// Elimination Recovery & History (Actions → Recovery & History). Rows mirror tournament_audit /
// elim_checkpoints (manager-only, RLS); previews mirror elim_undo / elim_restore dry runs
// (supabase/migrations/20261019120000_elim_undo_restore.sql).

import { GeneratedBracket, MatchLiveState } from "./tournament-settings.types";

export interface ElimAuditRow {
  id: number;
  revision: number;
  op: string;
  match_id: string | null;
  table_id: number | null;
  actor_id: string | null;
  before: Partial<MatchLiveState> | null;
  after: Record<string, unknown> | null;
  detail: {
    p1Name?: string;
    p2Name?: string;
    cascade?: { reset?: string[]; cleared?: string[]; stopped?: string[]; released?: number[] };
    undoes?: number;
    undoneOp?: string;
    restoredCheckpoint?: number;
    restoredLabel?: string | null;
    reopened?: boolean;
    checkpoint?: number;
    [k: string]: unknown;
  } | null;
  created_at: string;
}

// Restore point list item — never the snapshot itself (that stays server-side).
export interface ElimCheckpointRow {
  id: number;
  revision: number;
  reason: string;
  label: string | null;
  match_id: string | null;
  milestone: boolean;
  actor_id: string | null;
  created_at: string;
}

export interface ElimImpact {
  cleared: string[];
  restored: string[];
  changed: string[];
  toWaiting: string[];
  stopped: string[];
  tablesChanged: string[];
  restoredResults?: string[];
  matchesChanged?: number;
  reopensTournament?: boolean;
  replacesBracket?: boolean;
  missingTables?: number;
}

export interface ElimUndoTarget {
  auditId: number;
  op: string;
  matchId: string | null;
  at: string;
  p1Name?: string | null;
  p2Name?: string | null;
  before?: Partial<MatchLiveState> | null;
  after?: Record<string, unknown> | null;
}

export interface ElimUndoPreview {
  dry_run: true;
  available: boolean;
  reason?: string;
  revision: number;
  undoing?: ElimUndoTarget | null;
  impact?: ElimImpact;
  matchState?: Record<string, MatchLiveState>;
}

export interface ElimRestorePreview {
  dry_run: true;
  revision: number;
  impact: ElimImpact;
  matchState: Record<string, MatchLiveState>;
  bracket?: GeneratedBracket | null;
  checkpoint: { id: number; label: string | null; reason: string; revision: number; created_at: string };
}

export interface ElimRecoveryResult {
  ok: true;
  revision: number;
  checkpoint: number;
}
