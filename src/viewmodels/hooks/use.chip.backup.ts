// src/viewmodels/hooks/use.chip.backup.ts
// Chip Tournament → Actions → "Download Tournament Backup": an on-demand printable operating
// packet (src/utils/chip-backup-pdf.ts).
//
//   • Online: re-reads the tournament from the cloud at tap time (chipService.load — selects +
//     the read-only roster RPC) and applies the same pure board repair the Chip screen shows.
//   • Offline: ONLY this device's validated local recovery snapshot (web — the Chip offline
//     controller's IndexedDB copy), labelled "OFFLINE BACKUP · Last synced …". Native keeps no
//     Chip copy, so offline there is disabled with a reason. Never labelled current.
//   • READ / EXPORT ONLY: no chip_config.version change, no save, no restore point, no event,
//     no queue / table / match change, nothing uploaded. The only write is the local
//     "last backup" timestamp on this device.

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { chipService } from "../../models/services/chip.service";
import { getChipLocalRecovery } from "../../models/services/chip.local-recovery";
import { cloudStatusService } from "../../models/services/cloud.status.service";
import { healLoadedChip } from "../../models/services/chip.load-heal";
import { reconcileCompleted } from "../../models/services/chip.engine";
import { backupAgeText, backupHistoryService } from "../../models/services/backup-history.service";
import { ChipState } from "../../models/types/chip.types";
import {
  CHIP_BACKUP_NO_LOCAL_NATIVE,
  CHIP_BACKUP_NO_LOCAL_WEB,
  ChipBackupMode,
  buildChipBackupPdf,
  chipBackupAvailability,
} from "../../utils/chip-backup-pdf";
import { ConnectionRequiredError, toConnectionAwareError } from "../../utils/connection-required";
import { savePdfFile, SavePdfResult } from "../../utils/save-pdf-file";

const browserOffline = () => Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false;

type Source = {
  name: string;
  date: string | null;
  chip: ChipState;
  version: number | null;
  mode: ChipBackupMode;
  syncedAt: Date | null;
  unsynced: boolean;
};

export function useChipBackup(tournamentId: number | null | undefined, opts: { offline?: boolean; ownerUserId?: string | null } = {}) {
  const [busy, setBusy] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const offline = !!opts.offline || browserOffline();
  const owner = opts.ownerUserId ?? cloudStatusService.getStoredAuthUserId();

  const readLocal = useCallback(async (): Promise<Source | null> => {
    const store = getChipLocalRecovery();
    if (!store || !tournamentId) return null;
    const snap = await store.getLatestSnapshot(tournamentId, owner);
    if (!snap) return null;
    return {
      name: snap.tournament?.name ?? "Tournament",
      date: snap.tournament?.tournament_date ?? null,
      chip: snap.chip,
      version: snap.cloudVersion,
      mode: "offline",
      syncedAt: new Date(snap.savedAt),
      unsynced: !snap.cloudConfirmed || !!snap.offlineSession,
    };
  }, [tournamentId, owner]);

  useEffect(() => {
    let alive = true;
    if (tournamentId) backupHistoryService.get("chip", tournamentId).then((d) => alive && setLastAt(d));
    if (offline) readLocal().then((s) => alive && setHasLocal(!!s));
    return () => {
      alive = false;
    };
  }, [tournamentId, offline, readLocal]);

  const availability = chipBackupAvailability({ offline, hasLocal, native: Platform.OS !== "web" });

  const download = useCallback(async (): Promise<SavePdfResult> => {
    if (!tournamentId) return { ok: false, message: "This tournament hasn't loaded yet." };
    setBusy(true);
    try {
      let src: Source | null = null;
      if (!offline) {
        try {
          const b = await chipService.load(tournamentId);
          const finished = b.tournament.live_state === "finished" || b.tournament.status === "completed";
          src = {
            name: b.tournament.name ?? "Tournament",
            date: b.tournament.tournament_date ?? null,
            chip: finished ? reconcileCompleted(b.chip) : healLoadedChip(b.chip),
            version: b.version ?? null,
            mode: "latest",
            syncedAt: null,
            unsynced: false,
          };
        } catch (e) {
          if (!(toConnectionAwareError(e) instanceof ConnectionRequiredError)) throw e;
          src = await readLocal(); // the connection dropped since the button was shown
        }
      } else src = await readLocal();
      if (!src) return { ok: false, message: Platform.OS === "web" ? CHIP_BACKUP_NO_LOCAL_WEB : CHIP_BACKUP_NO_LOCAL_NATIVE };
      const pdf = buildChipBackupPdf({
        tournamentName: src.name,
        tournamentDate: src.date,
        chip: src.chip,
        version: src.version,
        mode: src.mode,
        generatedAt: new Date(),
        lastSyncedAt: src.syncedAt,
        unsyncedOfflineChanges: src.unsynced,
      });
      const r = await savePdfFile(pdf.bytes, pdf.fileName);
      if (r.ok) {
        const now = new Date();
        setLastAt(now);
        backupHistoryService.mark("chip", tournamentId, now);
      }
      return r;
    } catch (e) {
      if (toConnectionAwareError(e) instanceof ConnectionRequiredError)
        return { ok: false, message: "The connection dropped while loading the tournament. Try again." };
      return { ok: false, message: e instanceof Error && e.message ? e.message : "Couldn't create the tournament backup." };
    } finally {
      setBusy(false);
    }
  }, [tournamentId, offline, readLocal]);

  return { availability, busy, download, lastBackupText: backupAgeText(lastAt) };
}
