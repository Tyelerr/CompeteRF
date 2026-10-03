// src/models/services/elim-local-recovery.service.ts
// Device storage for elimination offline local recovery (rules: src/utils/elim-local-recovery.ts).
// AsyncStorage = localStorage on web, persistent app storage on native. Every call is wrapped:
// storage can be unavailable (private window, quota, cleared data) and the Manage screen must
// work exactly as before without it. Only copies of CLOUD state are stored — never local edits.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ELIM_LOCAL_INDEX_KEY,
  ELIM_LOCAL_MAX_BYTES,
  ElimLocalIndexEntry,
  ElimLocalRecord,
  elimLocalKey,
  indexEntryOf,
  planElimLocalPrune,
  validateElimLocalRecord,
} from "../../utils/elim-local-recovery";

// The subset of AsyncStorage used here (injectable for tests).
export interface ElimLocalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export const createElimLocalRecoveryStore = (storage: ElimLocalStorage) => {
  const readIndex = async (): Promise<unknown> => {
    try {
      const raw = await storage.getItem(ELIM_LOCAL_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const writeIndex = async (entries: ElimLocalIndexEntry[]) => {
    try {
      await storage.setItem(ELIM_LOCAL_INDEX_KEY, JSON.stringify(entries));
    } catch {
      // best effort
    }
  };

  const removeKeys = async (entries: ElimLocalIndexEntry[]) => {
    if (!entries.length) return;
    try {
      await storage.multiRemove(
        entries.map((e) => elimLocalKey(e.ownerId, e.tournamentId)),
      );
    } catch {
      // best effort
    }
  };

  return {
    // The validated record for this tournament + account, or null. Invalid / expired → pruned.
    async read(
      tournamentId: number,
      ownerId: string,
      now: Date = new Date(),
    ): Promise<ElimLocalRecord | null> {
      const key = elimLocalKey(ownerId, tournamentId);
      let raw: unknown = null;
      try {
        const s = await storage.getItem(key);
        if (!s) return null;
        raw = JSON.parse(s);
      } catch {
        raw = { invalid: true };
      }
      const v = validateElimLocalRecord(raw, { tournamentId, ownerId }, now);
      if (v.ok) return v.record;
      try {
        await storage.removeItem(key);
      } catch {
        // best effort
      }
      const idx = await readIndex();
      if (Array.isArray(idx)) {
        await writeIndex(
          (idx as ElimLocalIndexEntry[]).filter(
            (e) =>
              !(e && e.tournamentId === tournamentId && e.ownerId === ownerId),
          ),
        );
      }
      return null;
    },

    // Replace this tournament's record with a newer cloud copy; enforce the device-wide bounds.
    async save(
      record: ElimLocalRecord,
      now: Date = new Date(),
    ): Promise<boolean> {
      let json: string;
      try {
        json = JSON.stringify(record);
      } catch {
        return false;
      }
      if (json.length > ELIM_LOCAL_MAX_BYTES) return false;
      try {
        await storage.setItem(
          elimLocalKey(record.ownerId, record.tournamentId),
          json,
        );
      } catch {
        return false;
      }
      const idx = await readIndex();
      const { keep, drop } = planElimLocalPrune(
        [...(Array.isArray(idx) ? idx : []), indexEntryOf(record)],
        now,
      );
      await removeKeys(
        drop.filter(
          (d) =>
            !keep.some(
              (k) =>
                k.ownerId === d.ownerId && k.tournamentId === d.tournamentId,
            ),
        ),
      );
      await writeIndex(keep);
      return true;
    },

    async remove(tournamentId: number, ownerId: string): Promise<void> {
      try {
        await storage.removeItem(elimLocalKey(ownerId, tournamentId));
      } catch {
        // best effort
      }
      const idx = await readIndex();
      if (Array.isArray(idx)) {
        await writeIndex(
          (idx as ElimLocalIndexEntry[]).filter(
            (e) =>
              !(e && e.tournamentId === tournamentId && e.ownerId === ownerId),
          ),
        );
      }
    },
  };
};

export const elimLocalRecoveryService =
  createElimLocalRecoveryStore(AsyncStorage);
