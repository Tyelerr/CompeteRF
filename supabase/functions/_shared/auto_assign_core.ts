// supabase/functions/_shared/auto_assign_core.ts
// Orchestration for server-side Auto Assign (auto-assign-run). Pure except for the injected
// deps, so it runs under Deno in production and under Node in tests.
//
// Planning is the app's own code (scheduler.bundle.js, generated from src/utils/auto-assign.ts):
// mode / Manual order / queue pins / Ready-first tiers / Play Next / lowest free table.
// Writing goes ONLY through elim_auto_assign_apply (assign + ifUnassigned, never start), which
// refuses a plan computed from stale state; we then re-read and re-plan (bounded).
import { autoAssignActive, planAutoAssignFromState } from "./scheduler.bundle.js";

export interface AutoAssignState {
  tournament: {
    live_settings: Record<string, unknown> | null;
    live_state: string | null;
    is_paused: boolean | null;
    tournament_format: string | null;
    game_type: string | null;
    updated_at: string;
  } | null;
  tables: { id: number; table_number: number; status: string }[];
}

export type ApplyResponse =
  | { status: "applied"; results: { i: number; ok: boolean; error?: string }[] }
  | { status: "stale" }
  | { status: "inactive" };

export interface AutoAssignDeps {
  load: (tournamentId: number) => Promise<AutoAssignState>;
  apply: (
    tournamentId: number,
    ops: { op: "assign"; matchId: string; tableId: number; ifUnassigned: true }[],
    expectedUpdatedAt: string,
  ) => Promise<ApplyResponse>;
  notify: (tournamentId: number, matchId: string) => Promise<unknown>;
  now: () => number;
}

export interface AutoAssignOutcome {
  status: "inactive" | "nothing_to_do" | "applied" | "stale_gave_up";
  attempts: number;
  assigned: string[];
  skipped: { matchId: string; error?: string }[];
}

export async function runAutoAssign(
  tournamentId: number,
  deps: AutoAssignDeps,
  maxAttempts = 3,
): Promise<AutoAssignOutcome> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { tournament, tables } = await deps.load(tournamentId);
    // deno-lint-ignore no-explicit-any
    if (!tournament || !autoAssignActive(tournament as any)) {
      return { status: "inactive", attempts: attempt, assigned: [], skipped: [] };
    }
    const plan = planAutoAssignFromState({
      // deno-lint-ignore no-explicit-any
      liveSettings: tournament.live_settings as any,
      // deno-lint-ignore no-explicit-any
      tables: tables as any,
      gameType: tournament.game_type ?? "",
      now: deps.now(),
    });
    if (plan.length === 0) return { status: "nothing_to_do", attempts: attempt, assigned: [], skipped: [] };

    const ops = plan.map((p) => ({ op: "assign" as const, matchId: p.matchId, tableId: p.tableId, ifUnassigned: true as const }));
    const res = await deps.apply(tournamentId, ops, tournament.updated_at);
    if (res.status === "stale") continue; // state moved under us: re-read and re-plan
    if (res.status === "inactive") return { status: "inactive", attempts: attempt, assigned: [], skipped: [] };

    const assigned: string[] = [];
    const skipped: { matchId: string; error?: string }[] = [];
    for (const r of res.results) {
      const matchId = plan[r.i]?.matchId;
      if (!matchId) continue;
      if (r.ok) assigned.push(matchId);
      else skipped.push({ matchId, error: r.error });
    }
    // Persisted first, THEN notify (deduped server-side per assignedAt).
    for (const matchId of assigned) {
      try {
        await deps.notify(tournamentId, matchId);
      } catch {
        // notification is best-effort; the assignment stands
      }
    }
    return { status: "applied", attempts: attempt, assigned, skipped };
  }
  return { status: "stale_gave_up", attempts: maxAttempts, assigned: [], skipped: [] };
}
