// src/utils/queue-settings.ts
// The exact set_queue payloads the Manage screen sends. Auto Assign (autoAssignEnabled) and the
// Queue Order mode are INDEPENDENT settings: only autoAssignPayload ever carries
// autoAssignEnabled, so changing the mode, reordering (Move & Switch to Manual) or pinning
// (Move & Keep {mode}) can never turn Auto Assign on or off. The server's set_queue only writes
// keys that are present, so an absent autoAssignEnabled is left exactly as it was.
import { AutoAssignMode, QueuePin } from "../models/types/tournament-settings.types";

export interface QueueSettingsPayload {
  autoAssignMode?: AutoAssignMode;
  queueOrder?: string[];
  autoAssignEnabled?: boolean;
  queuePins?: QueuePin[];
}

/** Auto Assign On/Off — the ONLY payload that touches autoAssignEnabled. */
export const autoAssignPayload = (on: boolean): QueueSettingsPayload => ({ autoAssignEnabled: on });

/** Queue Order dropdown. */
export const queueModePayload = (mode: AutoAssignMode): QueueSettingsPayload => ({ autoAssignMode: mode });

/** "Move & Switch to Manual": the displayed order becomes the Manual order; Keep-mode pins are
 *  cleared in the same write (Manual's queueOrder is authoritative). */
export const manualReorderPayload = (ids: string[]): QueueSettingsPayload => ({
  queueOrder: ids,
  autoAssignMode: "manual",
  queuePins: [],
});

/** "Move & Keep {mode}": the mode stays; the moved match is pinned relative to its neighbour. */
export const keepModeMovePayload = (pins: QueuePin[]): QueueSettingsPayload => ({ queuePins: pins });
