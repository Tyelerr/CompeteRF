// src/utils/chip-version-sync.ts
// Multi-TD freshness for the Chip director screen. Every save advances chip_config.version
// (atomic claim + finalize, chip.persist.ts), so a second TD device only needs to read that one
// number to know another device changed the board — and reload (the existing guarded silent
// load) only then. Cheap: one tiny row read per probe instead of the 8-request full load.
// Pure: no React, no Supabase.

export const CHIP_TD_VERSION_POLL_MS = 5000;

export interface ChipProbeGate {
  loaded: boolean; // a cloud board has been applied
  started: boolean; // live event (setup changes flow through other refreshes)
  finished: boolean;
  online: boolean; // offline controller says "online"
  cloudChanged: boolean; // conflict banner up — only Reload Latest reloads
  recoveryActive: boolean; // viewing a local backup
  queuePaused: boolean;
  saving: boolean; // a save of OURS is in flight (live version may be our own claim)
  hasUnsaved: boolean; // local changes not yet persisted (a reload would be refused anyway)
  pendingDebounce: boolean; // an edit waiting for the 800 ms debounce
  appActive: boolean; // foreground / visible tab
}

// May we probe right now? Never while this device is mid-save or holds unsaved edits: the
// live version then legitimately differs (our own claim) or our edit must land (or conflict)
// first — the save path, not the probe, decides that.
export const canProbeChipVersion = (g: ChipProbeGate): boolean =>
  g.loaded &&
  g.started &&
  !g.finished &&
  g.online &&
  !g.cloudChanged &&
  !g.recoveryActive &&
  !g.queuePaused &&
  !g.saving &&
  !g.hasUnsaved &&
  !g.pendingDebounce &&
  g.appActive;

// Reload only when the cloud moved PAST what this board was loaded/saved at. null = unknown
// (transient read error / no row) → do nothing this tick.
export const chipVersionAction = (live: number | null, local: number): "reload" | "none" =>
  live != null && live > local ? "reload" : "none";
