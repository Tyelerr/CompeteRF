// src/models/services/chip.load-heal.ts
// Load-time self-heal + the "does this load need to be saved?" decision for a Chip board.
//
// Loading a board (first open, refresh, the silent reload a registration change triggers) must
// NOT write it back unless the load-time repair actually changed what would be persisted.
// Previously every load set the board state and the debounced auto-save wrote the whole
// snapshot ~800ms later — so every open director screen re-saved its (possibly stale) copy on
// every refresh / registration reload, widening the multi-device overwrite window.
//
//   • healLoadedChip — the ONE active-board repair chain (was duplicated in the VM's load() and
//     healedCloudChip; they must stay identical for the cloud/local comparisons).
//   • loadRepairChanged — did the repair change anything that is PERSISTED? Compared with the
//     same row-level fingerprint the save / conflict checks use (identity alone isn't enough:
//     some repair steps return an equal-content copy).
//   • chipAutoSaveNeeded — the auto-save skips exactly the unchanged loaded board.

import {
  assignFinals,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reconcileShuffleRound,
  settleShuffleDrain,
} from "./chip.engine";
import { chipRecoveryFingerprint } from "./chip.local-recovery";
import { ChipState } from "../types/chip.types";

// Active (not completed) board repair, in order: void ghost matches, settle a stuck shuffle
// drain, eliminate 0-chip entries, re-attach alive entries that fell out of the queue,
// re-derive a Shuffle round's owed-a-turn list, auto-seat the finals at two-alive-no-match.
export const healLoadedChip = (chip: ChipState): ChipState =>
  assignFinals(reconcileShuffleRound(reconcileQueue(reconcileEliminations(settleShuffleDrain(reconcileMatches(chip))))));

// True when the healed board differs from what was loaded in anything that gets persisted.
export const loadRepairChanged = (loaded: ChipState, healed: ChipState): boolean =>
  loaded !== healed && chipRecoveryFingerprint(loaded) !== chipRecoveryFingerprint(healed);

// The auto-save runs for every board change EXCEPT the unchanged board a load just applied.
// `cleanLoaded` is that board when its load needed no repair, else null (a repaired load is
// saved once, like any change).
export const chipAutoSaveNeeded = (chip: ChipState, cleanLoaded: ChipState | null): boolean =>
  chip !== cleanLoaded;
