// src/viewmodels/hooks/use.elim.offline.ts
// Elimination offline local recovery for the Manage hub (rules: src/utils/elim-local-recovery.ts).
//
//   • Online: every NEW cloud revision of a drawn Single / Double bracket is copied to this device
//     (one record per tournament + account). Only cloud data is ever stored.
//   • Offline (web: the browser says so · native: the tournament fetch fails with a network
//     error): the screen HOLDS the last synced state — read-only — instead of going blank. If the
//     in-memory copy is gone (e.g. the screen was reopened later) the validated local record is used.
//   • Reconnect: the first successful cloud fetch is compared with the held revision —
//       same → Synced (hold released) · different → "This tournament changed while you were
//       offline." and the TD taps Load Latest. A fetch that still fails → stay offline, keep the copy.
//   • While offline or held, every live write is refused up front (nothing is queued or replayed).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { elimLocalRecoveryService } from "../../models/services/elim-local-recovery.service";
import { useAuthStore } from "../stores/auth.store";
import { ConnectionRequiredError, toConnectionAwareError } from "../../utils/connection-required";
import {
  ELIM_HELD_WRITE_TEXT,
  ELIM_OFFLINE_WRITE_TEXT,
  ElimLocalRecord,
  buildElimLocalRecord,
  elimReconnectStatus,
  isElimLocalEligible,
} from "../../utils/elim-local-recovery";

const isWeb = Platform.OS === "web";
const browserOffline = (): boolean => isWeb && typeof navigator !== "undefined" && navigator.onLine === false;
const SYNCED_NOTE_MS = 5000;
const HOLD_RETRY_MS = 15_000;

type Row = Record<string, unknown>;

interface Held {
  tournament: Row;
  tables: unknown[] | null;
  revision: number;
  since: number; // when the hold started (a cloud fetch newer than this ends it)
  source: "session" | "local";
}

export type ElimOfflineStatus = "cloud" | "offline" | "changed";

export function useElimOffline(args: {
  tournamentId?: number;
  cloud: Row | null | undefined;
  cloudUpdatedAt: number;
  cloudError: unknown;
  cloudErrorUpdatedAt: number;
  tables: unknown[] | null | undefined;
  refetchAll: () => void;
}) {
  const { tournamentId, cloud, cloudUpdatedAt, cloudError, cloudErrorUpdatedAt, tables, refetchAll } = args;
  const ownerId = useAuthStore((s) => s.profile?.id ?? null);

  // ── connectivity ──────────────────────────────────────────────────────────────────────
  const [webOffline, setWebOffline] = useState(browserOffline);
  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    const sync = () => setWebOffline(browserOffline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const netFail =
    !!cloudError && toConnectionAwareError(cloudError) instanceof ConnectionRequiredError && cloudErrorUpdatedAt >= cloudUpdatedAt;
  const offline = webOffline || netFail;

  // ── the device copy (keyed by tournament + account: a switch never shows another's copy) ──
  const localKey = tournamentId && ownerId ? `${ownerId}:${tournamentId}` : null;
  const [localState, setLocalState] = useState<{ key: string; rec: ElimLocalRecord | null } | null>(null);
  const local = localState && localState.key === localKey ? localState.rec : null;
  useEffect(() => {
    if (!tournamentId || !ownerId) return;
    const key = `${ownerId}:${tournamentId}`;
    let alive = true;
    elimLocalRecoveryService.read(tournamentId, ownerId).then((rec) => {
      if (!alive) return;
      // A newer copy saved meanwhile wins over the (older) one just read.
      setLocalState((cur) => (cur?.key === key && cur.rec && (!rec || cur.rec.revision >= rec.revision) ? cur : { key, rec }));
    });
    return () => {
      alive = false;
    };
  }, [tournamentId, ownerId]);

  // The hold — keyed by tournament so switching tournaments drops it without an effect.
  const [heldState, setHeld] = useState<(Held & { tid: number | undefined; changed: boolean }) | null>(null);
  const held = heldState && heldState.tid === tournamentId ? heldState : null;
  const changed = !!held?.changed;
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  // Save each new cloud revision (never while holding — the hold is not cloud-current).
  const savedRef = useRef<string>("");
  const tablesSig = useMemo(
    () => (Array.isArray(tables) ? tables.map((t) => JSON.stringify(t)).join("|").length + ":" + tables.length : "-"),
    [tables],
  );
  useEffect(() => {
    if (held || offline || !ownerId || !isElimLocalEligible(cloud)) return;
    const sig = `${ownerId}:${cloud.id}:${cloud.live_revision}:${cloud.status}:${cloud.live_state}:${tablesSig}`;
    if (savedRef.current === sig) return;
    savedRef.current = sig;
    const rec = buildElimLocalRecord(cloud, tables ?? null, ownerId);
    if (!rec) return;
    elimLocalRecoveryService.save(rec).then((ok) => {
      if (ok) setLocalState({ key: `${ownerId}:${rec.tournamentId}`, rec });
    });
  }, [cloud, tables, tablesSig, held, offline, ownerId]);

  /* eslint-disable react-hooks/set-state-in-effect -- the hold follows EXTERNAL state (browser
     connectivity, fetch results, device storage); these transitions can only be observed here. */
  // Enter the hold: offline (any data we can show), or a cold load that failed with a local copy.
  useEffect(() => {
    if (held) return;
    const now = Date.now();
    if (offline && isElimLocalEligible(cloud)) {
      setHeld({ tid: tournamentId, changed: false, tournament: cloud, tables: tables ?? null, revision: cloud.live_revision as number, since: now, source: "session" });
    } else if (!cloud && local && (offline || !!cloudError)) {
      setHeld({ tid: tournamentId, changed: false, tournament: local.tournament, tables: local.tables, revision: local.revision, since: now, source: "local" });
    }
  }, [held, offline, cloud, tables, local, cloudError, tournamentId]);

  // Reconnect: the first cloud fetch newer than the hold decides Synced vs Changed.
  useEffect(() => {
    if (!held || held.changed || offline || !cloud || cloudUpdatedAt <= held.since) return;
    if (elimReconnectStatus(held.revision, cloud.live_revision as number) === "synced") {
      setHeld(null);
      setSyncedAt(Date.now());
    } else {
      setHeld({ ...held, changed: true });
    }
  }, [held, offline, cloud, cloudUpdatedAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Back online with a held copy → fetch now (polling may be off, and cached data isn't stale yet).
  const refetchRef = useRef(refetchAll);
  useEffect(() => {
    refetchRef.current = refetchAll;
  });
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline && held) refetchRef.current();
    wasOffline.current = offline;
  }, [offline, held]);

  // While holding (and not yet known to be replaced), keep trying the cloud at a slow pace.
  const holding = !!held && !changed;
  useEffect(() => {
    if (!holding) return;
    const t = setInterval(() => refetchRef.current(), HOLD_RETRY_MS);
    return () => clearInterval(t);
  }, [holding]);

  useEffect(() => {
    if (syncedAt == null) return;
    const t = setTimeout(() => setSyncedAt(null), SYNCED_NOTE_MS);
    return () => clearTimeout(t);
  }, [syncedAt]);

  // Load Latest: drop the held copy and show the cloud (never pushes anything local).
  const loadLatest = useCallback(() => {
    setHeld(null);
    refetchRef.current();
  }, []);

  const active = isElimLocalEligible(held?.tournament ?? cloud);
  const status: ElimOfflineStatus = held ? (changed ? "changed" : "offline") : "cloud";
  const writeBlockedText: string | null = !active
    ? null
    : changed
      ? ELIM_HELD_WRITE_TEXT
      : held || offline
        ? ELIM_OFFLINE_WRITE_TEXT
        : null;

  return {
    active,
    offline,
    status,
    justSynced: syncedAt != null && !held,
    shownRevision: held?.revision ?? ((cloud?.live_revision as number | undefined) ?? null),
    cloudRevision: held && !changed ? null : ((cloud?.live_revision as number | undefined) ?? null),
    heldFrom: held?.source ?? null,
    local: local ? { revision: local.revision, savedAt: local.savedAt } : null,
    display: held?.tournament ?? null,
    displayTables: held ? held.tables ?? [] : null,
    writeBlockedText,
    loadLatest,
  };
}
