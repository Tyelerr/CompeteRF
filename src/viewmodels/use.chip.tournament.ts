// src/viewmodels/use.chip.tournament.ts
// Viewmodel for the Chip Tournament manage flow. Loads the tournament + chip blob,
// holds the working ChipState locally, auto-saves changes (debounced), and exposes
// Setup actions. Rules live in chip.engine.ts; persistence in chip.service.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { chipService, ChipResultRow } from "../models/services/chip.service";
import { tournamentService } from "../models/services/tournament.service";
import { registrationService } from "../models/services/registration.service";
import { teamService } from "../models/services/team.service";
import {
  addTable as engineAddTable,
  addTables as engineAddTables,
  adjustChips as engineAdjustChips,
  reorderQueue as engineReorderQueue,
  forfeitEntry as engineForfeitEntry,
  buyBackEntry as engineBuyBack,
  restoreEntry as engineRestoreEntry,
  assignNextTeam as engineAssignNextTeam,
  assignSpecificTeam as engineAssignSpecificTeam,
  moveTable as engineMoveTable,
  cancelReshuffle as engineCancelReshuffle,
  closeTables as engineCloseTables,
  resetTableTimer as engineResetTableTimer,
  clearTable as engineClearTable,
  startPendingMatch as engineStartPendingMatch,
  newId,
  reactivateTable as engineReactivateTable,
  setTableLocked as engineSetTableLocked,
  recordWinner as engineRecordWinner,
  removeTable as engineRemoveTable,
  reshuffle as engineReshuffle,
  setShuffleMode as engineSetShuffleMode,
  beginShuffle as engineBeginShuffle,
  startShuffle as engineStartShuffle,
  settleShuffleDrain,
  reconcileQueue,
  reconcileMatches,
  withRestorePoint,
  restoreToPoint as engineRestoreToPoint,
  undoLastActions as engineUndoLastActions,
  startChipTournament,
  finishTournament as engineFinishTournament,
  reconcileCompleted,
  finalPlacements,
  teamName,
} from "../models/services/chip.engine";
import {
  ChipEntry,
  ChipEvent,
  ChipSettings,
  ChipState,
  ChipTable,
  ChipTier,
} from "../models/types/chip.types";
import { Tournament } from "../models/types/tournament.types";
import { readyGate } from "../utils/registration-lifecycle";

// The "parent" (cause) of a transaction is the FIRST event the action logged —
// its automatic side-effects were pushed after it. Events are stored newest-first
// (unshift), so within one action's slice the cause sits at the END.
const txParent = (newestFirst: ChipEvent[]): ChipEvent =>
  newestFirst[newestFirst.length - 1] ?? newestFirst[0];

// Fargo-cap override snapshot shape + local ChipEntry patch, shared by all three write
// paths. Module-scoped (pure) so the vm's useCallbacks don't need it as a dependency.
type OverrideSnap = { cap: number | null; rating: number | null; reason: string | null; notes: string | null; overriddenBy: string | null };
const overrideFields = (on: boolean, snap: OverrideSnap): Partial<ChipEntry> =>
  on
    ? {
        fargoCapOverride: true,
        fargoCapAtOverride: snap.cap,
        playerFargoAtOverride: snap.rating,
        fargoCapOverrideReason: snap.reason,
        fargoCapOverrideNotes: snap.notes,
        overriddenBy: snap.overriddenBy,
        overriddenAt: new Date().toISOString(),
      }
    : {
        fargoCapOverride: false,
        fargoCapAtOverride: null,
        playerFargoAtOverride: null,
        fargoCapOverrideReason: null,
        fargoCapOverrideNotes: null,
        overriddenBy: null,
        overriddenAt: null,
      };

const EMPTY_OVERRIDE_SNAP: OverrideSnap = { cap: null, rating: null, reason: null, notes: null, overriddenBy: null };

// Auto-clear stale Fargo-cap overrides: if an entry has an override but its CURRENT
// rating is at/under the cap, the override no longer applies and must be wiped so a later
// return to the same rating is treated as a NEW over-cap condition. Returns the healed
// state + the entries whose override was cleared (so non-owned sources — doubles/self-reg
// — can be persisted explicitly; owned singles persist via the normal auto-save).
const reconcileOverrides = (
  c: ChipState,
  maxFargo: number | null,
): { chip: ChipState; cleared: ChipEntry[] } => {
  const isDoubles = c.settings.format === "scotch_doubles";
  const ratingOf = (e: ChipEntry): number | null =>
    isDoubles ? (e.p1Fargo != null && e.p2Fargo != null ? e.p1Fargo + e.p2Fargo : null) : e.p1Fargo ?? null;
  const isOver = (e: ChipEntry): boolean => {
    const r = ratingOf(e);
    return r != null && maxFargo != null && r > maxFargo;
  };
  const cleared: ChipEntry[] = [];
  const entries = c.entries.map((e) => {
    if (e.fargoCapOverride && !isOver(e)) {
      cleared.push(e);
      return { ...e, ...overrideFields(false, EMPTY_OVERRIDE_SNAP) };
    }
    return e;
  });
  return cleared.length ? { chip: { ...c, entries }, cleared } : { chip: c, cleared };
};

const blankEntry = (): ChipEntry => ({
  id: newId("e"),
  p1Name: "",
  p1Fargo: null,
  p1Phone: "",
  p2Name: "",
  p2Fargo: null,
  teamFargo: null,
  startChips: 0,
  chips: 0,
  paid: false,
  checkedIn: false,
  paidSidePots: [],
  status: "queued",
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  eliminations: 0,
  createdAt: new Date().toISOString(),
});

export const useChipTournament = (id: number) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [chip, setChip] = useState<ChipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tournament restore history. Every live action appends a PERSISTED restore
  // point (its pre-action snapshot) onto the chip state — see engine
  // withRestorePoint. The Audit Log restores to any of them and the quick "Undo
  // Last N" shortcuts hit recent ones; both survive reloads (unlike an in-memory
  // stack). `chipRef` gives callbacks a synchronous read of the latest state.
  const chipRef = useRef<ChipState | null>(null);
  useEffect(() => {
    chipRef.current = chip;
  }, [chip]);
  // Synchronous read of the current tournament row (for the completion guard) +
  // an in-flight flag so the Finish action can't run twice.
  const tournamentRef = useRef<Tournament | null>(null);
  useEffect(() => {
    tournamentRef.current = tournament;
  }, [tournament]);
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  // Completed-tournament lock. A finished/completed tournament is read-only: this
  // gates every mutation (in `update` and the async team/registration actions that
  // bypass it) so a completed tournament can't be changed via stale UI or retries.
  const locked = useCallback(
    () => tournamentRef.current?.live_state === "finished" || tournamentRef.current?.status === "completed",
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await chipService.load(id);
      setTournament(b.tournament);
      const finished = b.tournament.live_state === "finished" || b.tournament.status === "completed";
      if (finished) {
        // Completed: normalize to a fully torn-down board and DO NOT run the active
        // guards (reconcileQueue would put the alive winner back in the queue,
        // settleShuffleDrain could revive shuffle state). Persist the cleanup so the
        // saved state is actually cleared, not just hidden.
        const cleaned = reconcileCompleted(b.chip);
        setChip(cleaned);
        if (cleaned !== b.chip) chipService.save(id, cleaned).catch(() => {});
      } else {
        // Self-heal on load: (1) void ghost matches whose teams are gone, (2) settle
        // a stuck shuffle drain, (3) re-attach any alive team that fell out of the
        // queue (e.g. from a stale/failed config save while a migration was pending),
        // (4) auto-clear stale Fargo-cap overrides now at/under the cap (rating or the
        // tournament max changed). Owned singles persist via auto-save; doubles/self-reg
        // are projected (auto-save skips them), so clear those sources explicitly.
        const healed = reconcileQueue(settleShuffleDrain(reconcileMatches(b.chip)));
        const { chip: reconciled, cleared } = reconcileOverrides(healed, b.tournament?.max_fargo ?? null);
        setChip(reconciled);
        for (const e of cleared) {
          if (e.teamId != null) teamService.setTeamFargoOverride(e.teamId, false, { cap: null, rating: null, reason: null, notes: null }).catch(() => {});
          else if (e.regId != null && e.fromRegistration)
            registrationService.setFargoOverride(e.regId, false, { cap: null, rating: null, reason: null, notes: null, overriddenBy: null }).catch(() => {});
        }
      }
      loadedRef.current = true;
    } catch (e: any) {
      setError(e?.message ?? "Failed to load tournament.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadedRef.current = false;
    load();
  }, [load]);

  // Debounced auto-save whenever the chip blob changes (after the initial load).
  useEffect(() => {
    if (!loadedRef.current || !chip) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      chipService.save(id, chip).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [chip, id]);

  // Registration-backed entries are PROJECTED from tournament_players / the team
  // roster on every load and are never written to chip_entries — so once a
  // tournament is live, any live change to one (elimination, chips, W/L) would be
  // thrown away and the entry would reappear untouched after a reload. Entries
  // approved mid-tournament never went through start()'s materialization, so we
  // take ownership here the moment an entry actually joins the live field.
  // Pending/unapproved registrations stay projected so they keep their lifecycle.
  const materializeLive = (c: ChipState): ChipState => {
    if (!c.startedAt) return c;
    const inPlay = new Set<string>();
    for (const id of c.queue) inPlay.add(id);
    for (const t of c.tables) {
      if (t.holderId) inPlay.add(t.holderId);
      if (t.pendingChallengerId) inPlay.add(t.pendingChallengerId);
    }
    for (const m of c.matches) {
      inPlay.add(m.aId);
      inPlay.add(m.bId);
    }
    for (const e of c.entries) if (e.status === "eliminated") inPlay.add(e.id);
    let changed = false;
    const entries = c.entries.map((e) => {
      if (!e.fromRegistration || !inPlay.has(e.id)) return e;
      changed = true;
      return { ...e, fromRegistration: false, regId: null, regStatus: null, fargoStatus: null };
    });
    return changed ? { ...c, entries } : c;
  };

  const update = useCallback((fn: (c: ChipState) => ChipState) => {
    // Global completed-tournament lock: a finished/completed tournament is
    // read-only. Every live mutation (record winner, chips, tables, queue,
    // shuffle, forfeit, restore, …) flows through here, so this one guard blocks
    // them all — no completed tournament can be changed via stale UI or a retry.
    const t = tournamentRef.current;
    if (t?.live_state === "finished" || t?.status === "completed") return;
    setChip((c) => {
      if (!c) return c;
      let next = settleShuffleDrain(materializeLive(fn(c)));
      if (next === c) return c; // no-op — nothing to record
      const added = Math.max(0, next.events.length - c.events.length);
      let newEvents = added > 0 ? next.events.slice(0, added) : [];
      // A single action that logged MULTIPLE events (e.g. a completed match →
      // match_result + chip_loss + elimination) is one transaction: stamp them all
      // with a shared txId so the Audit Log folds them into one parent row.
      if (newEvents.length > 1) {
        const txId = newId("tx");
        const evs = next.events.slice();
        for (let k = 0; k < added; k++) evs[k] = { ...evs[k], txId };
        next = { ...next, events: evs };
        newEvents = evs.slice(0, added);
      }
      // Append a PERSISTED restore point (pre-action snapshot). Label it from the
      // PARENT event (the cause) so confirm prompts read "…beat…", not "…lost a chip".
      if (newEvents.length) {
        const parent = txParent(newEvents);
        return withRestorePoint(next, c, newEvents.map((e) => e.id), parent.text);
      }
      return next;
    });
  }, []);

  // Restore points on the current state (oldest first). Every one is a point the
  // Audit Log can roll back to.
  const restorePoints = chip?.restorePoints ?? [];
  const canUndo = restorePoints.length > 0;
  const undoCount = restorePoints.length;
  // Event ids that are valid restore targets (any event an active action logged).
  const restorableEventIds = new Set<string>();
  for (const rp of restorePoints) for (const eid of rp.eventIds) restorableEventIds.add(eid);
  // What reverting to a given event entails: the reverted action count + at time.
  const restoreInfo = useCallback((eventId: string): { count: number; at: string } | null => {
    const rps = chipRef.current?.restorePoints ?? [];
    const idx = rps.findIndex((r) => r.primaryEventId === eventId || r.eventIds.includes(eventId));
    if (idx < 0) return null;
    return { count: rps.length - idx, at: rps[idx].at };
  }, []);

  // Roll the whole tournament back to just before the chosen event (reverting it
  // and everything after it). Preserves history; logs a Tournament Restored event.
  const restoreToEvent = useCallback(
    (eventId: string, meta: { reason: string; actorId?: number | null; actorName?: string | null }) => {
      const c = chipRef.current;
      if (!c) return false;
      const restored = engineRestoreToPoint(c, eventId, meta);
      if (restored === c) return false;
      setChip(restored);
      return true;
    },
    [],
  );
  // Quick shortcut: revert the last `n` logged actions (no reason required).
  const undoLast = useCallback(
    (n: number, meta: { reason: string; actorId?: number | null; actorName?: string | null }) => {
      const c = chipRef.current;
      if (!c || !(c.restorePoints ?? []).length) return false;
      const restored = engineUndoLastActions(c, n, meta);
      if (restored === c) return false;
      setChip(restored);
      return true;
    },
    [],
  );

  // ── Settings ────────────────────────────────────────────────────────────────
  const updateSettings = useCallback(
    (patch: Partial<ChipSettings>) =>
      update((c) => ({ ...c, settings: { ...c.settings, ...patch } })),
    [update],
  );

  const setName = useCallback(
    (name: string) => {
      setTournament((t) => (t ? { ...t, name } : t));
      chipService.setName(id, name).catch(() => {});
    },
    [id],
  );

  // ── Fargo chip table (tiers) ──────────────────────────────────────────────────
  const addTier = useCallback(
    () =>
      update((c) => ({
        ...c,
        settings: {
          ...c.settings,
          tiers: [
            ...c.settings.tiers,
            { id: newId("tier"), minFargo: 0, maxFargo: null, chips: 1 } as ChipTier,
          ],
        },
      })),
    [update],
  );
  const updateTier = useCallback(
    (tierId: string, patch: Partial<ChipTier>) =>
      update((c) => ({
        ...c,
        settings: {
          ...c.settings,
          tiers: c.settings.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
        },
      })),
    [update],
  );
  const removeTier = useCallback(
    (tierId: string) =>
      update((c) => ({
        ...c,
        settings: { ...c.settings, tiers: c.settings.tiers.filter((t) => t.id !== tierId) },
      })),
    [update],
  );

  // ── Registration (entries) ────────────────────────────────────────────────────
  // Final duplicate safeguard (the modal already disables already-entered players):
  // if the patch carries an identity — players.id (uuid, primary) or id_auto
  // (fallback) — that a current entry already holds on either side, skip the add so
  // stale modal state can't create a duplicate. Identity-less walk-ins always add.
  const addEntry = useCallback(
    (patch?: Partial<ChipEntry>) =>
      update((c) => {
        const uuid = patch?.p1PlayerId ?? null;
        const idAuto = patch?.p1ProfileId ?? null;
        if (uuid || idAuto != null) {
          const dup = c.entries.some(
            (e) =>
              (uuid && (e.p1PlayerId === uuid || e.p2PlayerId === uuid)) ||
              (idAuto != null && (e.p1ProfileId === idAuto || e.p2ProfileId === idAuto)),
          );
          if (dup) return c;
        }
        return { ...c, entries: [...c.entries, { ...blankEntry(), ...patch }] };
      }),
    [update],
  );
  const updateEntry = useCallback(
    (entryId: string, patch: Partial<ChipEntry>) =>
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
      })),
    [update],
  );
  const removeEntry = useCallback(
    (entryId: string) =>
      update((c) => ({ ...c, entries: c.entries.filter((e) => e.id !== entryId) })),
    [update],
  );

  // ── Tables (engine-backed: seats players automatically when live) ─────────────
  const addTable = useCallback(() => update((c) => engineAddTable(c)), [update]);
  const addTables = useCallback(
    (count: number, names?: (string | null | undefined)[]) =>
      update((c) => engineAddTables(c, count, names)),
    [update],
  );
  const updateTable = useCallback(
    (tableId: string, patch: Partial<ChipTable>) =>
      update((c) => ({
        ...c,
        tables: c.tables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
      })),
    [update],
  );
  const removeTable = useCallback(
    (tableId: string) => update((c) => engineRemoveTable(c, tableId)),
    [update],
  );

  // ── Live actions ──────────────────────────────────────────────────────────────
  const recordWinner = useCallback(
    (matchId: string, winnerId: string) =>
      update((c) => engineRecordWinner(c, matchId, winnerId)),
    [update],
  );
  const reshuffle = useCallback(() => update((c) => engineReshuffle(c)), [update]);
  // Shuffle Mode: a persistent TD-driven cycle. enableShuffleMode shows the
  // banner; beginShuffle drains the board (freeze + wait for matches); once
  // ready, startShuffle redraws onto the active tables; cancel/disable resume
  // normal play.
  const setShuffleMode = useCallback(
    (on: boolean) => update((c) => engineSetShuffleMode(c, on)),
    [update],
  );
  const beginShuffle = useCallback(
    () => update((c) => engineBeginShuffle(c)),
    [update],
  );
  const startShuffle = useCallback(
    (tableCount?: number | null) =>
      update((c) => engineStartShuffle(c, tableCount ?? null)),
    [update],
  );
  const cancelReshuffle = useCallback(
    () => update((c) => engineCancelReshuffle(c)),
    [update],
  );
  const closeTables = useCallback(
    (tableIds: string[]) => update((c) => engineCloseTables(c, tableIds)),
    [update],
  );
  const reactivateTable = useCallback(
    (tableId: string) => update((c) => engineReactivateTable(c, tableId)),
    [update],
  );
  const resetTableTimer = useCallback(
    (tableId: string) => update((c) => engineResetTableTimer(c, tableId)),
    [update],
  );
  const clearTable = useCallback(
    (tableId: string) => update((c) => engineClearTable(c, tableId)),
    [update],
  );
  const startPendingMatch = useCallback(
    (tableId: string) => update((c) => engineStartPendingMatch(c, tableId)),
    [update],
  );
  const setTableLocked = useCallback(
    (tableId: string, locked: boolean) => update((c) => engineSetTableLocked(c, tableId, locked)),
    [update],
  );
  const assignNextTeam = useCallback(
    (tableId: string) => update((c) => engineAssignNextTeam(c, tableId)),
    [update],
  );
  const moveTable = useCallback(
    (fromId: string, toId: string) => update((c) => engineMoveTable(c, fromId, toId)),
    [update],
  );
  const assignSpecificTeam = useCallback(
    (tableId: string, entryId: string) => update((c) => engineAssignSpecificTeam(c, tableId, entryId)),
    [update],
  );
  const adjustChips = useCallback(
    (entryId: string, delta: number) =>
      update((c) => engineAdjustChips(c, entryId, delta)),
    [update],
  );
  // TD forfeits an entry out of the whole tournament (eliminated regardless of
  // chips; opponent wins by forfeit if mid-match).
  const forfeitEntry = useCallback(
    (entryId: string) => update((c) => engineForfeitEntry(c, entryId)),
    [update],
  );
  const reorderQueue = useCallback(
    (entryId: string, to: "up" | "down" | "top" | "bottom") =>
      update((c) => engineReorderQueue(c, entryId, to)),
    [update],
  );
  const buyBack = useCallback(
    (entryId: string) => update((c) => engineBuyBack(c, entryId)),
    [update],
  );
  // TD restores a chip to an eliminated team (bottom of queue, no auto-seat).
  const restoreEntry = useCallback(
    (entryId: string, reason?: string | null) =>
      update((c) => engineRestoreEntry(c, entryId, reason ?? null)),
    [update],
  );
  // Finish the tournament: mark completed, persist final placements (by exact
  // elimination order), and log the distinct "Tournament Finished" audit event.
  // Idempotent — only valid once a champion has been decided (winnerId), the
  // finish event dedups, saveResults upserts, and setLiveState is a no-op if
  // already finished — so repeated taps never double-complete or duplicate rows.
  const endTournament = useCallback(async () => {
    if (finishingRef.current) return; // already in flight — no double completion
    const c = chipRef.current ?? chip;
    if (!c?.winnerId) return; // guard: no champion yet
    // Idempotent: if already completed, do nothing (the saved finalization stands).
    const t = tournamentRef.current;
    if (t?.live_state === "finished" || t?.status === "completed") return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      const next = engineFinishTournament(c, null);
      await chipService.save(id, next);
      const placements: ChipResultRow[] = finalPlacements(next).map((p) => {
        const e = next.entries.find((x) => x.id === p.entryId);
        return {
          entryId: p.entryId,
          place: p.place,
          teamName: e ? teamName(e) : null,
          p1ProfileId: e?.p1ProfileId ?? null,
          p2ProfileId: e?.p2ProfileId ?? null,
          // Stable identity so a PENDING player's placement survives account claim.
          p1PlayerId: e?.p1PlayerId ?? null,
          p2PlayerId: e?.p2PlayerId ?? null,
        };
      });
      // Best-effort: persisting placements must never block completion (e.g.
      // before the chip_results migration is applied). Placements are always
      // re-derivable from the finished state, so a failed write is recoverable.
      // The unique(tournament_id, entry_id) upsert also rejects duplicate rows.
      try {
        await chipService.saveResults(id, placements);
      } catch (e) {
        console.warn("chip_results save skipped:", e);
      }
      // Route through the canonical finalizer so status="completed" +
      // live_state="finished" + completed_at are set atomically — identical to
      // bracket completion (they can't drift). Idempotent: preserves completed_at.
      await tournamentService.completeTournament(id);
      await load();
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  }, [chip, id, load]);

  // Re-open a finished tournament back to Live (undo completion, e.g. it was
  // ended by mistake). Clears the decided-winner flags so play can continue,
  // deletes the persisted placements, and flips live_state back to in_progress.
  // Tables/queue are preserved — reshuffle to re-seat if it had crowned a winner.
  const reopen = useCallback(async () => {
    if (chip) {
      const next = { ...chip, winnerId: null, finishedAt: null };
      await chipService.save(id, next);
    }
    try {
      await chipService.clearResults(id);
    } catch (e) {
      console.warn("chip_results clear skipped:", e);
    }
    // Canonical reopen: clears status/live_state/completed_at together so it leaves
    // the Completed list cleanly (mirror of tournamentService.completeTournament).
    await tournamentService.reopenTournament(id);
    await load();
  }, [chip, id, load]);

  // ── Approve a self-service registration (TD confirms Fargo) ────────────────────
  // Writes the confirmed Fargo to the player's profile (verified), snapshots it on
  // the registration, and flips it to approved — then reloads so the Players list
  // reflects the new verified state.
  const approveRegistration = useCallback(
    async (registrationId: number, fargo: number) => {
      if (locked()) return;
      // Optimistic: reflect the confirmed Fargo + approved state locally so the
      // card updates in place instead of blanking + reloading the whole page.
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.regId === registrationId
            ? { ...e, p1Fargo: fargo, regStatus: "approved", fargoStatus: "verified" }
            : e,
        ),
      }));
      try {
        await registrationService.approveWithFargo(registrationId, fargo);
      } catch {
        await load(); // revert to server truth on failure
      }
    },
    [update, load, locked],
  );

  // TD confirms a team member's Fargo (verified profile Fargo + event snapshot).
  const confirmTeamMemberFargo = useCallback(
    async (memberId: number, fargo: number) => {
      if (locked()) return;
      // Optimistic: mark that member verified (+ its Fargo) locally so the row
      // flips to "✓ Verified" and chips recompute without a full reload.
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => {
          if (e.p1MemberId === memberId)
            return { ...e, p1Fargo: fargo, p1FargoVerified: true };
          if (e.p2MemberId === memberId)
            return { ...e, p2Fargo: fargo, p2FargoVerified: true };
          return e;
        }),
      }));
      try {
        await teamService.confirmMemberFargo(memberId, fargo);
      } catch {
        await load(); // revert to server truth on failure
      }
    },
    [update, load, locked],
  );

  // TD/admin unlocks a locked team so the captain can change the partner.
  const unlockTeam = useCallback(
    async (teamId: number) => {
      if (locked()) return;
      await teamService.unlockTeam(teamId);
      await load();
    },
    [load, locked],
  );

  // TD approves / un-approves a team (a step after Fargo verification). Optimistic
  // so the card flips approved → "Check In" in place instead of reloading the page.
  const approveTeam = useCallback(
    async (teamId: number, approved: boolean) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.teamId === teamId ? { ...e, teamApproved: approved } : e,
        ),
      }));
      try {
        await teamService.setTeamApproved(teamId, approved);
      } catch {
        await load(); // revert to server truth on failure
      }
    },
    [update, load, locked],
  );

  // TD manual chip override for a team (null = auto from the chart).
  const setTeamChips = useCallback(
    async (teamId: number, chips: number | null) => {
      if (locked()) return;
      await teamService.setTeamChips(teamId, chips);
      await load();
    },
    [load, locked],
  );

  // TD sets which side pots a team has entered (full replacement list). Optimistic
  // local update so tapping a checkbox doesn't blank + reload the whole page —
  // only reload from the server if the write fails.
  const setTeamSidePots = useCallback(
    async (teamId: number, pots: string[]) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.teamId === teamId ? { ...e, paidSidePots: pots } : e,
        ),
      }));
      try {
        await teamService.setTeamSidePots(teamId, pots);
      } catch {
        await load();
      }
    },
    [update, load, locked],
  );

  // TD checks a team in / out. Persisted server-side (optimistic locally) so it
  // survives roster reloads — previously local-only, so adding another team (a
  // reload) reset every team's check-in.
  const setTeamCheckedIn = useCallback(
    async (teamId: number, checkedIn: boolean) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.teamId === teamId ? { ...e, checkedIn } : e,
        ),
      }));
      try {
        await teamService.setTeamCheckedIn(teamId, checkedIn);
      } catch (err) {
        // Revert to server truth, then rethrow so the screen can show a retry alert.
        await load();
        throw err;
      }
    },
    [update, load, locked],
  );

  // Self-registered SINGLES live in tournament_players (projected via regToEntry), so
  // check-in must persist there — a local chip_entries flag would not be saved. Undo
  // reverts to the approved state. Optimistic + rethrow-on-failure like the team path.
  const checkInRegistration = useCallback(
    async (registrationId: number, checkedIn: boolean) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.regId === registrationId ? { ...e, checkedIn } : e)),
      }));
      try {
        if (checkedIn) await registrationService.checkIn(registrationId);
        else await registrationService.approve(registrationId);
        await load();
      } catch (err) {
        await load();
        throw err;
      }
    },
    [update, load, locked],
  );

  // TD removes a self-registered player from the tournament (tournament_players): cancel
  // the registration so it stops projecting into the chip roster (load filters cancelled).
  const cancelRegistration = useCallback(
    async (registrationId: number) => {
      if (locked()) return;
      update((c) => ({ ...c, entries: c.entries.filter((e) => e.regId !== registrationId) }));
      try {
        await registrationService.markCancelled(registrationId);
        await load();
      } catch (err) {
        await load();
        throw err;
      }
    },
    [update, load, locked],
  );

  // Unified lifecycle write for a self-registered SINGLES entry (tournament_players):
  // sets entry-fee paid AND the Ready-derived status in ONE update (mirrors elim's
  // handleReady). ready=true → status checked_in (in the field); ready=false → approved
  // (Registered). Optimistic + rethrow-on-failure so the card can retry.
  const setRegistrationReady = useCallback(
    async (registrationId: number, opts: { paid: boolean; ready: boolean }) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.regId === registrationId
            ? { ...e, paid: opts.paid, checkedIn: opts.ready, regStatus: opts.ready ? "checked_in" : "approved" }
            : e,
        ),
      }));
      try {
        await registrationService.updateRegistration(registrationId, {
          paid_entry: opts.paid,
          status: opts.ready ? "checked_in" : "approved",
          checked_in_at: opts.ready ? new Date().toISOString() : null,
        });
        await load();
      } catch (err) {
        await load();
        throw err;
      }
    },
    [update, load, locked],
  );

  // TD marks a team paid / unpaid (persisted, survives roster reloads).
  const setTeamPaid = useCallback(
    async (teamId: number, paid: boolean) => {
      if (locked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.teamId === teamId ? { ...e, paid } : e)),
      }));
      try {
        await teamService.setTeamPaid(teamId, paid);
      } catch {
        await load();
      }
    },
    [update, load, locked],
  );

  // ── Fargo-cap override writes (per source) ────────────────────────────────────
  // Doubles team override (tournament_teams via RPC; overridden_by stamped server-side).
  const setTeamFargoOverride = useCallback(
    async (teamId: number, on: boolean, snap: OverrideSnap) => {
      if (locked()) return;
      update((c) => ({ ...c, entries: c.entries.map((e) => (e.teamId === teamId ? { ...e, ...overrideFields(on, snap) } : e)) }));
      try {
        await teamService.setTeamFargoOverride(teamId, on, { cap: snap.cap, rating: snap.rating, reason: snap.reason, notes: snap.notes });
      } catch {
        await load();
      }
    },
    [update, load, locked],
  );

  // Self-registered singles override (tournament_players direct update).
  const setRegistrationFargoOverride = useCallback(
    async (registrationId: number, on: boolean, snap: OverrideSnap) => {
      if (locked()) return;
      update((c) => ({ ...c, entries: c.entries.map((e) => (e.regId === registrationId ? { ...e, ...overrideFields(on, snap) } : e)) }));
      try {
        await registrationService.setFargoOverride(registrationId, on, { cap: snap.cap, rating: snap.rating, reason: snap.reason, notes: snap.notes, overriddenBy: snap.overriddenBy });
        await load();
      } catch (err) {
        await load();
        throw err;
      }
    },
    [update, load, locked],
  );

  // Append an audit-log event (e.g. Fargo-cap override) to chip_events.
  const logEvent = useCallback(
    (type: string, text: string, payload?: Record<string, unknown> | null) => chipService.logEvent(id, type, text, payload),
    [id],
  );

  // TD removes one player from a team.
  const removeTeamMember = useCallback(
    async (memberId: number) => {
      if (locked()) return;
      await teamService.removeTeamMember(memberId);
      await load();
    },
    [load, locked],
  );

  // TD creates a real team (chosen player = captain). Returns team id.
  const tdCreateTeam = useCallback(
    async (captainPlayerId: number, fargo: number | null) => {
      if (locked()) return null;
      const teamId = await teamService.tdCreateTeam(id, captainPlayerId, fargo);
      await load();
      return teamId;
    },
    [id, load, locked],
  );

  // TD adds a real (verifiable) partner to a team.
  const addTeamMember = useCallback(
    async (teamId: number, playerId: number, fargo: number | null) => {
      if (locked()) return;
      await teamService.addTeamMember(teamId, playerId, fargo);
      await load();
    },
    [load, locked],
  );

  // Lazy read of a team's shareable invite token (for the "Invite Partner"
  // share/copy/text actions). Read-only; the roster RPC omits the token.
  const getInviteToken = useCallback(
    (teamId: number) => teamService.getTeamInviteToken(teamId),
    [],
  );

  // ── Review & Start ────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!chip) return;
    setStarting(true);
    try {
      // SINGLE explicit normalization point (setup → live only): reconcile checkedIn to
      // the derived Ready set (Entry Fee satisfied + no hard blocker) BEFORE the engine
      // consumes it. This clears any stale legacy checkedIn=true on unpaid/blocked setup
      // rows so nobody unexpectedly enters the field, and never runs while live/completed
      // (start() is the setup→live transition). Also materializes registration-backed
      // entries into owned chip entries so they persist.
      const feeRequired = (Number(tournament?.entry_fee) || 0) > 0;
      const isDoubles = chip.settings.format === "scotch_doubles";
      // Final live field = EXPLICITLY Ready (checkedIn) AND still eligible (payment +
      // no hard blocker + a partner for doubles). This respects the TD's manual-Unready
      // decision — a paid, eligible player who was not marked Ready is NOT auto-included —
      // while still clearing anyone explicitly Ready who has since become ineligible
      // (e.g. a legacy checkedIn=true + unpaid row).
      const readyForField = (e: ChipEntry): boolean => {
        if (!e.checkedIn) return false;
        const hasPartner = isDoubles
          ? e.p2MemberId != null || (!!e.p2Name && e.p2Name !== "") || e.p2ProfileId != null
          : true;
        if (isDoubles && !hasPartner) return false;
        const hardBlocker = isDoubles
          ? e.p1Fargo == null || e.p2Fargo == null
          : e.p1Fargo == null;
        return readyGate({ paid: !!e.paid, entryFeeRequired: feeRequired, hardBlocker });
      };
      const owned: ChipState = {
        ...chip,
        entries: chip.entries.map((e) => ({
          ...e,
          ...(e.fromRegistration
            ? { fromRegistration: false, regId: null, regStatus: null, fargoStatus: null }
            : {}),
          checkedIn: readyForField(e),
        })),
      };
      const started = startChipTournament(owned);
      setChip(started);
      await chipService.start(id, started);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to start tournament.");
    } finally {
      setStarting(false);
    }
  }, [chip, id, load, tournament]);

  const liveState = tournament?.live_state ?? "not_started";
  const isLive = liveState === "in_progress";
  const isFinished = liveState === "finished" || tournament?.status === "completed";
  const phase: "setup" | "live" | "results" = isFinished
    ? "results"
    : isLive
      ? "live"
      : "setup";

  return {
    loading,
    error,
    starting,
    finishing,
    isFinished,
    tournament,
    chip,
    phase,
    reload: load,
    restorePoints,
    canUndo,
    undoCount,
    restorableEventIds,
    restoreInfo,
    restoreToEvent,
    undoLast,
    setName,
    updateSettings,
    addTier,
    updateTier,
    removeTier,
    addEntry,
    updateEntry,
    removeEntry,
    addTable,
    addTables,
    updateTable,
    removeTable,
    start,
    recordWinner,
    reshuffle,
    setShuffleMode,
    beginShuffle,
    startShuffle,
    cancelReshuffle,
    closeTables,
    reactivateTable,
    resetTableTimer,
    clearTable,
    startPendingMatch,
    setTableLocked,
    assignNextTeam,
    assignSpecificTeam,
    moveTable,
    adjustChips,
    forfeitEntry,
    reorderQueue,
    buyBack,
    restoreEntry,
    endTournament,
    reopen,
    approveRegistration,
    setRegistrationReady,
    cancelRegistration,
    setTeamFargoOverride,
    setRegistrationFargoOverride,
    logEvent,
    confirmTeamMemberFargo,
    unlockTeam,
    approveTeam,
    setTeamChips,
    setTeamSidePots,
    setTeamCheckedIn,
    checkInRegistration,
    setTeamPaid,
    removeTeamMember,
    tdCreateTeam,
    addTeamMember,
    getInviteToken,
  };
};
