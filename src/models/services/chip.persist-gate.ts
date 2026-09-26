// src/models/services/chip.persist-gate.ts
//
// Application-level Chip PERSISTENCE GATE (does not rely on RLS). Supabase-free, unit-tested.
//
// Rule: no Chip persistence — cloud save, explicit save, retry, screen-exit flush, local
// backup, offline-controller entry — unless the board on screen came from an AUTHORITATIVE
// source:
//   "cloud"           loaded by a completed cloud load that STARTED with an authenticated user
//                     and returned a plausible board (a started tournament with zero owned
//                     entries = rows hidden by RLS → not authoritative); owned by that user;
//   "offline_session" a verified owner-scoped offline continuation (resumed from a local
//                     snapshot whose owner matches this browser's stored session).
// Anything else ("none": signed-out visit, load still pending, auth changed) is display-only.
//
// Cloud writes additionally require the CURRENT auth user to be that owner (and, for a cloud
// board, the profile/access resolved). If auth appears or changes after an unauthoritative
// load, the in-memory board is NOT promoted — needsFreshLoad() tells the caller to discard
// anything pending and reload from the cloud first.

import { ChipState } from "../types/chip.types";

export type ChipBoardSource = "none" | "cloud" | "offline_session";

// Thrown by the save path if a write slips past the entry gates (defense in depth). Never an
// outage: it must not trip offline mode or be retried into the cloud.
export class ChipPersistBlockedError extends Error {
  constructor(reason = "Chip board is not from an authoritative source") {
    super(`Chip save blocked: ${reason}`);
    this.name = "ChipPersistBlockedError";
  }
}

// RLS hid the rows: a STARTED tournament always has owned (non-projected) entries.
export const looksLikeHiddenBoard = (chip: ChipState): boolean =>
  !!chip.startedAt && chip.entries.filter((e) => !e.fromRegistration).length === 0;

export interface ChipPersistGate {
  // A cloud load completed. `authUserIdAtStart` = the auth user when the load began.
  // Returns true when the applied board is authoritative.
  markCloudLoad(args: { authUserIdAtStart: string | null; chip: ChipState }): boolean;
  // A verified owner-scoped offline session was resumed from a local snapshot.
  markOfflineSession(ownerUserId: string): void;
  // Drop authority (e.g. auth changed; a fresh load is required).
  markUnauthoritative(): void;
  source(): ChipBoardSource;
  owner(): string | null;
  // Cloud persistence (auto-save, explicit save, retry, exit flush, reconnect push).
  canWriteCloud(args: { authUserId: string | null; profileReady: boolean }): boolean;
  // Local IndexedDB backups (owner-scoped; never ownerless).
  canWriteLocal(args: { authUserId: string | null; storedUserId: string | null }): boolean;
  // Local tournament mutations on screen (they may persist later).
  canMutate(args: { authUserId: string | null; offline: boolean }): boolean;
  // Auth is (now) valid but the board isn't authoritative for this user → reload first.
  needsFreshLoad(args: { authUserId: string | null; profileReady: boolean; loaded: boolean }): boolean;
}

export const createChipPersistGate = (): ChipPersistGate => {
  let src: ChipBoardSource = "none";
  let ownerId: string | null = null;
  return {
    markCloudLoad({ authUserIdAtStart, chip }) {
      if (!authUserIdAtStart || looksLikeHiddenBoard(chip)) {
        src = "none";
        ownerId = null;
        return false;
      }
      src = "cloud";
      ownerId = authUserIdAtStart;
      return true;
    },
    markOfflineSession(ownerUserId) {
      src = ownerUserId ? "offline_session" : "none";
      ownerId = ownerUserId || null;
    },
    markUnauthoritative() {
      src = "none";
      ownerId = null;
    },
    source: () => src,
    owner: () => ownerId,
    canWriteCloud({ authUserId, profileReady }) {
      if (!authUserId || !ownerId || authUserId !== ownerId) return false;
      if (src === "cloud") return profileReady;
      return src === "offline_session";
    },
    canWriteLocal({ authUserId, storedUserId }) {
      if (!ownerId) return false;
      if (src === "cloud") return authUserId === ownerId;
      if (src === "offline_session") return authUserId === ownerId || storedUserId === ownerId;
      return false;
    },
    canMutate({ authUserId, offline }) {
      if (src === "none" || !ownerId) return false;
      // Offline (session or a cloud board that went offline): the owner may keep running it
      // even while the auth token can't refresh.
      return offline || authUserId === ownerId;
    },
    needsFreshLoad({ authUserId, profileReady, loaded }) {
      if (!loaded || !authUserId || !profileReady) return false;
      return src === "none" || (src === "cloud" && ownerId !== authUserId);
    },
  };
};
