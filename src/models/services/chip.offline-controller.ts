// src/models/services/chip.offline-controller.ts
//
// WEB-ONLY Chip "offline controller" (Phase 2). Supabase-free so it is unit-testable.
//
// The ONE browser that was already running a live Chip tournament keeps running it when the
// cloud (venue internet / Supabase) drops: every action still goes through the existing
// engine + viewmodel, every resulting state is persisted to IndexedDB (chip.local-recovery),
// and NO cloud write is attempted until connectivity returns and the reconnect check below
// proves the cloud has not moved on. Single-controller only — no multi-device merge.
//
// Modes (the viewmodel holds the current one):
//   online             normal operation (save queue live)
//   offline            cloud unavailable; actions allowed; saving locally; queue PAUSED
//   reconnecting       cloud looks reachable; loading + comparing (actions briefly held)
//   syncing            cloud unchanged → pushing the latest local snapshot once, then verifying
//   conflict           cloud changed while offline (or verification failed) → local copy
//                      protected, read-only; only "Use Cloud Version" re-enables writes
//   local_save_failed  offline AND the IndexedDB write failed → actions blocked until a
//                      local save succeeds (neither cloud nor device storage is protecting it)
//
// Transitions:
//   online  --outage (browser offline / outage save failure / outage load failure)--> offline
//   offline --local write failed--> local_save_failed --local write ok--> offline
//   offline --online event / probe ok / Retry--> reconnecting
//   reconnecting --cloud load failed--> offline            (session + base PRESERVED)
//   reconnecting --cloud changed--> conflict
//   reconnecting --cloud unchanged--> syncing
//   syncing --save or verify-load failed (outage)--> offline (session kept; sent fp recorded)
//   syncing --verified--> online (session cleared, snapshot cloud-confirmed)
//   syncing --verify mismatch--> conflict
//   conflict --Use Cloud Version--> online (offline copy archived locally, pending dropped)

import { describeError } from "./chip.persist";
import { chipRecoveryFingerprint, isCloudUnavailableError } from "./chip.local-recovery";
import { ChipState } from "../types/chip.types";

export type ChipOfflineMode =
  | "online"
  | "offline"
  | "reconnecting"
  | "syncing"
  | "conflict"
  | "local_save_failed";

// Modes in which the save queue must stay paused (no cloud write may start).
export const offlineModeSuppressesCloudWrites = (mode: ChipOfflineMode): boolean => mode !== "online";
// Modes in which tournament actions are refused (the viewmodel's read-only lock).
export const offlineModeBlocksActions = (mode: ChipOfflineMode): boolean =>
  mode === "reconnecting" || mode === "syncing" || mode === "conflict" || mode === "local_save_failed";

// One offline session: captured ONCE when the controller goes offline and preserved across
// connectivity flaps until the offline changes are synced (verified) or explicitly discarded.
export interface ChipOfflineSession {
  tournamentId: number;
  ownerUserId: string | null;
  startedAt: string;
  // The cloud state this controller last KNEW the cloud held (confirmed save or load).
  baseCloudVersion: number | null;
  baseFingerprint: string | null;
  // Local generation at the transition.
  startLocalSeq: number;
  // Fingerprints of states this controller handed to a cloud save around/after the outage.
  // One of them may have landed with its response lost — finding it in the cloud is OUR
  // continuation, not another device's change.
  sentFingerprints: string[];
  // Local state changes not yet confirmed by the cloud.
  unsyncedCount: number;
  lastLocalSaveAt: string | null;
}

const SENT_FP_LIMIT = 30;

export const createOfflineSession = (args: {
  tournamentId: number;
  ownerUserId: string | null;
  baseCloudVersion: number | null;
  baseChip: ChipState | null;
  startLocalSeq: number;
  // Local changes already unconfirmed at the transition (e.g. the save that just failed).
  pendingUnsynced: number;
  sentFingerprints?: string[];
  now?: string;
}): ChipOfflineSession => ({
  tournamentId: args.tournamentId,
  ownerUserId: args.ownerUserId,
  startedAt: args.now ?? new Date().toISOString(),
  baseCloudVersion: args.baseCloudVersion,
  baseFingerprint: args.baseChip ? chipRecoveryFingerprint(args.baseChip) : null,
  startLocalSeq: args.startLocalSeq,
  sentFingerprints: (args.sentFingerprints ?? []).slice(-SENT_FP_LIMIT),
  unsyncedCount: Math.max(0, args.pendingUnsynced),
  lastLocalSaveAt: null,
});

export const noteSentFingerprint = (s: ChipOfflineSession, fp: string): ChipOfflineSession =>
  s.sentFingerprints.includes(fp) ? s : { ...s, sentFingerprints: [...s.sentFingerprints, fp].slice(-SENT_FP_LIMIT) };

export const noteLocalChange = (s: ChipOfflineSession): ChipOfflineSession => ({ ...s, unsyncedCount: s.unsyncedCount + 1 });

export const noteLocalSaved = (s: ChipOfflineSession, at: string): ChipOfflineSession => ({ ...s, lastLocalSaveAt: at });

// Validation / permission / constraint answers come from a REACHABLE server — never a reason
// to go offline (the existing save-failure handling applies).
const isServerRejection = (e: unknown): boolean => {
  const { code, status } = describeError(e);
  if (status != null && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
  if (!code) return false;
  return /^(22|23|42|P0|28)/.test(code) || /^PGRST(1|2|3)\d\d$/.test(code);
};

// Is this failure a genuine connectivity/backend outage?
export const isOutageError = (e: unknown, browserOnline?: boolean | null): boolean => {
  if (browserOnline === false) return true;
  if (isServerRejection(e)) return false;
  const { message, code, status } = describeError(e);
  if (status === 0 || status === 408 || status === 429 || (status != null && status >= 500)) return true;
  if (code && /^PGRST00\d$/.test(code)) return true;
  if (/failed to fetch|network|fetch failed|load failed|timed? ?out|timeout|econn|enotfound|offline|upstream|gateway|unavailable/i.test(message)) {
    return isCloudUnavailableError(e);
  }
  return false;
};

// Should a save-attempt failure switch the controller offline? Immediately when the browser
// reports offline; otherwise once the queue's bounded retries are exhausted on an outage error
// (one transient blip is absorbed by the retries and never flips the mode).
export const shouldEnterOfflineOnSaveFailure = (args: {
  error: unknown;
  attempt: number;
  maxAttempts: number;
  browserOnline: boolean | null;
}): boolean =>
  isOutageError(args.error, args.browserOnline) && (args.browserOnline === false || args.attempt >= args.maxAttempts);

export type ChipReconnectClass = "unchanged" | "changed";

// Did the cloud move on while this controller was offline? Unchanged = the cloud still holds
// the base state, or one of this controller's own sent states (a save that landed with its
// response lost). Anything else was written by someone else → conflict, never an overwrite.
export const classifyCloudOnReconnect = (cloudChip: ChipState, session: ChipOfflineSession): ChipReconnectClass => {
  const fp = chipRecoveryFingerprint(cloudChip);
  return fp === session.baseFingerprint || session.sentFingerprints.includes(fp) ? "unchanged" : "changed";
};

// The slice of the Chip save queue the reconnect path drives (chip.save-queue.ts).
export interface ChipOfflineQueueControl<R> {
  pause(): Promise<void>;
  resume(): void;
  dropUnsaved(): void;
  saveNow(state: ChipState): Promise<R>;
}

// Final optimistic precondition immediately before the push (chipService.claimChipVersion):
// "claimed"     — atomically bumped chip_config.version from the compared version (nobody
//                 saved since the comparison);
// "changed"     — the version moved → someone saved since the comparison → abort;
// "unsupported" — no version column (migration absent) → rely on the fingerprint re-check.
export type ChipVersionClaim = "claimed" | "changed" | "unsupported";

export type ChipConflictReason =
  | "cloud_changed" // cloud differed from the session base at comparison
  | "precondition_failed" // version moved between comparison and push (claim refused)
  | "changed_before_push" // cloud content changed between comparison and push (re-check)
  | "verify_mismatch"; // after the push the cloud does not equal what was pushed

export type ChipReconnectOutcome<B> =
  | { outcome: "still_offline"; error: unknown }
  | { outcome: "conflict"; bundle: B; reason: ChipConflictReason }
  | { outcome: "synced"; bundle: B; result: unknown };

// Reconnect, SAFETY FIRST. Strict order:
//   1. queue stays paused (pause() also waits out any attempt already in flight);
//   2. load the authoritative cloud state (+ its chip_config.version);
//   3. classify vs the session base → changed = conflict (queue stays paused, nothing pushed);
//   4. FINAL PRECONDITION, immediately before the push:
//      a. claim the version: an atomic conditional UPDATE version = v+1 WHERE version = v
//         (v = the version read in step 2). Any Chip save that COMPLETED since step 2 bumped
//         v → the claim matches no row → abort (conflict). After a successful claim, any
//         other device's later save sees a moved version (soft-CAS conflict on its side);
//      b. re-load and require the cloud content to still equal step 2's (catches a save that
//         had written rows but not yet bumped the version, and the no-version fallback);
//   5. unchanged → drop every held intermediate snapshot, resume, and save the LATEST local
//      snapshot exactly once through the existing queue (idempotent whole-state save: events
//      by id, chips/queue/tables as absolute state — nothing is replayed);
//   6. re-load the cloud and verify it now equals that snapshot.
// Any outage during 2/4/5/6 → still_offline with the queue paused again (the caller keeps the
// session; the pushed state's fingerprint is already recorded as "sent").
// NOT mathematically atomic without the chip_apply RPC: another device's save that is
// mid-flight across steps 4b→5 (multi-statement, non-transactional) can still interleave. The
// window is reduced to that overlap; step 6 then reports verify_mismatch unless ours landed
// entirely last.
export const reconnectOfflineController = async <B, R>(args: {
  session: ChipOfflineSession;
  queue: ChipOfflineQueueControl<R>;
  loadCloud: () => Promise<B>;
  cloudChipOf: (bundle: B) => ChipState;
  latestLocal: () => ChipState;
  // Atomic version claim (step 4a). Omitted → treated as "unsupported".
  claimVersion?: (bundle: B) => Promise<ChipVersionClaim>;
  // Called once the precondition passed, right before the push (e.g. adopt the claimed
  // version as the CAS baseline).
  beforePush?: (bundle: B, target: ChipState, claim: ChipVersionClaim) => void;
  // Called when the cloud was found unchanged (before the precondition) — UI "syncing".
  onUnchanged?: (bundle: B) => void;
}): Promise<ChipReconnectOutcome<B>> => {
  await args.queue.pause();
  let bundle: B;
  try {
    bundle = await args.loadCloud();
  } catch (error) {
    return { outcome: "still_offline", error };
  }
  if (classifyCloudOnReconnect(args.cloudChipOf(bundle), args.session) === "changed") {
    return { outcome: "conflict", bundle, reason: "cloud_changed" };
  }
  args.onUnchanged?.(bundle);
  // 4a. atomic version precondition
  let claim: ChipVersionClaim = "unsupported";
  if (args.claimVersion) {
    try {
      claim = await args.claimVersion(bundle);
    } catch (error) {
      return { outcome: "still_offline", error };
    }
    if (claim === "changed") return { outcome: "conflict", bundle, reason: "precondition_failed" };
  }
  // 4b. content re-check right before the push
  let recheck: B;
  try {
    recheck = await args.loadCloud();
  } catch (error) {
    return { outcome: "still_offline", error };
  }
  if (chipRecoveryFingerprint(args.cloudChipOf(recheck)) !== chipRecoveryFingerprint(args.cloudChipOf(bundle))) {
    return { outcome: "conflict", bundle: recheck, reason: "changed_before_push" };
  }
  const target = args.latestLocal();
  args.beforePush?.(recheck, target, claim);
  args.queue.dropUnsaved(); // intermediate held snapshots are superseded by `target`
  args.queue.resume();
  let result: R;
  try {
    result = await args.queue.saveNow(target);
  } catch (error) {
    args.queue.dropUnsaved();
    await args.queue.pause();
    return { outcome: "still_offline", error };
  }
  let verify: B;
  try {
    verify = await args.loadCloud();
  } catch (error) {
    await args.queue.pause();
    return { outcome: "still_offline", error };
  }
  if (chipRecoveryFingerprint(args.cloudChipOf(verify)) !== chipRecoveryFingerprint(target)) {
    await args.queue.pause();
    return { outcome: "conflict", bundle: verify, reason: "verify_mismatch" };
  }
  return { outcome: "synced", bundle: verify, result };
};

// Offline-session analytics record (error_logged, entity tournament). No player data.
export const buildOfflineSessionLog = (args: {
  session: ChipOfflineSession;
  reconnectedAt: string;
  outcome: "synced" | "conflict" | "discarded";
  platform?: string;
}): Record<string, unknown> => ({
  kind: "chip_offline_session",
  tournament_id: args.session.tournamentId,
  offline_started_at: args.session.startedAt,
  reconnected_at: args.reconnectedAt,
  unsynced_changes: args.session.unsyncedCount,
  sync_succeeded: args.outcome === "synced",
  conflict_detected: args.outcome === "conflict",
  outcome: args.outcome,
  platform: args.platform ?? null,
});

// Browser close while offline → reopen: may this browser RESUME the offline controller for a
// backup? Only the same owner (the Supabase session stored on this browser) with an intact
// offline session; otherwise the backup stays read-only (Phase 1).
export const canResumeOfflineSession = (args: {
  snapshotOwnerUserId: string | null;
  storedUserId: string | null;
  session: ChipOfflineSession | null | undefined;
  tournamentId: number;
}): boolean =>
  !!args.session &&
  args.session.tournamentId === args.tournamentId &&
  !!args.storedUserId &&
  args.snapshotOwnerUserId === args.storedUserId &&
  (args.session.ownerUserId == null || args.session.ownerUserId === args.storedUserId);
