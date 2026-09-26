// src/viewmodels/hooks/use.chip.local.backup.ts
// Web-only: does this browser hold a local Chip backup for a tournament? Used by the Manage
// hub when its OWN tournament fetch fails (cloud unavailable) — the hub can't tell the format
// without the cloud row, so a local Chip backup routes it to the Chip screen's recovery prompt.
// "checking" while the IndexedDB read is in flight; false on native / when disabled.

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getChipLocalRecovery } from "../../models/services/chip.local-recovery";
import { cloudStatusService } from "../../models/services/cloud.status.service";

export const useChipLocalBackupExists = (
  tournamentId: number | null | undefined,
  enabled: boolean,
): boolean | "checking" => {
  const store = Platform.OS === "web" ? getChipLocalRecovery() : null;
  const active = enabled && !!store && !!tournamentId;
  const [found, setFound] = useState<{ tid: number; exists: boolean } | null>(null);
  useEffect(() => {
    if (!active || !store || !tournamentId) return;
    let alive = true;
    store
      .getLatestSnapshot(tournamentId, cloudStatusService.getStoredAuthUserId())
      .then((snap) => alive && setFound({ tid: tournamentId, exists: !!snap }))
      .catch(() => alive && setFound({ tid: tournamentId, exists: false }));
    return () => {
      alive = false;
    };
  }, [active, store, tournamentId]);
  if (!active) return false;
  if (!found || found.tid !== tournamentId) return "checking";
  return found.exists;
};
