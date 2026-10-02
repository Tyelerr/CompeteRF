// src/models/services/chip.rows.ts
// Chip model → chip_* row mappers used by EVERY Chip cloud write (chipService.save and the
// chip_apply RPC path). Pure (no Supabase) so the reconnect-conflict fingerprint
// (chip.local-recovery chipRecoveryFingerprint) is built from EXACTLY what a sync writes —
// if a sync can overwrite a field, the fingerprint sees it. Moved verbatim from chip.service.

import { safePaidSidePots } from "../../utils/side-pots";
import { ChipEntry, ChipEvent, ChipMatch, ChipState, ChipTable } from "../types/chip.types";
import type { ChipSavePlan } from "./chip.persist";

export const overrideToRow = (e: ChipEntry) => ({
  fargo_cap_override: !!e.fargoCapOverride,
  fargo_cap_at_override: e.fargoCapAtOverride ?? null,
  player_fargo_at_override: e.playerFargoAtOverride ?? null,
  fargo_cap_override_reason: e.fargoCapOverrideReason ?? null,
  fargo_cap_override_notes: e.fargoCapOverrideNotes ?? null,
  overridden_by: e.overriddenBy ?? null,
  overridden_at: e.overriddenAt ?? null,
});

export const entryToRow = (tid: number, e: ChipEntry) => ({
  ...overrideToRow(e),
  id: e.id,
  tournament_id: tid,
  p1_name: e.p1Name,
  p1_fargo: e.p1Fargo,
  p1_phone: e.p1Phone ?? null,
  p1_profile_id: e.p1ProfileId ?? null,
  p2_profile_id: e.p2ProfileId ?? null,
  // Phase 5: always persist players.id when we have it (active AND pending). For an
  // active player p1_profile_id + p1_player_id are the same person (from one search
  // row) so the sync trigger stays consistent; for a pending player p1_profile_id is
  // null and this uuid is the only identity.
  p1_player_id: e.p1PlayerId ?? null,
  p2_player_id: e.p2PlayerId ?? null,
  p2_name: e.p2Name ?? null,
  p2_fargo: e.p2Fargo ?? null,
  team_fargo: e.teamFargo,
  start_chips: e.startChips,
  chips: e.chips,
  paid: e.paid,
  checked_in: e.checkedIn,
  // Persist singles side-pot entries (names). Defensively coerced so a legacy
  // undefined never writes a non-array. Column added 20260816120000.
  paid_side_pots: e.paidSidePots ?? [],
  status: e.status,
  wins: e.wins,
  losses: e.losses,
  streak: e.streak,
  best_streak: e.bestStreak,
  eliminations: e.eliminations,
  table_id: e.tableId ?? null,
  eliminated_at: e.eliminatedAt ?? null,
  created_at: e.createdAt,
});

export const tableToRow = (tid: number, t: ChipTable, sort: number) => ({
  id: t.id,
  tournament_id: tid,
  label: t.label,
  is_stream: t.isStream,
  stream_url: t.streamUrl ?? null,
  status: t.status,
  inactive: !!t.inactive,
  closing: !!t.closing,
  locked: !!t.locked,
  match_id: t.matchId ?? null,
  holder_id: t.holderId ?? null,
  last_loser_id: t.lastLoserId ?? null,
  pending_challenger_id: t.pendingChallengerId ?? null,
  sort,
});

export const matchToRow = (tid: number, m: ChipMatch) => ({
  id: m.id,
  tournament_id: tid,
  table_id: m.tableId,
  a_id: m.aId,
  b_id: m.bId,
  winner_id: m.winnerId ?? null,
  loser_id: m.loserId ?? null,
  started_at: m.startedAt,
  ended_at: m.endedAt ?? null,
  status: m.status,
});

export const eventToRow = (tid: number, ev: ChipEvent) => ({
  id: ev.id,
  tournament_id: tid,
  type: ev.type,
  text: ev.text,
  actor_id: ev.by ?? null,
  payload: ev.payload ?? null,
  tx_id: ev.txId ?? null,
  superseded: ev.superseded ?? false,
  created_at: ev.at,
});

// chip_config columns a whole-state save writes (core + extended + restore points + soft),
// minus the per-write updated_at / tournament_id.
export const chipConfigPayload = (chip: ChipState) => ({
  format: chip.settings.format,
  queue: chip.queue,
  started_at: chip.startedAt ?? null,
  finished_at: chip.finishedAt ?? null,
  winner_entry_id: chip.winnerId ?? null,
  reshuffle_count: chip.reshuffleCount ?? 0,
  reshuffle_pending: !!chip.reshufflePending,
  reshuffle_table_count: chip.reshuffleTableCount ?? null,
  shuffle_mode: !!chip.shuffleMode,
  shuffle_ready: !!chip.shuffleReady,
  shuffle_round: !!chip.shuffleRound,
  round_remaining: chip.roundRemaining ?? [],
  restore_points: chip.restorePoints ?? [],
  reshuffle_removing_ids: chip.reshuffleRemovingIds ?? [],
});

// ── Row → model (the read side of entryToRow; pure) ─────────────────────────────
// Fargo-cap override columns are identical on chip_entries / tournament_players /
// tournament_teams (migration 20260817120000), so one pair of mappers serves all three.
export const overrideFromRow = (r: any): Partial<ChipEntry> => ({
  fargoCapOverride: !!r?.fargo_cap_override,
  fargoCapAtOverride: r?.fargo_cap_at_override ?? null,
  playerFargoAtOverride: r?.player_fargo_at_override ?? null,
  fargoCapOverrideReason: r?.fargo_cap_override_reason ?? null,
  fargoCapOverrideNotes: r?.fargo_cap_override_notes ?? null,
  overriddenBy: r?.overridden_by ?? null,
  overriddenAt: r?.overridden_at ?? null,
});

// ── row ↔ model mappers ────────────────────────────────────────────────────────
export const rowToEntry = (r: any): ChipEntry => ({
  ...overrideFromRow(r),
  id: r.id,
  p1Name: r.p1_name ?? "",
  p1Fargo: r.p1_fargo,
  p1Phone: r.p1_phone,
  p1ProfileId: r.p1_profile_id ?? null,
  p2ProfileId: r.p2_profile_id ?? null,
  // Phase 5: stable players.id identity (present for active rows via the Phase-4A
  // sync trigger, and for PENDING players who have no id_auto). Read alongside the
  // legacy id_auto so round-trips preserve it.
  p1PlayerId: r.p1_player_id ?? null,
  p2PlayerId: r.p2_player_id ?? null,
  p2Name: r.p2_name,
  p2Fargo: r.p2_fargo,
  teamFargo: r.team_fargo,
  startChips: r.start_chips ?? 0,
  chips: r.chips ?? 0,
  paid: !!r.paid,
  checkedIn: !!r.checked_in,
  // Side pots this entry is ENTERED in (names). Singles now record them on
  // chip_entries.paid_side_pots, mirroring tournament_teams (doubles). Membership,
  // not collection — see src/utils/side-pots.ts.
  paidSidePots: safePaidSidePots(r.paid_side_pots),
  status: r.status,
  wins: r.wins ?? 0,
  losses: r.losses ?? 0,
  streak: r.streak ?? 0,
  bestStreak: r.best_streak ?? 0,
  eliminations: r.eliminations ?? 0,
  tableId: r.table_id,
  eliminatedAt: r.eliminated_at,
  createdAt: r.created_at,
});


// The whole-state save plan for one chip board (executed by chip.persist.executeChipSave).
// Pure — moved out of chipService.save so the payload can be measured and tested.
// Registration-backed entries live in tournament_players and are re-projected on every load —
// never written (or pruned against) here; they materialize into chip_entries only when the
// tournament starts (flag cleared).
export const buildChipSavePlan = (
  id: number,
  chip: ChipState,
  opts?: { expectedVersion?: number | null },
): ChipSavePlan => {
  const ownedEntries = chip.entries.filter((e) => !e.fromRegistration);
  return {
    // CORE config (long-standing columns) — must always persist, especially the queue.
    // tiers (chip_ranges) + buy-backs (live_settings) live on the Compete Settings form.
    configCore: {
      tournament_id: id,
      format: chip.settings.format,
      queue: chip.queue,
      started_at: chip.startedAt ?? null,
      finished_at: chip.finishedAt ?? null,
      winner_entry_id: chip.winnerId ?? null,
      reshuffle_count: chip.reshuffleCount ?? 0,
      updated_at: new Date().toISOString(),
    },
    // EXTENDED config (newer shuffle columns) — separate write, same row.
    configExtended: {
      tournament_id: id,
      reshuffle_pending: !!chip.reshufflePending,
      reshuffle_table_count: chip.reshuffleTableCount ?? null,
      shuffle_mode: !!chip.shuffleMode,
      shuffle_ready: !!chip.shuffleReady,
      shuffle_round: !!chip.shuffleRound,
      round_remaining: chip.roundRemaining ?? [],
    },
    // Restore points (persisted history) — own section, same row.
    configRestorePoints: { tournament_id: id, restore_points: chip.restorePoints ?? [] },
    // Shuffle-owned closing table ids — best-effort, never a save failure (Cancel Shuffle then
    // reopens nothing after a reload, the safe fallback).
    configSoft: { tournament_id: id, reshuffle_removing_ids: chip.reshuffleRemovingIds ?? [] },
    entries: { rows: ownedEntries.map((e) => entryToRow(id, e)), ids: ownedEntries.map((e) => e.id) },
    matches: { rows: chip.matches.map((m) => matchToRow(id, m)), ids: chip.matches.map((m) => m.id) },
    tables: { rows: chip.tables.map((tb, i) => tableToRow(id, tb, i)), ids: chip.tables.map((tb) => tb.id) },
    // Events are append-only — insert new ones, never rewrite or delete. A Tournament Restore
    // flips existing events to superseded (one-way flag, applied separately).
    events: chip.events.map((ev) => eventToRow(id, ev)),
    supersededEventIds: chip.events.filter((ev) => ev.superseded).map((ev) => ev.id),
    expectedVersion: opts?.expectedVersion,
    claimKey: id,
  };
};
