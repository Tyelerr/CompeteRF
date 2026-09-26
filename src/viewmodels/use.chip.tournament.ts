// src/viewmodels/use.chip.tournament.ts
// Viewmodel for the Chip Tournament manage flow. Loads the tournament + chip blob,
// holds the working ChipState locally, auto-saves changes (debounced), and exposes
// Setup actions. Rules live in chip.engine.ts; persistence in chip.service.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { chipService, ChipResultRow, ChipTournamentBundle, CHIP_APPLY_ENABLED } from "../models/services/chip.service";
import { analyticsService } from "../models/services/analytics.service";
import { buildSaveFailureLog } from "../models/services/chip.persist";
import { ChipSaveQueue, createChipSaveQueue, createLoadGuard } from "../models/services/chip.save-queue";
import {
  CHIP_RECOVERY_CHECKPOINT_MS,
  ChipBackupWriter,
  ChipRecoveryReason,
  ChipRecoverySnapshot,
  checkCloudForRecovery,
  chipRecoveryFingerprint,
  createChipBackupWriter,
  createRecoveryLock,
  decideLoadFailure,
  discardPendingForCloud,
  getChipLocalRecovery,
  isDivergentUnconfirmedBackup,
  pickRecoveryTournamentInfo,
} from "../models/services/chip.local-recovery";
import { cloudStatusService } from "../models/services/cloud.status.service";
import { ChipPersistBlockedError, createChipPersistGate } from "../models/services/chip.persist-gate";
import {
  buildOfflineSessionLog,
  canResumeOfflineSession,
  ChipOfflineMode,
  ChipOfflineSession,
  classifyCloudOnReconnect,
  createOfflineSession,
  isOutageError,
  noteLocalSaved,
  noteSentFingerprint,
  reconnectOfflineController,
  shouldEnterOfflineOnSaveFailure,
} from "../models/services/chip.offline-controller";

import { tournamentService } from "../models/services/tournament.service";
import { registrationService } from "../models/services/registration.service";
import { teamService } from "../models/services/team.service";
import {
  addTable as engineAddTable,
  addTables as engineAddTables,
  adjustChips as engineAdjustChips,
  type ChipAdjustMeta,
  reorderQueue as engineReorderQueue,
  forfeitEntry as engineForfeitEntry,
  forfeitMatch as engineForfeitMatch,
  type ForfeitMeta,
  buyBackEntry as engineBuyBack,
  restoreEntry as engineRestoreEntry,
  assignNextTeam as engineAssignNextTeam,
  assignSpecificTeam as engineAssignSpecificTeam,
  moveTable as engineMoveTable,
  cancelReshuffle as engineCancelReshuffle,
  closeTables as engineCloseTables,
  resetTableTimer as engineResetTableTimer,
  clearTable as engineClearTable,
  removeFromTable as engineRemoveFromTable,
  returnActiveMatchesToQueue as engineReturnActiveMatchesToQueue,
  startPendingMatch as engineStartPendingMatch,
  startAllMatches as engineStartAllMatches,
  startAllState,
  newId,
  reactivateTable as engineReactivateTable,
  setTableLocked as engineSetTableLocked,
  setAllTablesLocked as engineSetAllTablesLocked,
  recordWinner as engineRecordWinner,
  removeTable as engineRemoveTable,
  reshuffle as engineReshuffle,
  setShuffleMode as engineSetShuffleMode,
  beginShuffle as engineBeginShuffle,
  startShuffleCycle as engineStartShuffleCycle,
  startShuffle as engineStartShuffle,
  settleShuffleDrain,
  assignFinals,
  reconcileQueue,
  reconcileEliminations,
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
import { scheduleStaleError } from "../utils/schedule";

// Outcome of one whole-state save (strict = the chip_apply RPC path, CHIP_APPLY_ENABLED).
type ChipSaveOutcome = { version: number; conflict: boolean; strict: boolean };

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

// Web-only local backup / recovery (chip.local-recovery.ts). Native never enables it, so every
// recovery branch below is inert on iOS/Android.
const chipRecoveryEnabled = Platform.OS === "web";
const browserOnline = (): boolean | null =>
  typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : null;

// Local recovery status for the screen:
//   none       normal online operation
//   available  the cloud load failed and a local backup exists → offer it (replaces the error)
//   viewing    showing the local backup READ-ONLY; cloud = last cloud check result
//   conflict   cloud reachable again but it differs from the backup → the TD chooses
export type ChipRecoveryView =
  | { status: "none" }
  | { status: "available"; snapshot: ChipRecoverySnapshot; error: string }
  | { status: "viewing"; snapshot: ChipRecoverySnapshot; cloud: "unavailable" | "checking" | "available" }
  | { status: "conflict"; snapshot: ChipRecoverySnapshot; unsavedSession: boolean };

export interface ChipTournamentOptions {
  // Supabase auth user id of the signed-in director: stamped on local backups, and only
  // backups owned by this user are offered. Defaults to the session stored on this browser.
  backupOwnerId?: string | null;
  // The signed-in user's profile/access has resolved (AuthProvider profile loaded). Cloud
  // persistence of a cloud-loaded board waits for it (chip.persist-gate).
  profileReady?: boolean;
  // Web offline entry point (/chip-recovery/[id]): never touch the cloud on mount — open the
  // newest local backup READ-ONLY straight away. It never turns into a live manage screen:
  // once the cloud is usable (consistent check / "Use Cloud Version") onCloudRecovered fires
  // so the route can hand over to the normal, permission-gated Admin screen.
  recoveryOnly?: boolean;
  onCloudRecovered?: () => void;
}

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

// The board load() would show for a cloud bundle (same self-heal pipeline) — used to compare
// the cloud against a local backup without applying it.
const healedCloudChip = (b: ChipTournamentBundle): ChipState => {
  const finished = b.tournament.live_state === "finished" || b.tournament.status === "completed";
  if (finished) return reconcileCompleted(b.chip);
  const healed = assignFinals(reconcileQueue(reconcileEliminations(settleShuffleDrain(reconcileMatches(b.chip)))));
  return reconcileOverrides(healed, b.tournament?.max_fargo ?? null).chip;
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

export const useChipTournament = (
  id: number,
  actorId?: number | null,
  actorName?: string | null,
  options?: ChipTournamentOptions,
) => {
  const recoveryOnly = !!options?.recoveryOnly && chipRecoveryEnabled;
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  // Whose backups this VM may write/offer (never a token — the auth user id only).
  const backupOwner = (): string | null =>
    optionsRef.current?.backupOwnerId ?? cloudStatusService.getStoredAuthUserId();
  // ── PERSISTENCE GATE (chip.persist-gate.ts) — application level, not just RLS ──
  // Nothing persists (auto-save, explicit save, retry, exit flush, local backup, offline
  // controller) unless the on-screen board came from an authoritative source for the CURRENT
  // user: a cloud load that started authenticated, or a verified owner-scoped offline session.
  const persistGateRef = useRef(createChipPersistGate());
  // Bumped whenever authority changes, so the auto-save effect re-evaluates the gate.
  const [gateEpoch, setGateEpoch] = useState(0);
  // Mirror of the gate's source for rendering ("none" = view-only board: nothing is saved).
  const [boardSource, setBoardSource] = useState<"none" | "cloud" | "offline_session">("none");
  // (Stable callbacks: they read refs only.)
  const authUserId = useCallback((): string | null => optionsRef.current?.backupOwnerId ?? null, []);
  const cloudWriteOk = useCallback(
    (): boolean =>
      persistGateRef.current.canWriteCloud({
        authUserId: optionsRef.current?.backupOwnerId ?? null,
        profileReady: !!optionsRef.current?.profileReady,
      }),
    [],
  );
  const localWriteOk = useCallback(
    (): boolean =>
      persistGateRef.current.canWriteLocal({
        authUserId: optionsRef.current?.backupOwnerId ?? null,
        storedUserId: cloudStatusService.getStoredAuthUserId(),
      }),
    [],
  );
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [chip, setChip] = useState<ChipState | null>(null);
  // Fix 2 (item 37) — durable chip_results (bundle.results). Once the tournament is
  // COMPLETED this is the AUTHORITATIVE placement order for the admin standings/recap/
  // payout surfaces; empty for a live tournament or a legacy completed one with no durable
  // rows (→ the screen falls back to the live finalPlacements recompute).
  const [results, setResults] = useState<ChipResultRow[]>([]);
  // The acting director (D/item 21). Threaded onto gameplay events that don't already
  // carry an actor (match results, chip loss, eliminations, table events, auto-seeds) so
  // audit attribution is reliable — reason-gated actions still set their own actor/reason.
  const actorRef = useRef<{ id: number | null; name: string | null }>({
    id: actorId ?? null,
    name: actorName ?? null,
  });
  useEffect(() => {
    actorRef.current = { id: actorId ?? null, name: actorName ?? null };
  }, [actorId, actorName]);
  // `loading` = the INITIAL, never-loaded-yet state that shows the full takeover.
  // `refreshing` = a BACKGROUND revalidation after a mutation: the roster stays on
  // screen (no takeover, no list clearing) while the server state is reconciled.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest chip state awaiting persistence (set when the debounce is scheduled).
  // flushSave() writes it immediately; load({ silent }) flushes it BEFORE reconciling so a
  // background refetch never discards a not-yet-saved local edit (B3 stale-refetch guard).
  const pendingSaveRef = useRef<ChipState | null>(null);
  // Phase G soft CAS: the chip_config.version this client last loaded/saved. Passed to
  // chipService.save so a cross-director conflict can be DETECTED (soft stage: logged for
  // observability, save still applies; a later strict stage will reject + reload + notify).
  const versionRef = useRef(0);
  // Strict-CAS conflict notice (Phase G3, only when CHIP_APPLY_ENABLED): set true when a
  // write was REJECTED because another director changed the tournament first. The screen
  // surfaces it; the action was NOT applied and authoritative state has been reloaded.
  const [casConflict, setCasConflict] = useState(false);
  // Auto-save failure notice: set true when the newest snapshot could not be saved after
  // every bounded retry (see saveQueue). The local state is KEPT (not overwritten by a
  // reload) and is re-saved on the next action or via retrySave(); the TD may instead
  // discardUnsavedAndReload(). Retries re-save the SAME snapshot — a tournament action is
  // never replayed. Shared across Web/iOS/Android via this VM.
  const [saveError, setSaveError] = useState(false);
  // Cloud sync status for the web status strip: the chip object the save queue last confirmed
  // persisted, and whether the latest attempt failed (cleared by the next successful save).
  const [cloudSavedChip, setCloudSavedChip] = useState<ChipState | null>(null);
  const [saveFailing, setSaveFailing] = useState(false);
  // Stale-reload guard: a reload that started before a local mutation must not overwrite it.
  const loadGuardRef = useRef(createLoadGuard());
  // ── Web local backup / recovery (Phase 1: view-only) ──
  const [recovery, setRecovery] = useState<ChipRecoveryView>({ status: "none" });
  const recoveryStateRef = useRef<ChipRecoveryView>(recovery);
  useEffect(() => {
    recoveryStateRef.current = recovery;
  }, [recovery]);
  // Time of the newest local backup of this tournament (ISO), for the status strip.
  const [lastLocalBackupAt, setLastLocalBackupAt] = useState<string | null>(null);
  // A newer local backup the cloud never confirmed, found (and archived) on a successful load.
  const [divergentBackup, setDivergentBackup] = useState<ChipRecoverySnapshot | null>(null);
  // ── Web OFFLINE CONTROLLER (Phase 2, chip.offline-controller.ts) ──
  // The browser already running a live tournament keeps running it through an outage:
  // actions continue locally (existing engine), every state goes to IndexedDB, the cloud save
  // queue stays PAUSED, and reconnect loads + compares before a single verified push.
  const [offlineMode, setOfflineModeState] = useState<ChipOfflineMode>("online");
  const offlineModeRef = useRef<ChipOfflineMode>("online");
  const setOfflineMode = useCallback((m: ChipOfflineMode) => {
    offlineModeRef.current = m;
    setOfflineModeState(m);
  }, []);
  // The ONE offline session (base cloud version/fingerprint captured at the transition);
  // preserved across connectivity flaps until synced (verified) or explicitly discarded.
  const [offlineSession, setOfflineSessionState] = useState<ChipOfflineSession | null>(null);
  const offlineSessionRef = useRef<ChipOfflineSession | null>(null);
  const setOfflineSession = useCallback((next: ChipOfflineSession | null) => {
    offlineSessionRef.current = next;
    setOfflineSessionState(next);
  }, []);
  // divergentBackup is an offline session the cloud has NOT moved past (comparison says
  // unchanged) → it may be offered for sync. False for every other divergent backup.
  const [divergentCanSync, setDivergentCanSync] = useState(false);
  // Conflict prompt answered with "Keep Offline Copy" (stays protected + read-only).
  const [offlineConflictKept, setOfflineConflictKept] = useState(false);
  // Local state changes not yet confirmed by the cloud (online and offline).
  const unconfirmedRef = useRef(0);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  // Fingerprints of states handed to a cloud save (one may have landed with its reply lost).
  const sentFpsRef = useRef<string[]>([]);
  // The latest IndexedDB write failed (cleared by the next successful one).
  const [localSaveFailed, setLocalSaveFailed] = useState(false);
  // Monotonic local generation (every committed chip state).
  const localGenRef = useRef(0);
  // Last mutation refused (read-only backup view, offline sync/conflict/local-save failure,
  // or a cloud-only action while offline). The screen explains why using `reason`.
  // (A fresh object per attempt, so repeated attempts each re-notify.)
  const [recoveryBlocked, setRecoveryBlocked] = useState<{ action: string; reason: string } | null>(null);
  // READ-ONLY lock (backup view, or an offline mode that must hold actions): checked at every
  // mutation chokepoint.
  const recoveryLockRef = useRef(
    createRecoveryLock((action) =>
      setRecoveryBlocked({ action, reason: offlineModeRef.current !== "online" ? offlineModeRef.current : "viewing" }),
    ),
  );
  // Cloud-only actions (finish/reopen/start/rename/audit insert) can't run offline — the
  // tournament keeps running; they wait for the connection.
  const requiresCloud = useCallback((action: string): boolean => {
    if (offlineModeRef.current !== "online") {
      setRecoveryBlocked({ action, reason: "requires_cloud" });
      return true;
    }
    if (!cloudWriteOk()) {
      setRecoveryBlocked({ action, reason: "not_authorized" });
      return true;
    }
    return false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Local tournament mutations are only allowed on an authoritative board (they persist later).
  const notAuthorized = useCallback((action: string): boolean => {
    if (
      persistGateRef.current.canMutate({
        authUserId: optionsRef.current?.backupOwnerId ?? null,
        offline: offlineModeRef.current !== "online",
      })
    ) {
      return false;
    }
    setRecoveryBlocked({ action, reason: "not_authorized" });
    return true;
  }, []);
  // Cross-callback handles (defined further down).
  const enterOfflineRef = useRef<((why: string) => void) | null>(null);
  const attemptReconnectRef = useRef<(() => Promise<void>) | null>(null);
  // The chip state object the save queue last confirmed persisted (→ snapshot cloudConfirmed).
  const lastCloudSavedRef = useRef<ChipState | null>(null);
  // The chip state object last written to the local backup (→ checkpoint skips duplicates).
  const lastBackedUpRef = useRef<ChipState | null>(null);
  const backupWriterRef = useRef<ChipBackupWriter | null>(null);
  // The chip object a cloud load applied (its backup is tagged reason "load").
  const lastLoadedChipRef = useRef<ChipState | null>(null);
  // Stable handle to the recovery cloud check (defined after load()).
  const checkCloudRef = useRef<(() => Promise<void>) | null>(null);
  const getBackupWriter = useCallback((): ChipBackupWriter | null => {
    if (!chipRecoveryEnabled) return null;
    if (backupWriterRef.current) return backupWriterRef.current;
    const store = getChipLocalRecovery();
    if (!store) return null;
    backupWriterRef.current = createChipBackupWriter(store, {
      onWritten: (rec, input) => {
        lastBackedUpRef.current = input.chip;
        if (rec.tournamentId !== id) return;
        setLastLocalBackupAt(rec.savedAt);
        setLocalSaveFailed(false);
        if (offlineSessionRef.current) setOfflineSession(noteLocalSaved(offlineSessionRef.current, rec.savedAt));
        // Local storage works again → the offline controller may continue.
        if (offlineModeRef.current === "local_save_failed") {
          offlineModeRef.current = "offline";
          setOfflineModeState("offline");
          recoveryLockRef.current.exit();
        }
      },
      // Online: a local backup failure never affects the action or the cloud save (the strip
      // warns). OFFLINE: neither cloud nor device storage protects the tournament → block
      // further actions until a local save succeeds (Retry Local Save).
      onError: (e, op) => {
        console.warn(`[chip backup] local ${op} failed for tournament ${id}`, e);
        if (op !== "snapshot") return;
        setLocalSaveFailed(true);
        if (offlineModeRef.current === "offline") {
          offlineModeRef.current = "local_save_failed";
          setOfflineModeState("local_save_failed");
          recoveryLockRef.current.enter();
        }
      },
    });
    return backupWriterRef.current;
  }, [id, setOfflineSession]);
  // Save-failure log records not yet accepted by the analytics RPC (e.g. the network was
  // down when they happened). Re-sent after the next successful save. Bounded.
  const failureLogBufferRef = useRef<Record<string, unknown>[]>([]);
  // Stable handle to load() so flushSave can trigger a post-conflict reload without a
  // circular useCallback dependency (load depends on flushSave). Synced via an effect.
  const loadRef = useRef<((opts?: { silent?: boolean; skipFlush?: boolean; followUp?: boolean; checkBackup?: boolean; exitRecovery?: boolean; forceFresh?: boolean }) => Promise<void>) | null>(null);
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
  // Fix 1 — forward participant-sync outcome. null = ok / not yet run; a string = the last
  // sync FAILED for a real reason (NOT the "RPC not deployed yet" compat no-op, which the
  // service reports as success/0). Completion still stood; the sync is idempotent and
  // re-runnable via retryParticipantSync(), so this surfaces a retry without ever
  // re-running or corrupting tournament completion.
  const [participantSyncError, setParticipantSyncError] = useState<string | null>(null);
  // Setup-roster lock. Once the tournament is LIVE (in_progress) — or finished — the
  // SETUP roster is read-only: Add/Remove/Fargo/starting-chips/Ready/Paid/side-pots/
  // check-in must go through the controlled "Add Late Player" live flow, never the
  // setup editor. This is defense-in-depth: even if stale or another component calls a
  // setup-roster mutation, it no-ops while live. GAMEPLAY mutations (record winner,
  // adjust chips, tables, shuffle, forfeit, buy-back, restore, reorder queue…) are NOT
  // gated here — they flow through `update()`'s completed-only lock and stay valid
  // during live play. Reuses `tournamentRef` (authoritative live state), never local UI.
  const rosterLocked = useCallback(
    () =>
      recoveryLockRef.current.blocks("edit the roster") ||
      tournamentRef.current?.live_state === "in_progress" ||
      tournamentRef.current?.live_state === "finished" ||
      tournamentRef.current?.status === "completed",
    [],
  );

  // Send buffered save-failure logs; keep any the analytics RPC didn't accept (offline) for
  // the next attempt. One sender at a time.
  const sendingLogsRef = useRef(false);
  const sendFailureLogs = useCallback(async () => {
    if (sendingLogsRef.current || !failureLogBufferRef.current.length) return;
    sendingLogsRef.current = true;
    try {
      const batch = failureLogBufferRef.current;
      failureLogBufferRef.current = [];
      const unsent: Record<string, unknown>[] = [];
      for (const rec of batch) {
        const ok = await analyticsService.trackChipSaveFailure(id, rec);
        if (!ok) unsent.push(rec);
      }
      failureLogBufferRef.current = [...unsent, ...failureLogBufferRef.current].slice(-20);
    } finally {
      sendingLogsRef.current = false;
    }
  }, [id]);
  const sendFailureLogsRef = useRef(sendFailureLogs);
  useEffect(() => {
    sendFailureLogsRef.current = sendFailureLogs;
  }, [sendFailureLogs]);

  // Serialized save queue (see chip.save-queue.ts): one whole-state save in flight at a
  // time, newest snapshot wins, bounded retries of the SAME snapshot on failure, and an
  // unsaved snapshot is kept (never dropped) after the last retry fails.
  // Created lazily on first use (always from a callback/effect, never during render).
  const saveQueueRef = useRef<{ tid: number; queue: ChipSaveQueue<ChipState, ChipSaveOutcome> } | null>(null);
  const getSaveQueue = useCallback((): ChipSaveQueue<ChipState, ChipSaveOutcome> => {
    if (saveQueueRef.current?.tid === id) return saveQueueRef.current.queue;
    const queue = createChipSaveQueue<ChipState, ChipSaveOutcome>({
      save: async (state) => {
        // Defense in depth — the entry points are gated, but no write may reach the service
        // layer for a board that isn't authoritative for the current user.
        if (!cloudWriteOk()) throw new ChipPersistBlockedError();
        // Remember what we sent: if the reply is lost in an outage, finding this state in the
        // cloud on reconnect is OUR continuation, not another device's change.
        const fp = chipRecoveryFingerprint(state);
        if (!sentFpsRef.current.includes(fp)) sentFpsRef.current = [...sentFpsRef.current, fp].slice(-30);
        if (offlineSessionRef.current) setOfflineSession(noteSentFingerprint(offlineSessionRef.current, fp));
        if (CHIP_APPLY_ENABLED) {
          // STRICT CAS path (transactional RPC). A conflict means the write was REJECTED.
          const res = await chipService.applyState(id, state, versionRef.current);
          return { version: res.version, conflict: res.conflict, strict: true };
        }
        // SOFT stage: detect + log a cross-director conflict; the save still applies.
        const res = await chipService.save(id, state, { expectedVersion: versionRef.current });
        return { ...res, strict: false };
      },
      onSaved: (res, state) => {
        if (res.strict && res.conflict) {
          // Nothing persisted — discard this edit, reload authoritative state (skipping the
          // flush so the rejected edit isn't re-persisted), and notify. No auto-replay.
          queue.dropUnsaved();
          setCasConflict(true);
          void loadRef.current?.({ silent: true, skipFlush: true });
          return;
        }
        if (res.conflict) {
          console.warn(
            `[chip CAS] version conflict on tournament ${id} (expected ${versionRef.current}); save applied under soft CAS`,
          );
        }
        versionRef.current = res.version;
        lastCloudSavedRef.current = state;
        setCloudSavedChip(state);
        setSaveFailing(false);
        if (state === chipRef.current) {
          unconfirmedRef.current = 0;
          setUnsyncedCount(0);
        }
        getBackupWriter()?.markCloudSaved(id, state, res.version);
        void sendFailureLogsRef.current();
      },
      onAttemptFailed: ({ error, attempt, maxAttempts, willRetry }) => {
        if (error instanceof ChipPersistBlockedError) {
          queue.dropUnsaved(); // never held for a later (authenticated) retry
          return;
        }
        setSaveFailing(true);
        console.warn(`[chip save] tournament ${id} attempt ${attempt}/${maxAttempts} failed`, error);
        // Genuine outage (not a validation/permission answer) on the live controller → go
        // OFFLINE: pausing now makes the queue HOLD this snapshot instead of retrying/giving up.
        if (
          offlineModeRef.current === "online" &&
          shouldEnterOfflineOnSaveFailure({ error, attempt, maxAttempts, browserOnline: browserOnline() })
        ) {
          enterOfflineRef.current?.("save_failed");
        }
        failureLogBufferRef.current = [
          ...failureLogBufferRef.current,
          buildSaveFailureLog({ tournamentId: id, error, attempt, maxAttempts, willRetry, platform: Platform.OS }),
        ].slice(-20);
        void sendFailureLogsRef.current();
      },
      // Every retry failed: keep the local state (a reload would silently undo the TD's
      // actions) and tell the TD. The next action / retrySave() re-saves the newest state.
      onGaveUp: (state, error) => {
        if (error instanceof ChipPersistBlockedError) {
          queue.dropUnsaved();
          return;
        }
        // Explicit saves (finish/reopen/start) report failure to their own caller instead.
        // Offline controller: the offline banner owns this (nothing is lost; it's held + local).
        if (offlineModeRef.current !== "online") return;
        if (!explicitSavesRef.current.has(state)) setSaveError(true);
      },
    });
    saveQueueRef.current = { tid: id, queue };
    return queue;
  }, [id, getBackupWriter, setOfflineSession, cloudWriteOk]);

  // Hand the debounced snapshot to the queue NOW (or re-attempt an unsaved one) and wait
  // until nothing is saving. Resolves true when everything local is persisted. Used before
  // a background reconcile so an in-flight/pending local edit is never lost to a refetch.
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const toSave = pendingSaveRef.current;
    pendingSaveRef.current = null;
    const queue = getSaveQueue();
    // Persistence gate: an unauthoritative board is never enqueued or retried (Retry now,
    // pre-reload flush) — anything pending for it is discarded instead.
    if (!cloudWriteOk()) {
      queue.dropUnsaved();
      return false;
    }
    if (toSave) queue.enqueue(toSave);
    else queue.retry();
    return queue.flush();
  }, [getSaveQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Explicit whole-state save for finish / reopen / start: goes through the same serialized
  // queue (so it can't interleave with an auto-save) and throws to the caller if every retry
  // fails. On failure the explicit snapshot (e.g. a finished board) is NOT kept for a later
  // retry — the on-screen state is re-queued instead, so a retry never persists a transition
  // the caller did not complete.
  const explicitSavesRef = useRef(new WeakSet<ChipState>());
  const saveExplicit = useCallback(
    async (state: ChipState) => {
      if (!cloudWriteOk()) throw new ChipPersistBlockedError();
      const queue = getSaveQueue();
      explicitSavesRef.current.add(state);
      try {
        return await queue.saveNow(state);
      } catch (e) {
        queue.dropUnsaved();
        if (chipRef.current && chipRef.current !== state) queue.enqueue(chipRef.current);
        throw e;
      }
    },
    [getSaveQueue, cloudWriteOk],
  );

  // Drop the debounced snapshot without saving it — for explicit saves whose snapshot is
  // derived from the latest state and must not be followed by an older debounced one.
  const discardDebouncedSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSaveRef.current = null;
  }, []);

  // Save-failure recovery (the screen's alert buttons).
  const retrySave = useCallback(() => {
    setSaveError(false);
    void flushSave();
  }, [flushSave]);
  // Explicit, TD-confirmed: abandon the unsaved local changes and show what the server has.
  const discardUnsavedAndReload = useCallback(async () => {
    setSaveError(false);
    // During local recovery the choice is made in the recovery prompt (Use Cloud Version /
    // Keep Local Backup) — never silently drop the held snapshot from a stale alert.
    if (recoveryStateRef.current.status !== "none") return;
    discardDebouncedSave();
    const queue = getSaveQueue();
    queue.dropUnsaved();
    await queue.flush(); // let an in-flight attempt settle before reading
    queue.dropUnsaved();
    await loadRef.current?.({ silent: true, skipFlush: true });
  }, [discardDebouncedSave, getSaveQueue]);

  // `silent` reconciles server state WITHOUT the full-screen takeover — used after a
  // row-level mutation that already updated `chip` optimistically. Only the very first
  // load (never-loaded) uses the blocking `loading` flag.
  // exitRecovery: the TD chose the cloud version while viewing a local backup. The read-only
  // lock stays ON until the cloud state is applied (no action can touch the backup state in
  // between); if the fetch fails the backup view simply stays.
  // forceFresh: auth became valid after an unauthoritative board — apply the cloud even if
  // something local looks newer (it isn't authoritative and was never persisted).
  const load = useCallback(async (opts?: { silent?: boolean; skipFlush?: boolean; followUp?: boolean; checkBackup?: boolean; exitRecovery?: boolean; forceFresh?: boolean }) => {
    // Offline controller: never reload stale cloud state over the local continuation. A reload
    // request (Realtime signal, post-action refresh) just nudges the safe reconnect check.
    if (offlineModeRef.current !== "online" && !opts?.exitRecovery) {
      if (offlineModeRef.current === "offline") void attemptReconnectRef.current?.();
      return;
    }
    // Viewing a local backup: never overwrite it with a reload (e.g. a Realtime reload signal
    // when the connection returns) — run the non-destructive cloud check instead.
    if (recoveryLockRef.current.isActive() && !opts?.exitRecovery) {
      const st = recoveryStateRef.current;
      if (st.status === "viewing" && st.cloud === "unavailable") void checkCloudRef.current?.();
      return;
    }
    // Cloud writes are suppressed (a backup was offered after an outage): nothing may reload
    // or save until the cloud has been compared first — route to that check instead.
    if (getSaveQueue().isPaused() && !opts?.exitRecovery) {
      void checkCloudRef.current?.();
      return;
    }
    const silent = opts?.silent ?? false;
    if (silent) {
      // Persist any pending debounced change FIRST, then reconcile — otherwise a
      // background refetch (adjacent mutation, or the admin roster Realtime signal) would
      // overwrite `chip` with server state and drop a not-yet-saved local edit.
      // skipFlush: used by the strict-CAS conflict path, which intentionally DISCARDS the
      // rejected local edit rather than persisting it.
      if (!opts?.skipFlush) await flushSave();
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    // Stale-reload guard token: any local mutation after this point makes the fetched chip
    // state stale (it can't contain that action).
    const token = loadGuardRef.current.begin();
    // Persistence gate: the board is authoritative only if this load STARTED authenticated.
    const authAtStart = authUserId();
    // Web local backup: read the newest snapshot BEFORE this load applies anything (the backup
    // written for the loaded state must not mask an older unconfirmed one). Never throws.
    const firstLoad = !loadedRef.current;
    const recoveryStore = chipRecoveryEnabled ? getChipLocalRecovery() : null;
    const owner = backupOwner();
    const priorBackup: Promise<ChipRecoverySnapshot | null> | null = recoveryStore
      ? recoveryStore
          .getLatestSnapshot(id, owner)
          .then((snap) => (snap && owner && snap.ownerUserId === owner ? snap : null))
          .catch((e) => {
            console.warn(`[chip backup] read failed for tournament ${id}`, e);
            return null;
          })
      : null;
    try {
      const b = await chipService.load(id);
      // Cloud reachable: any "backup available" offer is moot.
      if (recoveryStateRef.current.status === "available") setRecovery({ status: "none" });
      setTournament(b.tournament);
      setResults(b.results ?? []); // Fix 2: durable placements for the completed view.
      // Keep local chip state when (a) the TD acted while this fetch was in flight, or (b)
      // local changes are still unsaved (saves failed) — server state would silently undo
      // them. The first-ever load has no local state and always applies. One follow-up
      // reload (flush first, then fetch) reconciles once the newer state is saved.
      if (
        !opts?.exitRecovery &&
        !opts?.forceFresh &&
        loadedRef.current &&
        (loadGuardRef.current.isStale(token) || getSaveQueue().hasUnsaved())
      ) {
        if (!opts?.followUp && !getSaveQueue().hasUnsaved()) {
          void loadRef.current?.({ silent: true, followUp: true });
        }
        return;
      }
      versionRef.current = b.version; // Phase G CAS baseline for the next save.
      // Record authority BEFORE the board is applied (effects after commit read the gate).
      const authoritative = persistGateRef.current.markCloudLoad({ authUserIdAtStart: authAtStart, chip: b.chip });
      setGateEpoch((n) => n + 1);
      setBoardSource(persistGateRef.current.source());
      const finished = b.tournament.live_state === "finished" || b.tournament.status === "completed";
      if (finished) {
        // Completed: normalize to a fully torn-down board and DO NOT run the active
        // guards (reconcileQueue would put the alive winner back in the queue,
        // settleShuffleDrain could revive shuffle state). Persist the cleanup so the
        // saved state is actually cleared, not just hidden.
        const cleaned = reconcileCompleted(b.chip);
        lastLoadedChipRef.current = cleaned;
        setChip(cleaned);
        if (cleaned !== b.chip && authoritative && cloudWriteOk()) getSaveQueue().enqueue(cleaned);
      } else {
        // Self-heal on load: (1) void ghost matches whose teams are gone, (2) settle
        // a stuck shuffle drain, (3) re-attach any alive team that fell out of the
        // queue (e.g. from a stale/failed config save while a migration was pending),
        // (4) auto-clear stale Fargo-cap overrides now at/under the cap (rating or the
        // tournament max changed). Owned singles persist via auto-save; doubles/self-reg
        // are projected (auto-save skips them), so clear those sources explicitly.
        // …and (5) auto-seat the finals if the board was left at two-alive-no-match
        // (e.g. the app was reopened mid-finals between games) so the final two are
        // never stranded waiting for a manual restart.
        const healed = assignFinals(
          reconcileQueue(reconcileEliminations(settleShuffleDrain(reconcileMatches(b.chip)))),
        );
        const { chip: reconciled, cleared } = reconcileOverrides(healed, b.tournament?.max_fargo ?? null);
        lastLoadedChipRef.current = reconciled;
        setChip(reconciled);
        for (const e of authoritative ? cleared : []) {
          if (e.teamId != null) teamService.setTeamFargoOverride(e.teamId, false, { cap: null, rating: null, reason: null, notes: null }).catch(() => {});
          else if (e.regId != null && e.fromRegistration)
            registrationService.setFargoOverride(e.regId, false, { cap: null, rating: null, reason: null, notes: null, overriddenBy: null }).catch(() => {});
        }
      }
      loadedRef.current = true;
      if (opts?.exitRecovery) {
        recoveryLockRef.current.exit(); // before commit, so the cloud board saves/backs up normally
        setRecovery({ status: "none" });
        setDivergentBackup(null);
        // Leaving an offline conflict via "Use Cloud Version": the offline copy was archived
        // locally when the conflict was detected; the session ends here.
        if (offlineSessionRef.current) {
          failureLogBufferRef.current = [
            ...failureLogBufferRef.current,
            buildOfflineSessionLog({ session: offlineSessionRef.current, reconnectedAt: new Date().toISOString(), outcome: "discarded", platform: Platform.OS }),
          ].slice(-20);
          void sendFailureLogsRef.current();
        }
        setOfflineSession(null);
        setOfflineConflictKept(false);
        setOfflineMode("online");
        unconfirmedRef.current = 0;
        setUnsyncedCount(0);
        // Stale writes were discarded BEFORE this load; only now may the queue write again.
        getSaveQueue().resume();
      }
      // A newer local backup the cloud never confirmed (tab closed before its save landed,
      // or saves were failing) is set aside so ordinary play can't rotate it out, and the TD
      // is told. Never pushed to the cloud.
      if (priorBackup && recoveryStore && (firstLoad || opts?.checkBackup)) {
        const latest = await priorBackup;
        if (latest) setLastLocalBackupAt((cur) => cur ?? latest.savedAt);
        const recoveredSession = latest?.offlineSession ?? null;
        if (
          latest &&
          recoveredSession &&
          canResumeOfflineSession({ snapshotOwnerUserId: latest.ownerUserId, storedUserId: owner, session: recoveredSession, tournamentId: id }) &&
          isDivergentUnconfirmedBackup(healedCloudChip(b), latest) &&
          classifyCloudOnReconnect(healedCloudChip(b), recoveredSession) === "unchanged"
        ) {
          // Offline changes the cloud never got, and nobody changed the cloud since → offer to
          // sync them (divergentBackup + canSyncOffline). Nothing is pushed until the TD chooses;
          // the copy is set aside meanwhile so ordinary play can't rotate it out.
          recoveryStore
            .archiveConflict(latest)
            .catch((e) => console.warn(`[chip backup] archive failed for tournament ${id}`, e));
          setDivergentCanSync(true);
          setDivergentBackup(latest);
        } else if (latest && isDivergentUnconfirmedBackup(healedCloudChip(b), latest)) {
          recoveryStore
            .archiveConflict(latest)
            .catch((e) => console.warn(`[chip backup] archive failed for tournament ${id}`, e));
          setDivergentCanSync(false); // cloud moved on (or not an offline session): view only
          setDivergentBackup(latest);
        }
      }
    } catch (e: any) {
      const message = e?.message ?? "Failed to load tournament.";
      // The live controller lost the cloud mid-session → OFFLINE CONTROLLER (keep running on
      // the local state) instead of the read-only recovery prompt.
      if (!opts?.exitRecovery && isLiveController() && isOutageError(e, browserOnline())) {
        enterOfflineRef.current?.("load_failed");
        return;
      }
      const viewing = recoveryStateRef.current;
      if (opts?.exitRecovery && (viewing.status === "viewing" || viewing.status === "conflict")) {
        console.warn(`[chip backup] cloud version unavailable for tournament ${id}; staying on local backup`, e);
        setRecovery({ status: "viewing", snapshot: viewing.snapshot, cloud: "unavailable" });
        return;
      }
      // Web: an outage with a local backup on this browser -> offer it (Open Local Copy /
      // Retry). No backup, or a definitive error (not found / no access) -> unchanged.
      if (priorBackup) {
        const decision = decideLoadFailure(e, await priorBackup, browserOnline());
        if (decision.kind === "offer_recovery") {
          // Suppress every cloud write from here (retry back-offs included) until the cloud
          // has been reloaded and compared.
          void getSaveQueue().pause();
          // The recovery prompt now owns the decision; retire the generic save-failure alert.
          setSaveError(false);
          setRecovery({ status: "available", snapshot: decision.snapshot, error: message });
          setLastLocalBackupAt((cur) => cur ?? decision.snapshot.savedAt);
        }
      }
      setError(message);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [id, flushSave, getSaveQueue, setOfflineMode, setOfflineSession, authUserId, cloudWriteOk]);

  useEffect(() => {
    loadedRef.current = false;
    if (recoveryOnly) return; // opened from the local backup instead (below)
    load();
  }, [load, recoveryOnly]);
  // Keep loadRef pointing at the latest load() so flushSave's strict-CAS conflict path can
  // reload without a circular dependency.
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Debounced auto-save whenever the chip blob changes (after the initial load). The
  // latest state is stashed in pendingSaveRef so flushSave() (before a silent reload) can
  // persist it synchronously instead of losing it to the incoming refetch.
  useEffect(() => {
    if (!loadedRef.current || !chip || recoveryLockRef.current.isActive()) return;
    if (!cloudWriteOk()) return; // persistence gate: never schedule a save for this board
    pendingSaveRef.current = chip;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [chip, id, flushSave, gateEpoch, options?.backupOwnerId, options?.profileReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the screen must not drop a debounced (≤800ms) or unsaved snapshot: hand it to
  // the queue, which keeps saving in the background.
  useEffect(
    () => () => {
      const queue = getSaveQueue();
      if (!cloudWriteOk()) {
        // Persistence gate: leaving an unauthoritative board writes nothing.
        queue.dropUnsaved();
        pendingSaveRef.current = null;
        return;
      }
      if (pendingSaveRef.current) queue.enqueue(pendingSaveRef.current);
      else queue.retry();
      pendingSaveRef.current = null;
    },
    [getSaveQueue, cloudWriteOk],
  );

  // ── Local backup writes (web) ──
  // Snapshot point = A: right after the authoritative local chip state changes (every
  // update(), undo/restore, start, and each applied cloud load), BEFORE the debounced cloud
  // save — so the newest state survives even if the cloud save never lands. The write is
  // deferred + coalesced off the action path and can never fail or delay the action.
  // Only started (live/finished) tournaments are backed up; never while viewing a backup.
  const backupNow = useCallback(
    (c: ChipState, reason: ChipRecoveryReason, force = false) => {
      if (!chipRecoveryEnabled || (recoveryLockRef.current.isActive() && !force) || !c.startedAt) return;
      // Persistence gate: only an authoritative board, owned by a verified user, is backed up
      // (a signed-out visit that loaded an empty RLS-hidden board never writes/rotates backups).
      if (!localWriteOk()) return;
      const owner = persistGateRef.current.owner() as string;
      const t = tournamentRef.current;
      const writer = getBackupWriter();
      if (!t || !writer) return;
      writer.schedule({
        tournamentId: id,
        ownerUserId: owner,
        tournament: pickRecoveryTournamentInfo(t),
        chip: c,
        reason,
        cloudVersion: versionRef.current,
        cloudConfirmed: c === lastCloudSavedRef.current,
        finished: t.live_state === "finished" || t.status === "completed",
        offlineSession: offlineSessionRef.current
          ? { ...offlineSessionRef.current, unsyncedCount: unconfirmedRef.current }
          : null,
      });
    },
    [id, getBackupWriter, localWriteOk],
  );
  // Unsynced-change accounting: every committed local change (action, undo, restore…) that is
  // not a cloud load counts until the cloud confirms that state (onSaved resets it).
  useEffect(() => {
    if (!loadedRef.current || !chip) return;
    localGenRef.current += 1;
    if (chip === lastLoadedChipRef.current) {
      // A cloud load is fully confirmed; a RESUMED offline snapshot keeps its unsynced count.
      if (!offlineSessionRef.current) unconfirmedRef.current = 0;
    } else if (!recoveryLockRef.current.isActive()) {
      unconfirmedRef.current += 1;
    }
    setUnsyncedCount(unconfirmedRef.current);
  }, [chip]);
  useEffect(() => {
    if (!loadedRef.current || !chip) return;
    backupNow(chip, chip === lastLoadedChipRef.current ? "load" : "action");
  }, [chip, backupNow]);
  // Periodic safety checkpoint: re-writes only when the newest state is not yet backed up
  // (e.g. a previous local write failed). Not a substitute for the per-action writes.
  useEffect(() => {
    if (!chipRecoveryEnabled) return;
    const timer = setInterval(() => {
      const c = chipRef.current;
      if (c && loadedRef.current && c !== lastBackedUpRef.current) backupNow(c, "checkpoint");
    }, CHIP_RECOVERY_CHECKPOINT_MS);
    return () => clearInterval(timer);
  }, [backupNow]);
  // Retention sweep once per opened tournament (this one is exempt from age/cap pruning).
  useEffect(() => {
    if (!chipRecoveryEnabled) return;
    getChipLocalRecovery()
      ?.pruneSnapshots({ keepTournamentId: id })
      .catch((e) => console.warn("[chip backup] prune failed", e));
  }, [id]);

  // ── Recovery actions ──
  // Show a local backup READ-ONLY. Nothing is saved while viewing: update()/undo/restore/
  // finish/start/roster writes are refused by the lock, and the auto-save + backup effects skip.
  const enterRecoveryView = useCallback(
    (snap: ChipRecoverySnapshot, cloud: "unavailable" | "available") => {
      recoveryLockRef.current.enter();
      void getSaveQueue().pause(); // no cloud write while a backup is shown
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setTournament(snap.tournament as unknown as Tournament);
      setChip(snap.chip);
      setResults([]);
      setError(null);
      setRecovery({ status: "viewing", snapshot: snap, cloud });
    },
    [getSaveQueue],
  );
  // Offline entry point: open the newest local backup of this tournament (owned by the
  // session stored on this browser) without any cloud call.
  useEffect(() => {
    if (!recoveryOnly) return;
    let alive = true;
    const owner = backupOwner();
    const store = getChipLocalRecovery();
    (store && owner ? store.getLatestSnapshot(id, owner) : Promise.resolve(null))
      .catch(() => null)
      .then((snap) => {
        if (!alive) return;
        if (snap && owner && snap.ownerUserId === owner) enterRecoveryView(snap, "unavailable");
        else setError("No local backup of this tournament is available on this browser.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, recoveryOnly, enterRecoveryView]);
  const openLocalCopy = useCallback(() => {
    const r = recoveryStateRef.current;
    if (r.status === "available") enterRecoveryView(r.snapshot, "unavailable");
  }, [enterRecoveryView]);
  // Leave the backup and show the authoritative cloud state. Explicit TD choice: any
  // in-session unsaved snapshot is dropped. The viewed backup is kept (archived if the cloud
  // never confirmed it) — nothing local is deleted and nothing is pushed.
  const switchToCloudVersion = useCallback(async () => {
    const queue = getSaveQueue();
    // Discard every pending/held write while the queue stays PAUSED; the cloud state is applied
    // by load(exitRecovery), which resumes the queue only afterwards.
    await discardPendingForCloud(queue);
    pendingSaveRef.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (recoveryOnly) {
      // Offline entry point: hand over to the normal Admin screen (normal auth/permissions),
      // which loads the cloud itself. This read-only view never becomes a live screen.
      optionsRef.current?.onCloudRecovered?.();
      return;
    }
    loadGuardRef.current.markLocalChange(); // any in-flight load predates this choice
    await loadRef.current?.({ silent: true, skipFlush: true, checkBackup: true, exitRecovery: true });
  }, [getSaveQueue, recoveryOnly]);
  // Reconnect check. Order (checkCloudForRecovery): pause the queue + let any in-flight
  // attempt settle -> load the cloud -> compare cloud vs backup vs held unsaved snapshot.
  // Consistent -> switchToCloudVersion (discard redundant writes, apply cloud, THEN resume).
  // Different -> conflict prompt; the queue stays paused and nothing is pushed.
  const runCloudCheck = useCallback(
    async (snapshot: ChipRecoverySnapshot) => {
      setRecovery({ status: "viewing", snapshot, cloud: "checking" });
      try {
        const res = await checkCloudForRecovery({
          queue: getSaveQueue(),
          loadCloud: () => chipService.load(id),
          cloudChipOf: healedCloudChip,
          snapshot,
        });
        if (res.outcome === "consistent") await switchToCloudVersion();
        else setRecovery({ status: "conflict", snapshot, unsavedSession: res.unsavedSession });
      } catch (e) {
        console.warn(`[chip backup] cloud still unavailable for tournament ${id}`, e);
        setRecovery({ status: "viewing", snapshot, cloud: "unavailable" });
      }
    },
    [id, getSaveQueue, switchToCloudVersion],
  );
  const retryCloud = useCallback(async () => {
    const r = recoveryStateRef.current;
    if (r.status === "viewing" || r.status === "conflict") {
      await runCloudCheck(r.snapshot);
      return;
    }
    const queue = getSaveQueue();
    if (r.status === "available" && queue.peekUnsaved()) {
      // An unsaved snapshot from before the outage is held: show the backup read-only and
      // compare against the cloud BEFORE anything may be written.
      enterRecoveryView(r.snapshot, "unavailable");
      await runCloudCheck(r.snapshot);
      return;
    }
    // Nothing held: re-arming the (empty) queue can't write anything; try a normal load.
    queue.resume();
    await loadRef.current?.();
  }, [getSaveQueue, runCloudCheck, enterRecoveryView]);
  useEffect(() => {
    checkCloudRef.current = retryCloud;
  }, [retryCloud]);
  // Conflict -> keep viewing the backup (read-only); the cloud version stays one tap away.
  const keepLocalBackup = useCallback(() => {
    const r = recoveryStateRef.current;
    if (r.status === "conflict") setRecovery({ status: "viewing", snapshot: r.snapshot, cloud: "available" });
  }, []);
  // ── Offline controller ──
  // Is this browser the live controller of a running tournament (eligible to go offline)?
  function isLiveController(): boolean {
    return (
      chipRecoveryEnabled &&
      loadedRef.current &&
      !!chipRef.current?.startedAt &&
      tournamentRef.current?.live_state === "in_progress" &&
      recoveryStateRef.current.status === "none" &&
      !recoveryLockRef.current.isActive()
    );
  }
  const enterOfflineController = useCallback(
    (why: string) => {
      if (offlineModeRef.current !== "online" || !isLiveController()) return;
      // Only an authoritative, owner-verified board may become an offline controller.
      if (persistGateRef.current.source() === "none" || !localWriteOk()) return;
      const queue = getSaveQueue();
      void queue.pause(); // suppress every cloud write from here (held, never dropped)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // Base captured ONCE per session; a flap (reconnect failed) keeps the original base.
      const session =
        offlineSessionRef.current ??
        createOfflineSession({
          tournamentId: id,
          ownerUserId: backupOwner(),
          baseCloudVersion: versionRef.current,
          baseChip: lastCloudSavedRef.current ?? lastLoadedChipRef.current,
          startLocalSeq: localGenRef.current,
          pendingUnsynced: unconfirmedRef.current,
          sentFingerprints: sentFpsRef.current,
        });
      console.warn(`[chip offline] tournament ${id} → OFFLINE CONTROLLER (${why})`);
      setOfflineSession(session);
      setOfflineMode("offline");
      setSaveError(false);
      if (chipRef.current) backupNow(chipRef.current, "checkpoint", true); // persist the session now
    },
    [id, getSaveQueue, backupNow, setOfflineSession, setOfflineMode, localWriteOk],
  );
  useEffect(() => {
    enterOfflineRef.current = enterOfflineController;
  }, [enterOfflineController]);

  // Reconnect (online event / probe ok / Retry Connection). Order in reconnectOfflineController:
  // queue paused → load cloud → compare vs session base → unchanged: ONE verified push of the
  // latest local snapshot; changed: conflict (nothing pushed).
  const reconnectBusyRef = useRef(false);
  const attemptReconnect = useCallback(async () => {
    const session = offlineSessionRef.current;
    if (offlineModeRef.current !== "offline" || !session || reconnectBusyRef.current) return;
    // The push needs the session owner signed in again (never another/no account).
    if (!cloudWriteOk()) return;
    reconnectBusyRef.current = true;
    setOfflineMode("reconnecting");
    recoveryLockRef.current.enter(); // hold actions while comparing/syncing (brief)
    const queue = getSaveQueue();
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSaveRef.current = null; // superseded by the latest-local push below
    try {
      const res = await reconnectOfflineController({
        session,
        queue,
        loadCloud: () => chipService.load(id),
        cloudChipOf: healedCloudChip,
        latestLocal: () => chipRef.current as ChipState,
        onUnchanged: () => setOfflineMode("syncing"),
        // Final optimistic precondition right before the push (atomic version claim).
        claimVersion: (bundle) => chipService.claimChipVersion(id, bundle.version),
        beforePush: (bundle, _target, claim) => {
          // CAS baseline for the push = the version we just claimed (or the re-checked one).
          versionRef.current = claim === "claimed" ? bundle.version + 1 : bundle.version;
        },
      });
      const log = (outcome: "synced" | "conflict") => {
        failureLogBufferRef.current = [
          ...failureLogBufferRef.current,
          buildOfflineSessionLog({
            session: { ...session, unsyncedCount: unconfirmedRef.current },
            reconnectedAt: new Date().toISOString(),
            outcome,
            platform: Platform.OS,
          }),
        ].slice(-20);
        void sendFailureLogsRef.current();
      };
      if (res.outcome === "still_offline") {
        setOfflineMode("offline"); // session + base preserved
        recoveryLockRef.current.exit();
      } else if (res.outcome === "conflict") {
        // Keep the offline copy safe: set the newest local snapshot aside (not rotated out).
        const store = getChipLocalRecovery();
        store
          ?.getLatestSnapshot(id, backupOwner())
          .then((snap) => (snap ? store.archiveConflict(snap) : undefined))
          .catch((e) => console.warn(`[chip offline] archive failed for tournament ${id}`, e));
        console.warn(`[chip offline] reconnect conflict on tournament ${id}: ${res.reason}`);
        setOfflineConflictKept(false);
        setOfflineMode("conflict"); // lock stays: local copy protected, read-only
        log("conflict");
      } else {
        setTournament(res.bundle.tournament);
        setResults(res.bundle.results ?? []);
        // The cloud now holds this board (verified) → a normal authoritative cloud board.
        persistGateRef.current.markCloudLoad({ authUserIdAtStart: authUserId(), chip: chipRef.current as ChipState });
        setGateEpoch((n) => n + 1);
      setBoardSource(persistGateRef.current.source());
        log("synced");
        setOfflineSession(null);
        unconfirmedRef.current = 0;
        setUnsyncedCount(0);
        setOfflineMode("online");
        recoveryLockRef.current.exit();
        if (recoveryOnly) optionsRef.current?.onCloudRecovered?.(); // hand over to the Admin screen
      }
    } finally {
      reconnectBusyRef.current = false;
    }
  }, [id, getSaveQueue, setOfflineMode, setOfflineSession, recoveryOnly, authUserId, cloudWriteOk]);
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  }, [attemptReconnect]);

  // Local storage failed while offline → retry writing the current state (forced past the lock).
  const retryLocalSave = useCallback(() => {
    if (chipRef.current) backupNow(chipRef.current, "checkpoint", true);
  }, [backupNow]);
  // Offline conflict → keep the protected offline copy (read-only); cloud stays one tap away.
  const keepOfflineCopy = useCallback(() => setOfflineConflictKept(true), []);

  // Browser close while offline → reopen: resume the offline controller from the recovered
  // backup (same stored-session owner + intact offline session only; otherwise read-only).
  const canResumeOffline = (snap: ChipRecoverySnapshot | null | undefined): boolean =>
    !!snap &&
    chipRecoveryEnabled &&
    canResumeOfflineSession({
      snapshotOwnerUserId: snap.ownerUserId,
      storedUserId: backupOwner(),
      session: snap.offlineSession,
      tournamentId: id,
    });
  const resumeOfflineFromSnapshot = useCallback(
    (snap: ChipRecoverySnapshot) => {
      const session = snap.offlineSession;
      if (!session || !canResumeOffline(snap)) return false;
      void getSaveQueue().pause();
      recoveryLockRef.current.exit();
      setRecovery({ status: "none" });
      setError(null);
      setDivergentBackup(null);
      setTournament(snap.tournament as unknown as Tournament);
      persistGateRef.current.markOfflineSession((session.ownerUserId ?? snap.ownerUserId) as string);
      setGateEpoch((n) => n + 1);
      setBoardSource(persistGateRef.current.source());
      lastLoadedChipRef.current = snap.chip; // restoring it is not a new change
      loadedRef.current = true;
      versionRef.current = session.baseCloudVersion ?? 0;
      sentFpsRef.current = session.sentFingerprints.slice();
      unconfirmedRef.current = session.unsyncedCount;
      setUnsyncedCount(session.unsyncedCount);
      setOfflineSession(session);
      setOfflineMode("offline");
      chipRef.current = snap.chip; // synchronous: a reconnect right after must push THIS state
      setChip(snap.chip);
      setLoading(false);
      return true;
    },
    [getSaveQueue, setOfflineMode, setOfflineSession], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const resumeOfflineControl = useCallback(() => {
    const r = recoveryStateRef.current;
    if (r.status === "available" || r.status === "viewing") resumeOfflineFromSnapshot(r.snapshot);
  }, [resumeOfflineFromSnapshot]);
  // Reopened ONLINE with an intact offline session whose cloud base is unchanged: continue
  // the offline session and sync it (same verified reconnect path).
  const syncRecoveredOffline = useCallback(async () => {
    const snap = divergentBackup;
    if (!snap || !resumeOfflineFromSnapshot(snap)) return;
    await attemptReconnect();
  }, [divergentBackup, resumeOfflineFromSnapshot, attemptReconnect]);

  // Auth became valid (or changed user) after an unauthoritative load: the in-memory board is
  // NOT promoted. Discard anything pending for it and reload from the cloud first; only that
  // authenticated load can enable persistence.
  const authKey = `${options?.backupOwnerId ?? ""}|${options?.profileReady ? 1 : 0}`;
  useEffect(() => {
    const gate = persistGateRef.current;
    const auth = authUserId();
    if (gate.source() === "cloud" && gate.owner() !== auth) {
      gate.markUnauthoritative(); // signed out / switched account: stop persisting now
      setGateEpoch((n) => n + 1);
      setBoardSource(persistGateRef.current.source());
    }
    if (offlineModeRef.current !== "online" || recoveryStateRef.current.status !== "none" || recoveryOnly) return;
    if (!gate.needsFreshLoad({ authUserId: auth, profileReady: !!optionsRef.current?.profileReady, loaded: loadedRef.current })) return;
    const queue = getSaveQueue();
    queue.dropUnsaved();
    pendingSaveRef.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    loadGuardRef.current.markLocalChange();
    void loadRef.current?.({ silent: true, skipFlush: true, forceFresh: true });
  }, [authKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connectivity signals: browser offline → go offline now; online event → reconnect check.
  useEffect(() => {
    if (!chipRecoveryEnabled || typeof window === "undefined" || !window.addEventListener) return;
    const onOffline = () => enterOfflineRef.current?.("browser_offline");
    const onOnline = () => void attemptReconnectRef.current?.();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  // Conservative reachability probe while offline (one tiny HEAD request every 20s) — the
  // paused queue itself never hammers Supabase.
  useEffect(() => {
    if (offlineMode !== "offline") return;
    const timer = setInterval(() => {
      void cloudStatusService.probeCloud().then((ok) => {
        if (ok) void attemptReconnectRef.current?.();
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [offlineMode]);

  // Look at the divergent backup found on load (read-only; cloud is available).
  const viewDivergentBackup = useCallback(async () => {
    const snap = divergentBackup;
    if (!snap) return;
    await flushSave(); // don't strand a pending save of the live board
    enterRecoveryView(snap, "available");
  }, [divergentBackup, flushSave, enterRecoveryView]);
  // Web: retry the cloud automatically when the browser reports it is back online.
  useEffect(() => {
    if (!chipRecoveryEnabled || typeof window === "undefined" || !window.addEventListener) return;
    const onOnline = () => {
      const st = recoveryStateRef.current;
      if (st.status === "available" || (st.status === "viewing" && st.cloud === "unavailable")) {
        void checkCloudRef.current?.();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

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
    // Viewing a local backup (web recovery): read-only, every live mutation is refused.
    if (recoveryLockRef.current.blocks("change the tournament")) return;
    if (notAuthorized("change the tournament")) return;
    // Global completed-tournament lock: a finished/completed tournament is
    // read-only. Every live mutation (record winner, chips, tables, queue,
    // shuffle, forfeit, restore, …) flows through here, so this one guard blocks
    // them all — no completed tournament can be changed via stale UI or a retry.
    const t = tournamentRef.current;
    if (t?.live_state === "finished" || t?.status === "completed") return;
    loadGuardRef.current.markLocalChange();
    setChip((c) => {
      if (!c) return c;
      // assignFinals runs LAST so that once a mutation leaves exactly two players
      // alive with no active match, the final heads-up game is auto-seated here in
      // the state transition (never from render) — no manual "Start Final Match".
      let next = assignFinals(reconcileEliminations(settleShuffleDrain(materializeLive(fn(c)))));
      if (next === c) return c; // no-op — nothing to record
      const added = Math.max(0, next.events.length - c.events.length);
      if (added > 0) {
        // Events are stored newest-first, so the new ones are the first `added`. Stamp the
        // acting director (item 21) on any that didn't set their own actor, and share one
        // txId across a multi-event action (match_result + chip_loss + elimination) so the
        // Audit Log folds them into one row.
        const actor = actorRef.current;
        const txId = added > 1 ? newId("tx") : null;
        const evs = next.events.slice();
        for (let k = 0; k < added; k++) {
          let ev = evs[k];
          if (actor.id != null && ev.by == null) {
            ev = {
              ...ev,
              by: actor.id,
              payload: { ...(ev.payload ?? {}), actorName: ev.payload?.actorName ?? actor.name },
            };
          }
          if (txId) ev = { ...ev, txId };
          evs[k] = ev;
        }
        next = { ...next, events: evs };
        // Append a PERSISTED restore point (pre-action snapshot). Label it from the
        // PARENT event (the cause) so confirm prompts read "…beat…", not "…lost a chip".
        const newEvents = evs.slice(0, added);
        const parent = txParent(newEvents);
        return withRestorePoint(next, c, newEvents.map((e) => e.id), parent.text);
      }
      return next;
    });
  }, [notAuthorized]);

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
      if (recoveryLockRef.current.blocks("restore the tournament") || notAuthorized("restore the tournament")) return false;
      const c = chipRef.current;
      if (!c) return false;
      const restored = engineRestoreToPoint(c, eventId, meta);
      if (restored === c) return false;
      loadGuardRef.current.markLocalChange();
      setChip(restored);
      return true;
    },
    [notAuthorized],
  );
  // Quick shortcut: revert the last `n` logged actions (no reason required).
  const undoLast = useCallback(
    (n: number, meta: { reason: string; actorId?: number | null; actorName?: string | null }) => {
      if (recoveryLockRef.current.blocks("undo") || notAuthorized("undo")) return false;
      const c = chipRef.current;
      if (!c || !(c.restorePoints ?? []).length) return false;
      const restored = engineUndoLastActions(c, n, meta);
      if (restored === c) return false;
      loadGuardRef.current.markLocalChange();
      setChip(restored);
      return true;
    },
    [notAuthorized],
  );

  // ── Settings ────────────────────────────────────────────────────────────────
  const updateSettings = useCallback(
    (patch: Partial<ChipSettings>) =>
      update((c) => ({ ...c, settings: { ...c.settings, ...patch } })),
    [update],
  );

  const setName = useCallback(
    (name: string) => {
      if (recoveryLockRef.current.blocks("rename the tournament") || requiresCloud("rename the tournament")) return;
      setTournament((t) => (t ? { ...t, name } : t));
      chipService.setName(id, name).catch(() => {});
    },
    [id, requiresCloud],
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
    (patch?: Partial<ChipEntry>) => {
      if (rosterLocked()) return; // live/finished: use the Add Late Player flow, not setup
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
      });
    },
    [update, rosterLocked],
  );
  const updateEntry = useCallback(
    (entryId: string, patch: Partial<ChipEntry>) => {
      if (rosterLocked()) return; // live/finished: setup roster is read-only
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
      }));
    },
    [update, rosterLocked],
  );
  const removeEntry = useCallback(
    (entryId: string) => {
      if (rosterLocked()) return; // live/finished: setup roster is read-only
      update((c) => ({ ...c, entries: c.entries.filter((e) => e.id !== entryId) }));
    },
    [update, rosterLocked],
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
  // Shuffle modal confirm: apply the TD's table-removal selection AND begin the cycle
  // in ONE authoritative step, recording shuffle-owned closings for a safe cancel.
  const startShuffleCycle = useCallback(
    (removeTableIds: string[]) => update((c) => engineStartShuffleCycle(c, removeTableIds)),
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
    (tableId: string, destination: "next" | "end" = "end") =>
      update((c) => engineClearTable(c, tableId, destination)),
    [update],
  );
  // Remove ONE entry from a table (voids a live match; the other entry stays seated) and
  // queue it at the chosen end. Goes through update(), so it gets the same actor stamp,
  // persisted restore point (Undo) and save as every other live action.
  const removeFromTable = useCallback(
    (tableId: string, entryId: string, destination: "next" | "end" = "end") =>
      update((c) => engineRemoveFromTable(c, tableId, entryId, destination)),
    [update],
  );
  // Shuffle Mode override: return every active match to the FRONT of the queue (no winner /
  // chip loss / completed match) so a reshuffle can proceed. actorId is threaded to `by`
  // for the audit event. Explicit TD action only — never called automatically.
  const returnActiveMatchesToQueue = useCallback(
    (actorId?: number | null) => update((c) => engineReturnActiveMatchesToQueue(c, actorId ?? null)),
    [update],
  );
  const startPendingMatch = useCallback(
    (tableId: string) => update((c) => engineStartPendingMatch(c, tableId)),
    [update],
  );
  // "Start All": start every announced-but-not-started opening matchup at once.
  const startAllMatches = useCallback(
    () => update((c) => engineStartAllMatches(c)),
    [update],
  );
  const setTableLocked = useCallback(
    (tableId: string, locked: boolean) => update((c) => engineSetTableLocked(c, tableId, locked)),
    [update],
  );
  // Lock/Unlock ALL active tables at once (pure availability — never seats). `actorId`
  // (id_auto) is threaded so the single summary audit event records who did it.
  const setAllTablesLocked = useCallback(
    (locked: boolean, actorId?: number | null) => update((c) => engineSetAllTablesLocked(c, locked, actorId ?? null)),
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
  // Manual chip override. `meta` carries the required reason/notes + acting director
  // (id_auto) for the audit row; the engine rejects a live adjustment with no reason and
  // refuses to zero an actively-playing player (defense-in-depth).
  const adjustChips = useCallback(
    (entryId: string, delta: number, meta?: ChipAdjustMeta | null) =>
      update((c) => engineAdjustChips(c, entryId, delta, meta)),
    [update],
  );
  // Forfeit Match: the opponent wins the current match, the forfeiter loses 1 chip and
  // goes to the back of the queue (eliminated only if that reaches 0). `meta` carries the
  // public reason/notes + acting director for the audit event.
  const forfeitMatch = useCallback(
    (entryId: string, meta?: ForfeitMeta | null) => update((c) => engineForfeitMatch(c, entryId, meta)),
    [update],
  );
  // Forfeit Tournament: the TD removes an entry from the whole tournament (eliminated
  // regardless of chips; opponent wins by forfeit if mid-match). `meta` = public audit.
  const forfeitEntry = useCallback(
    (entryId: string, meta?: ForfeitMeta | null) => update((c) => engineForfeitEntry(c, entryId, meta)),
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
  // Returns true when the tournament is completed (or was already completed) so the
  // caller can immediately sync host UI (header badge / phase). False = nothing was
  // finalized this call (in-flight, no champion, or completion threw).
  const endTournament = useCallback(async (): Promise<boolean> => {
    if (recoveryLockRef.current.blocks("finish the tournament") || requiresCloud("finish the tournament")) return false;
    if (finishingRef.current) return false; // already in flight — no double completion
    const c = chipRef.current ?? chip;
    if (!c?.winnerId) return false; // guard: no champion yet
    // Idempotent: if already completed, the saved finalization stands — report success
    // so the host can (re)sync its cached status without re-finalizing.
    const t = tournamentRef.current;
    if (t?.live_state === "finished" || t?.status === "completed") return true;
    finishingRef.current = true;
    setFinishing(true);
    let completed = false;
    try {
      const next = engineFinishTournament(c, null);
      // Supersede any debounced snapshot (next is derived from the latest state) and save
      // through the serialized queue so it can't interleave with an in-flight auto-save.
      discardDebouncedSave();
      await saveExplicit(next);
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
      completed = true; // authoritative: status/live_state/completed_at are persisted now
      // Fix 1 — forward participant sync. Now that the tournament is COMPLETED, upsert the
      // durable tournament_players rows for any TD-added singles that only ever lived in
      // chip_entries, so they don't vanish from completed history/results/reviews (the
      // recurrence the G4 backfill only repaired historically). Idempotent + manager-gated.
      //
      // Completion has ALREADY persisted durably above, and the sync is safely re-runnable,
      // so a sync failure must NOT roll back or re-run completion — but it must NOT be
      // silently swallowed either. The service already returns success for the "RPC not yet
      // deployed" rollout case (a no-op that never hides a real error); any thrown error here
      // is a REAL failure. Record it (so the UI can offer a retry) and log it loudly; do not
      // rethrow, so a completed-but-unsynced tournament still finishes and can be repaired
      // via retryParticipantSync(). Teams are untouched by the RPC.
      try {
        await chipService.syncCompletedParticipants(id);
        setParticipantSyncError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[chip] participant sync FAILED for tournament ${id} — completion stands; ` +
            `tournament_players may be incomplete. Retry via retryParticipantSync().`,
          e,
        );
        setParticipantSyncError(msg);
      }
      await load({ silent: true });
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
    return completed;
  }, [chip, id, load, discardDebouncedSave, saveExplicit, requiresCloud]);

  // Fix 1 — retry the forward participant sync for an already-COMPLETED tournament whose
  // sync failed at finish (participantSyncError set). Does NOT touch completion/results —
  // it only re-runs the idempotent, manager-gated RPC, so repeated taps are safe and never
  // duplicate rows or re-complete the tournament. Clears the error on success and reloads so
  // the roster reflects the now-synced participants. Returns true on success.
  const retryParticipantSync = useCallback(async (): Promise<boolean> => {
    if (recoveryLockRef.current.blocks("sync participants") || requiresCloud("sync participants")) return false;
    try {
      await chipService.syncCompletedParticipants(id);
      setParticipantSyncError(null);
      await load({ silent: true });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[chip] participant sync retry FAILED for tournament ${id}:`, e);
      setParticipantSyncError(msg);
      return false;
    }
  }, [id, load, requiresCloud]);

  // Re-open a finished tournament back to Live (undo completion, e.g. it was
  // ended by mistake). Clears the decided-winner flags so play can continue,
  // deletes the persisted placements, and flips live_state back to in_progress.
  // Tables/queue are preserved — reshuffle to re-seat if it had crowned a winner.
  // Returns true when the tournament was reopened to Live so the caller can immediately
  // sync host UI (header badge / phase) back to Running. False = reopen threw.
  const reopen = useCallback(async (): Promise<boolean> => {
    if (recoveryLockRef.current.blocks("reopen the tournament") || requiresCloud("reopen the tournament")) return false;
    if (chip) {
      const next = { ...chip, winnerId: null, finishedAt: null };
      discardDebouncedSave();
      await saveExplicit(next);
    }
    try {
      await chipService.clearResults(id);
    } catch (e) {
      console.warn("chip_results clear skipped:", e);
    }
    try {
      // Canonical reopen: clears status/live_state/completed_at together so it leaves
      // the Completed list cleanly (mirror of tournamentService.completeTournament).
      await tournamentService.reopenTournament(id);
    } catch (e) {
      console.error(`[chip] reopen FAILED for tournament ${id}:`, e);
      await load({ silent: true }); // resync to server truth (stays Completed)
      return false;
    }
    await load({ silent: true });
    return true;
  }, [chip, id, load, discardDebouncedSave, saveExplicit, requiresCloud]);

  // ── Approve a self-service registration (TD confirms Fargo) ────────────────────
  // Writes the confirmed Fargo to the player's profile (verified), snapshots it on
  // the registration, and flips it to approved — then reloads so the Players list
  // reflects the new verified state.
  const approveRegistration = useCallback(
    async (registrationId: number, fargo: number) => {
      if (rosterLocked()) return;
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
        await load({ silent: true }); // revert to server truth on failure
      }
    },
    [update, load, rosterLocked],
  );

  // TD confirms a team member's Fargo (verified profile Fargo + event snapshot).
  const confirmTeamMemberFargo = useCallback(
    async (memberId: number, fargo: number) => {
      if (rosterLocked()) return;
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
        await load({ silent: true }); // revert to server truth on failure
      }
    },
    [update, load, rosterLocked],
  );

  // TD/admin unlocks a locked team so the captain can change the partner.
  const unlockTeam = useCallback(
    async (teamId: number) => {
      if (rosterLocked()) return;
      await teamService.unlockTeam(teamId);
      await load({ silent: true });
    },
    [load, rosterLocked],
  );

  // TD approves / un-approves a team (a step after Fargo verification). Optimistic
  // so the card flips approved → "Check In" in place instead of reloading the page.
  const approveTeam = useCallback(
    async (teamId: number, approved: boolean) => {
      if (rosterLocked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.teamId === teamId ? { ...e, teamApproved: approved } : e,
        ),
      }));
      try {
        await teamService.setTeamApproved(teamId, approved);
      } catch {
        await load({ silent: true }); // revert to server truth on failure
      }
    },
    [update, load, rosterLocked],
  );

  // TD manual chip override for a team (null = auto from the chart).
  const setTeamChips = useCallback(
    async (teamId: number, chips: number | null) => {
      if (rosterLocked()) return;
      await teamService.setTeamChips(teamId, chips);
      await load({ silent: true });
    },
    [load, rosterLocked],
  );

  // TD sets which side pots a team has entered (full replacement list). Optimistic
  // local update so tapping a checkbox doesn't blank + reload the whole page —
  // only reload from the server if the write fails.
  const setTeamSidePots = useCallback(
    async (teamId: number, pots: string[]) => {
      if (rosterLocked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.teamId === teamId ? { ...e, paidSidePots: pots } : e,
        ),
      }));
      try {
        await teamService.setTeamSidePots(teamId, pots);
      } catch {
        await load({ silent: true });
      }
    },
    [update, load, rosterLocked],
  );

  // TD sets which side pots a SINGLES entry has entered (full replacement list). Mirrors
  // setTeamSidePots: optimistic local update, then a TARGETED immediate write to that one
  // chip_entries row so the membership persists reliably — not only via the debounced
  // whole-blob save (which a background refetch could otherwise pre-empt). A brand-new,
  // not-yet-saved entry matches 0 rows in the targeted write and is inserted by the
  // whole-blob save instead; on failure we reconcile from the server.
  const setEntrySidePots = useCallback(
    async (entryId: string, pots: string[]) => {
      if (rosterLocked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) =>
          e.id === entryId ? { ...e, paidSidePots: pots } : e,
        ),
      }));
      try {
        await chipService.setEntrySidePots(id, entryId, pots);
      } catch {
        await load({ silent: true });
      }
    },
    [update, load, id, rosterLocked],
  );

  // TD checks a team in / out. Persisted server-side (optimistic locally) so it
  // survives roster reloads — previously local-only, so adding another team (a
  // reload) reset every team's check-in.
  const setTeamCheckedIn = useCallback(
    async (teamId: number, checkedIn: boolean) => {
      if (rosterLocked()) return;
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
        await load({ silent: true });
        throw err;
      }
    },
    [update, load, rosterLocked],
  );

  // Self-registered SINGLES live in tournament_players (projected via regToEntry), so
  // check-in must persist there — a local chip_entries flag would not be saved. Undo
  // reverts to the approved state. Optimistic + rethrow-on-failure like the team path.
  const checkInRegistration = useCallback(
    async (registrationId: number, checkedIn: boolean) => {
      if (rosterLocked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.regId === registrationId ? { ...e, checkedIn } : e)),
      }));
      try {
        if (checkedIn) await registrationService.checkIn(registrationId);
        else await registrationService.approve(registrationId);
        await load({ silent: true });
      } catch (err) {
        await load({ silent: true });
        throw err;
      }
    },
    [update, load, rosterLocked],
  );

  // TD removes a self-registered player from the tournament (tournament_players): cancel
  // the registration so it stops projecting into the chip roster (load filters cancelled).
  const cancelRegistration = useCallback(
    async (registrationId: number) => {
      if (rosterLocked()) return;
      update((c) => ({ ...c, entries: c.entries.filter((e) => e.regId !== registrationId) }));
      try {
        await registrationService.markCancelled(registrationId);
        await load({ silent: true });
      } catch (err) {
        await load({ silent: true });
        throw err;
      }
    },
    [update, load, rosterLocked],
  );

  // Unified lifecycle write for a self-registered SINGLES entry (tournament_players):
  // sets entry-fee paid AND the Ready-derived status in ONE update (mirrors elim's
  // handleReady). ready=true → status checked_in (in the field); ready=false → approved
  // (Registered). Optimistic + rethrow-on-failure so the card can retry.
  const setRegistrationReady = useCallback(
    async (registrationId: number, opts: { paid: boolean; ready: boolean }) => {
      if (rosterLocked()) return;
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
        await load({ silent: true });
      } catch (err) {
        await load({ silent: true });
        throw err;
      }
    },
    [update, load, rosterLocked],
  );

  // TD marks a team paid / unpaid (persisted, survives roster reloads).
  const setTeamPaid = useCallback(
    async (teamId: number, paid: boolean) => {
      if (rosterLocked()) return;
      update((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.teamId === teamId ? { ...e, paid } : e)),
      }));
      try {
        await teamService.setTeamPaid(teamId, paid);
      } catch {
        await load({ silent: true });
      }
    },
    [update, load, rosterLocked],
  );

  // ── Fargo-cap override writes (per source) ────────────────────────────────────
  // Doubles team override (tournament_teams via RPC; overridden_by stamped server-side).
  const setTeamFargoOverride = useCallback(
    async (teamId: number, on: boolean, snap: OverrideSnap) => {
      if (rosterLocked()) return;
      update((c) => ({ ...c, entries: c.entries.map((e) => (e.teamId === teamId ? { ...e, ...overrideFields(on, snap) } : e)) }));
      try {
        await teamService.setTeamFargoOverride(teamId, on, { cap: snap.cap, rating: snap.rating, reason: snap.reason, notes: snap.notes });
      } catch {
        await load({ silent: true });
      }
    },
    [update, load, rosterLocked],
  );

  // Self-registered singles override (tournament_players direct update).
  const setRegistrationFargoOverride = useCallback(
    async (registrationId: number, on: boolean, snap: OverrideSnap) => {
      if (rosterLocked()) return;
      update((c) => ({ ...c, entries: c.entries.map((e) => (e.regId === registrationId ? { ...e, ...overrideFields(on, snap) } : e)) }));
      try {
        await registrationService.setFargoOverride(registrationId, on, { cap: snap.cap, rating: snap.rating, reason: snap.reason, notes: snap.notes, overriddenBy: snap.overriddenBy });
        await load({ silent: true });
      } catch (err) {
        await load({ silent: true });
        throw err;
      }
    },
    [update, load, rosterLocked],
  );

  // Append an audit-log event (e.g. Fargo-cap override) to chip_events.
  const logEvent = useCallback(
    (type: string, text: string, payload?: Record<string, unknown> | null) =>
      recoveryLockRef.current.blocks("log an event") || requiresCloud("log an audit event")
        ? Promise.resolve()
        : chipService.logEvent(id, type, text, payload),
    [id, requiresCloud],
  );

  // TD removes one player from a team.
  const removeTeamMember = useCallback(
    async (memberId: number) => {
      if (rosterLocked()) return;
      await teamService.removeTeamMember(memberId);
      await load({ silent: true });
    },
    [load, rosterLocked],
  );

  // TD creates a real team (chosen player = captain). Returns team id.
  const tdCreateTeam = useCallback(
    async (captainPlayerId: number, fargo: number | null) => {
      if (rosterLocked()) return null;
      const teamId = await teamService.tdCreateTeam(id, captainPlayerId, fargo);
      await load({ silent: true });
      return teamId;
    },
    [id, load, rosterLocked],
  );

  // TD adds a real (verifiable) partner to a team.
  const addTeamMember = useCallback(
    async (teamId: number, playerId: number, fargo: number | null) => {
      if (rosterLocked()) return;
      await teamService.addTeamMember(teamId, playerId, fargo);
      await load({ silent: true });
    },
    [load, rosterLocked],
  );

  // Lazy read of a team's shareable invite token (for the "Invite Partner"
  // share/copy/text actions). Read-only; the roster RPC omits the token.
  const getInviteToken = useCallback(
    (teamId: number) => teamService.getTeamInviteToken(teamId),
    [],
  );

  // ── Review & Start ────────────────────────────────────────────────────────────
  // Returns true only when the engine start AND the persisted start both succeed, so
  // the caller can navigate to Live ONLY after a confirmed start (never optimistically).
  const start = useCallback(async (): Promise<boolean> => {
    if (recoveryLockRef.current.blocks("start the tournament") || requiresCloud("start the tournament")) return false;
    if (!chip) return false;
    // Stale-schedule gate (shared helper — same rule as every other start path): a
    // not-yet-started tournament whose saved date/time is already in the past is never
    // started. Authoritative block (returns false → chipService.start is never called);
    // the user-facing message is shown by the caller (doStart) so we don't trip the
    // screen's full-screen vm.error takeover, which is reserved for load failures.
    if (scheduleStaleError(tournament)) return false;
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
      // Materialize ONLY the field entrants (readyForField). Non-field entries keep their
      // existing form — a projected registration stays projected (fromRegistration:true →
      // not written to chip_entries, remains a tournament_players row), an owned row keeps
      // its row — and both carry checkedIn:false so the engine's `enteredField` guard keeps
      // them out of the live field, standings, eliminations, and placements. Non-destructive.
      const owned: ChipState = {
        ...chip,
        entries: chip.entries.map((e) => {
          const inField = readyForField(e);
          return {
            ...e,
            ...(inField && e.fromRegistration
              ? { fromRegistration: false, regId: null, regStatus: null, fargoStatus: null }
              : {}),
            checkedIn: inField,
          };
        }),
      };
      const started = startChipTournament(owned);
      loadGuardRef.current.markLocalChange();
      setChip(started);
      // Same writes as chipService.start, but the snapshot goes through the serialized queue.
      discardDebouncedSave();
      await saveExplicit(started);
      await chipService.markStarted(id);
      await load({ silent: true });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Failed to start tournament.");
      return false;
    } finally {
      setStarting(false);
    }
  }, [chip, id, load, tournament, discardDebouncedSave, saveExplicit, requiresCloud]);

  const liveState = tournament?.live_state ?? "not_started";
  const isLive = liveState === "in_progress";
  // Opening kickoff control: "all" (nothing started → Start All), "remaining" (some
  // opening tables live, others still waiting → Start Remaining), or null (no opening
  // table waiting → the control reverts to Shuffle Mode).
  const startAllMode = chip ? startAllState(chip) : null;
  const isFinished = liveState === "finished" || tournament?.status === "completed";
  const phase: "setup" | "live" | "results" = isFinished
    ? "results"
    : isLive
      ? "live"
      : "setup";

  return {
    loading,
    refreshing,
    error,
    // Strict-CAS conflict notice (Phase G3): true when another director's change rejected
    // this action; authoritative state was reloaded and the action was NOT applied.
    casConflict,
    acknowledgeCasConflict: () => setCasConflict(false),
    // Auto-save failure notice (shared): true when the newest snapshot couldn't be saved
    // after every retry. Local state is kept; the screen offers Retry / Reload from server.
    saveError,
    acknowledgeSaveError: () => setSaveError(false),
    retrySave,
    discardUnsavedAndReload,
    // Web local backup / recovery (chip.local-recovery.ts). recoveryReadOnly = viewing a
    // local backup: every mutation is refused (recoveryBlocked reports the last attempt).
    recovery,
    recoveryReadOnly: recovery.status === "viewing" || recovery.status === "conflict",
    lastLocalBackupAt,
    divergentBackup,
    dismissDivergentBackup: () => {
      setDivergentBackup(null);
      setDivergentCanSync(false);
    },
    recoveryBlocked,
    acknowledgeRecoveryBlocked: () => setRecoveryBlocked(null),
    // true (and the read-only notice shown) when a mutating UI flow must not open.
    guardRecovery: (action: string) => recoveryLockRef.current.blocks(action),
    // Web offline controller (Phase 2).
    offlineMode,
    offlineSession,
    offlineConflictKept,
    unsyncedCount,
    localSaveFailed,
    retryConnection: () => void attemptReconnect(),
    retryLocalSave,
    keepOfflineCopy,
    resumeOfflineControl,
    syncRecoveredOffline,
    canResumeOffline:
      recovery.status === "available" || recovery.status === "viewing" ? canResumeOffline(recovery.snapshot) : false,
    canSyncRecoveredOffline:
      divergentCanSync && !!divergentBackup?.offlineSession && offlineMode === "online" && canResumeOffline(divergentBackup),
    // Web status strip: is the on-screen state in the cloud yet?
    cloudSync: (!chip
      ? "synced"
      : boardSource === "none" && offlineMode === "online" && recovery.status === "none"
        ? "view_only"
        : chip === cloudSavedChip
          ? "synced"
          : saveFailing
            ? "not_synced"
            : "syncing") as "synced" | "syncing" | "not_synced" | "view_only",
    openLocalCopy,
    retryCloud,
    switchToCloudVersion,
    keepLocalBackup,
    viewDivergentBackup,
    starting,
    finishing,
    isLive,
    isFinished,
    startAllMode,
    tournament,
    chip,
    // Fix 2 — durable chip_results (authoritative placement order once completed; empty
    // otherwise). The completed admin standings/recap/payout read from this.
    results,
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
    startShuffleCycle,
    startShuffle,
    cancelReshuffle,
    closeTables,
    reactivateTable,
    resetTableTimer,
    clearTable,
    removeFromTable,
    returnActiveMatchesToQueue,
    startPendingMatch,
    startAllMatches,
    setTableLocked,
    setAllTablesLocked,
    assignNextTeam,
    assignSpecificTeam,
    moveTable,
    adjustChips,
    forfeitEntry,
    forfeitMatch,
    reorderQueue,
    buyBack,
    restoreEntry,
    endTournament,
    // Fix 1 — forward participant-sync status + manual retry (see endTournament). Non-null
    // error means the completed tournament's tournament_players rows may be incomplete.
    participantSyncError,
    retryParticipantSync,
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
    setEntrySidePots,
    setTeamCheckedIn,
    checkInRegistration,
    setTeamPaid,
    removeTeamMember,
    tdCreateTeam,
    addTeamMember,
    getInviteToken,
  };
};
