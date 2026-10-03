import { supabase } from "../../lib/supabase";
import { normalizeGameType } from "../../utils/game-type.utils";
import {
  Tournament,
  TournamentFilters,
  TournamentTemplate,
} from "../types/tournament.types";
import { TournamentLiveState } from "../types/common.types";
import {
  ElimLiveApplyResponse,
  ElimLivePreview,
  ElimLiveOp,
  TournamentLiveSettings,
} from "../types/tournament-settings.types";
import { searchAlertService } from "./search-alert.service";
import { PUBLIC_PROFILE_COLUMNS } from "../types/profile.types";

// The director embedded on public tournament reads (browse, detail, join, spectator): safe
// public fields only via profiles_public — never the full profile row (M3 privacy).
const DIRECTOR_PUBLIC_COLUMNS = PUBLIC_PROFILE_COLUMNS;

function normalizeTournament<T extends { game_type?: any }>(t: T): T {
  return { ...t, game_type: normalizeGameType(t.game_type) };
}

// ── Public discovery predicate (single source of truth) ───────────────────────
// Shared by BOTH tournament listings — the main Billiards discovery and the venue
// tournament list — so they can never drift. A tournament is discoverable when:
//   status = "active" AND is_hidden = false AND is_draft = false
//   AND (tournament_date >= today  OR  live_state = "in_progress")
// i.e. upcoming OR currently live. Format-agnostic (chip included). Never exposes
// private/hidden/draft rows, and completed tournaments (status != "active") stay
// out even if they were previously live.
type DiscoveryFilterable = {
  eq: (column: string, value: unknown) => DiscoveryFilterable;
  or: (filters: string) => DiscoveryFilterable;
  gte: (column: string, value: unknown) => DiscoveryFilterable;
};
const ymd = (dt: Date): string =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
// Default discovery = upcoming OR live active tournaments, PLUS recently-completed ones so
// results linger briefly in the feed (item 34: 8 days). The "completed" mode (item 35: the
// Status → Completed filter) instead returns only completed tournaments from ~the last 90
// days. Never exposes private/hidden/draft rows. Format-agnostic (chip included).
const applyPublicDiscovery = <Q>(query: Q, mode: "default" | "completed" = "default"): Q => {
  const d = new Date();
  const q = query as DiscoveryFilterable;
  // PostgREST filter builders mutate and return the same instance, so applying the
  // predicate through a loose local view still mutates `query`. The caller keeps its
  // concrete builder type Q (so it can chain .order/.range/.eq afterwards).
  q.eq("is_hidden", false).eq("is_draft", false);
  if (mode === "completed") {
    const since = new Date(d);
    since.setDate(since.getDate() - 90);
    q.eq("status", "completed").gte("completed_at", ymd(since));
  } else {
    const since = new Date(d);
    since.setDate(since.getDate() - 8);
    q.or(
      `and(status.eq.active,or(tournament_date.gte.${ymd(d)},live_state.eq.in_progress)),and(status.eq.completed,completed_at.gte.${ymd(since)})`,
    );
  }
  return query;
};

export { normalizeGameType };

// A revision-checked write found the tournament already changed (another TD / device / Auto
// Assign moved it on). Nothing was written; the caller should reload and let the TD re-check.
export class StaleTournamentError extends Error {
  constructor() {
    super(
      "This tournament was changed on another device. Nothing was saved — refresh, check the latest bracket, then try again.",
    );
    this.name = "StaleTournamentError";
  }
}

export const tournamentService = {
  async getTournaments(
    filters: TournamentFilters,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Tournament[]; count: number }> {
    const completedMode = filters.status === "completed";
    let query = applyPublicDiscovery(
      supabase
        .from("tournaments")
        .select(`*, venues(*), profiles:profiles_public!director_id(${DIRECTOR_PUBLIC_COLUMNS})`, { count: "exact" }),
      completedMode ? "completed" : "default",
    )
      // Completed browse shows most-recently-finished first; default browse shows the
      // soonest upcoming first.
      .order(completedMode ? "completed_at" : "tournament_date", { ascending: !completedMode })
      .range((page - 1) * limit, page * limit - 1);

    if (filters.state) query = query.eq("venues.state", filters.state);
    if (filters.city) query = query.eq("venues.city", filters.city);
    if (filters.gameType) query = query.eq("game_type", filters.gameType);
    if (filters.tournamentFormat) query = query.eq("tournament_format", filters.tournamentFormat);
    if (filters.tableSize) query = query.eq("table_size", filters.tableSize);
    if (filters.entryFeeMin !== undefined) query = query.gte("entry_fee", filters.entryFeeMin);
    if (filters.entryFeeMax !== undefined) query = query.lte("entry_fee", filters.entryFeeMax);
    if (filters.fargoMax !== undefined) query = query.lte("max_fargo", filters.fargoMax);
    if (filters.openTournament !== undefined) query = query.eq("open_tournament", filters.openTournament);
    if (filters.reportsToFargo !== undefined) query = query.eq("reports_to_fargo", filters.reportsToFargo);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: (data || []).map(normalizeTournament), count: count || 0 };
  },

  async getTournament(id: number): Promise<Tournament | null> {
    const { data, error } = await supabase
      .from("tournaments")
      .select(`*, venues(*), profiles:profiles_public!director_id(${DIRECTOR_PUBLIC_COLUMNS})`)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data ? normalizeTournament(data) : null;
  },

  async getTournamentsByVenue(venueId: number): Promise<Tournament[]> {
    // Same public-discovery rule as the main Billiards query (upcoming OR live,
    // active/not-hidden/not-draft) — via the shared applyPublicDiscovery predicate
    // so the two lists stay in lockstep. (This also adds the is_draft exclusion the
    // venue list was previously missing.)
    const { data, error } = await applyPublicDiscovery(
      supabase.from("tournaments").select("*").eq("venue_id", venueId),
    ).order("tournament_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeTournament);
  },

  // Batched upcoming tournaments for a SET of venues — ONE query for the whole venue
  // grid (never one-per-card). Same public-discovery rule as the main list, ordered
  // soonest-first so the caller can take the first per venue_id as "next tournament".
  async getUpcomingByVenueIds(venueIds: number[]): Promise<Tournament[]> {
    if (venueIds.length === 0) return [];
    const { data, error } = await applyPublicDiscovery(
      supabase.from("tournaments").select("*").in("venue_id", venueIds),
    ).order("tournament_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeTournament);
  },

  async getTournamentsByDirector(directorId: number): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("director_id", directorId)
      .eq("status", "active")
      .gte("tournament_date", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })())
      .order("tournament_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeTournament);
  },

  async createTournament(tournament: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .insert(tournament)
      .select("*, venues(*)")
      .single();
    if (error) throw error;
    if (data) {
      try {
        await searchAlertService.checkTournamentAgainstAlerts(data);
      } catch (err) {
        console.error("[tournament] Error checking alerts on create:", err);
      }
    }
    return normalizeTournament(data);
  },

  // Compare-and-set on the server-owned live_revision (bumped by tg_tournaments_live_revision on
  // every live_settings / live_state / status change). Used by whole-row elimination writes that
  // must not land on top of another device's newer state (draw / redraw, Finish): 0 rows → the
  // row moved since this device loaded it → StaleTournamentError, nothing written.
  async updateTournamentIfRevision(
    id: number,
    updates: Partial<Tournament>,
    expectRevision: number,
  ): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("live_revision", expectRevision)
      .select("*, venues(*)")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new StaleTournamentError();
    return normalizeTournament(data);
  },

  async updateTournament(id: number, updates: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, venues(*)")
      .single();
    if (error) throw error;
    const significantFields = ["game_type", "tournament_format", "entry_fee", "max_fargo", "tournament_date", "table_size"];
    const hasSignificantChanges = Object.keys(updates).some((key) => significantFields.includes(key));
    if (hasSignificantChanges && data) {
      try {
        await searchAlertService.checkTournamentAgainstAlerts(data);
      } catch (err) {
        console.error("[tournament] Error re-checking alerts on update:", err);
      }
    }
    return normalizeTournament(data);
  },

  async cancelTournament(id: number, reason: string, cancelledBy: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "cancelled", cancellation_reason: reason, cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  // Archival is organizational only and NEVER changes the tournament's status
  // (it stays "completed" so it keeps counting in analytics). It just flags
  // archived_at so the UI moves it to the Archived list. Early-archives a
  // tournament that hasn't yet hit the 30-day auto-archive window.
  async archiveTournament(id: number, archivedBy: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ archived_at: new Date().toISOString(), archived_by: archivedBy, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  // Restore = clear the archived / cancelled flags and put the tournament back to
  // its real lifecycle: a finished event returns to "completed" (NOT "active"),
  // otherwise "active". Note: once 30 days have elapsed a completed tournament is
  // still shown under Archived (derived) even after archived_at is cleared.
  async restoreTournament(id: number): Promise<Tournament> {
    const { data: cur } = await supabase
      .from("tournaments")
      .select("status, live_state, completed_at")
      .eq("id", id).single();
    const wasCompleted = cur?.status === "completed" || cur?.live_state === "finished" || !!cur?.completed_at;
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: wasCompleted ? "completed" : "active", archived_at: null, archived_by: null, cancelled_at: null, cancelled_by: null, cancellation_reason: null, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return normalizeTournament(data);
  },

  // ── THE canonical tournament finalizer ────────────────────────────────────
  // Every completion path — chip Finish, bracket finish, manual "Complete" from
  // Actions, admin complete — MUST route through this so status / live_state /
  // completed_at can never drift apart. It atomically sets all three:
  //     status = "completed", live_state = "finished", completed_at = <first time>
  // Idempotent: it PRESERVES an existing completed_at (so re-running never resets
  // the 30-day archive clock) and only stamps it the first time. It touches none
  // of the finalization data (bracket, live_settings, matchState, chip_results),
  // so calling it again after finalization is safe and non-destructive.
  // opts.expectRevision (elimination Finish): only complete if live_revision is still the one
  // the TD was looking at — a correction on another device that re-opened the final must not be
  // finished over (→ StaleTournamentError, nothing written).
  async completeTournament(id: number, opts?: { expectRevision?: number | null }): Promise<Tournament> {
    const { data: cur } = await supabase
      .from("tournaments")
      .select("completed_at")
      .eq("id", id).maybeSingle();
    const completedAt = cur?.completed_at ?? new Date().toISOString();
    const patch = { status: "completed", live_state: "finished", completed_at: completedAt } as Partial<Tournament>;
    if (typeof opts?.expectRevision === "number") {
      return tournamentService.updateTournamentIfRevision(id, patch, opts.expectRevision);
    }
    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Complete failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  // Reverse of completeTournament: return a finished tournament to Live (undo an
  // accidental completion). Clears the completion stamp so it leaves the Completed
  // list, and sets live_state back to in_progress. Preserves bracket/live_settings
  // /placements so play can resume. Callers that own finalization rows (e.g. chip
  // reopen clearing chip_results) do that separately.
  async reopenTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "active", live_state: "in_progress", completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Reopen failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async hideTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    if (!data) throw new Error("Hide failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async unhideTournament(id: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ is_hidden: false, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    if (!data) throw new Error("Unhide failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  // ---- Live engine (live_state / pause / round) --------------------------
  // These drive the runtime engine state, separate from `status` (lifecycle).
  // .select().single() + null guard catches silent RLS failures.

  // Participant-scoped live match scoring (see migration
  // 20260607120000_submit_match_state.sql). Merges a small whitelisted patch into
  // tournaments.live_settings.matchState[matchId] for a single match. Unlike a
  // direct tournaments UPDATE, this is callable by an active participant (not just
  // the TD), so a player can score their own match. Returns the new live_settings.
  async submitMatchState(
    tournamentId: number,
    matchId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase.rpc("submit_match_state", {
      p_tournament_id: tournamentId,
      p_match_id: matchId,
      p_patch: patch,
    });
    if (error) throw error;
  },

  // Elimination TD/admin live-state writes (Phase 3). Applies typed ops (assign / start /
  // unassign / patch_match / set_queue) server-side under a row lock — never replaces the
  // whole live_settings. Best-effort by default: each op reports ok/error on its own and a
  // failed op changes nothing; atomic=true makes the whole call all-or-nothing.
  // See supabase/migrations/20260922120000_elim_live_apply.sql.
  //
  // Recovery foundation (20261018120000): `opId` makes the call idempotent and lets the server
  // write the spectator activity (the app no longer does); `expectedRevision` is refused with
  // 'stale_revision' if the tournament changed since this device loaded it.
  async applyElimLiveOps(
    tournamentId: number,
    ops: ElimLiveOp[],
    atomic = false,
    opts: { opId?: string; expectedRevision?: number | null } = {},
  ): Promise<ElimLiveApplyResponse> {
    const { data, error } = await supabase.rpc("elim_live_apply", {
      p_tournament_id: tournamentId,
      p_ops: ops,
      p_atomic: atomic,
      ...(opts.opId ? { p_op_id: opts.opId } : {}),
      ...(opts.expectedRevision != null ? { p_expected_revision: opts.expectedRevision } : {}),
    });
    if (error) throw error;
    return data as unknown as ElimLiveApplyResponse;
  },

  // Impact preview: runs the exact elim_live_apply pipeline (incl. the correction cascade) and
  // returns what WOULD change plus the current revision — nothing is written.
  async previewElimLiveOps(tournamentId: number, ops: ElimLiveOp[]): Promise<ElimLivePreview> {
    const { data, error } = await supabase.rpc("elim_live_apply", {
      p_tournament_id: tournamentId,
      p_ops: ops,
      p_atomic: false,
      p_dry_run: true,
    });
    if (error) throw error;
    return data as unknown as ElimLivePreview;
  },

  // Elimination Settings / Prize Pool save: merges TOP-LEVEL live_settings keys (and removes
  // `remove` keys) server-side so a save can never overwrite the live scheduler keys
  // (matchState / queueOrder / autoAssignMode / bracket / drawLog). Returns the new blob.
  async mergeElimLiveSettings(
    tournamentId: number,
    set: Record<string, unknown>,
    remove: string[] = [],
  ): Promise<TournamentLiveSettings> {
    const { data, error } = await supabase.rpc("elim_merge_live_settings", {
      p_tournament_id: tournamentId,
      p_set: set,
      p_remove: remove,
    });
    if (error) throw error;
    return data as unknown as TournamentLiveSettings;
  },

  // Persist the elimination-format eliminated set (registration ids) computed by the bracket
  // engine. Idempotent + self-correcting server-side; safe to call whenever the live match
  // graph changes. gameplay_started_at is set by a DB trigger on the in_progress transition,
  // so there is no client setter for it.
  async syncEliminations(
    tournamentId: number,
    eliminatedRegIds: number[],
  ): Promise<void> {
    const { error } = await supabase.rpc("sync_tournament_eliminations", {
      p_tournament_id: tournamentId,
      p_eliminated_reg_ids: eliminatedRegIds,
    });
    if (error) throw error;
  },

  async setLiveState(
    id: number,
    liveState: TournamentLiveState,
  ): Promise<Tournament> {
    let query = supabase
      .from("tournaments")
      .update({ live_state: liveState, updated_at: new Date().toISOString() })
      .eq("id", id);
    // A stale device tapping Start must never put a finished event back to in_progress while it
    // stays status=completed (reopen is its own explicit path).
    if (liveState === "in_progress") query = query.neq("status", "completed");
    const { data, error } = await query.select("*, venues(*)").maybeSingle();
    if (error) throw error;
    if (!data) {
      if (liveState === "in_progress") throw new StaleTournamentError();
      throw new Error("Live-state update failed - no rows modified (possible RLS block).");
    }
    return normalizeTournament(data);
  },

  openRegistration(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "registration_open");
  },

  closeRegistration(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "registration_closed");
  },

  startTournament(id: number): Promise<Tournament> {
    return tournamentService.setLiveState(id, "in_progress");
  },

  // Bracket "Finish" routes through the canonical finalizer (NOT a bare live_state
  // flip) so a finished bracket tournament gets status="completed" + completed_at
  // exactly like a chip one — they can't drift.
  finishLiveTournament(id: number, expectRevision?: number | null): Promise<Tournament> {
    return tournamentService.completeTournament(id, { expectRevision });
  },

  // Pause/resume drive a boolean, NOT a live_state value (the engine stays
  // "in_progress"). paused_at records when the hold started.
  async setPaused(id: number, isPaused: boolean): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({
        is_paused: isPaused,
        paused_at: isPaused ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Pause update failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async setCurrentRound(id: number, round: number): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({ current_round: round, updated_at: new Date().toISOString() })
      .eq("id", id).select("*, venues(*)").single();
    if (error) throw error;
    if (!data) throw new Error("Round update failed - no rows modified (possible RLS block).");
    return normalizeTournament(data);
  },

  async getTemplates(directorId: number): Promise<TournamentTemplate[]> {
    const { data, error } = await supabase
      .from("tournament_templates")
      .select("*, venues(*)")
      .eq("director_id", directorId)
      .eq("status", "active");
    if (error) throw error;
    return data || [];
  },

  async getTemplate(id: number): Promise<TournamentTemplate | null> {
    const { data, error } = await supabase
      .from("tournament_templates")
      .select("*, venues(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};