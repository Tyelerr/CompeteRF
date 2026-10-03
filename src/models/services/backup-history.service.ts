// src/models/services/backup-history.service.ts
// Remembers, on THIS device only, when a tournament backup PDF was last generated — so Actions
// can say "Last backup: 47 min ago". AsyncStorage (localStorage on web); never a server write;
// failures are ignored (it's a convenience, not a record).

import AsyncStorage from "@react-native-async-storage/async-storage";

export type BackupKind = "elim" | "chip";
const key = (kind: BackupKind, tournamentId: number) => `compete.backup-at.v1:${kind}:${tournamentId}`;

export const backupHistoryService = {
  async get(kind: BackupKind, tournamentId: number): Promise<Date | null> {
    try {
      const v = await AsyncStorage.getItem(key(kind, tournamentId));
      const t = v ? Date.parse(v) : NaN;
      return Number.isNaN(t) ? null : new Date(t);
    } catch {
      return null;
    }
  },
  async mark(kind: BackupKind, tournamentId: number, at: Date = new Date()): Promise<void> {
    try {
      await AsyncStorage.setItem(key(kind, tournamentId), at.toISOString());
    } catch {
      // best effort
    }
  },
};

/** "just now" / "12 min ago" / "3 hr ago" / "2 days ago". */
export const backupAgeText = (at: Date | null, now: Date = new Date()): string | null => {
  if (!at) return null;
  const min = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
