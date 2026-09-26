// src/models/services/chip.rows.ts
// Chip model → chip_* row mappers used by EVERY Chip cloud write (chipService.save and the
// chip_apply RPC path). Pure (no Supabase) so the reconnect-conflict fingerprint
// (chip.local-recovery chipRecoveryFingerprint) is built from EXACTLY what a sync writes —
// if a sync can overwrite a field, the fingerprint sees it. Moved verbatim from chip.service.

import { ChipEntry, ChipEvent, ChipMatch, ChipState, ChipTable } from "../types/chip.types";

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
