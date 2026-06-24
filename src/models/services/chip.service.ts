// src/models/services/chip.service.ts
// Persistence for the Chip Tournament format against REAL relational tables
// (chip_config / chip_entries / chip_tables / chip_matches / chip_events) so the
// data is owned and queryable — see CHIP_TOURNAMENT.md and the migration
// 20260624120000_chip_tournament_tables.sql. Rules stay in chip.engine.ts; this
// service hydrates a ChipState from the rows and writes it back (upsert + prune).

import { supabase } from "../../lib/supabase";
import {
  ChipEntry,
  ChipEvent,
  ChipMatch,
  ChipState,
  ChipTable,
} from "../types/chip.types";
import { Tournament } from "../types/tournament.types";
import { TournamentLiveState } from "../types/common.types";

export interface ChipTournamentBundle {
  tournament: Tournament;
  chip: ChipState;
}

// ── row ↔ model mappers ────────────────────────────────────────────────────────
const rowToEntry = (r: any): ChipEntry => ({
  id: r.id,
  p1Name: r.p1_name ?? "",
  p1Fargo: r.p1_fargo,
  p1Phone: r.p1_phone,
  p2Name: r.p2_name,
  p2Fargo: r.p2_fargo,
  teamFargo: r.team_fargo,
  startChips: r.start_chips ?? 0,
  chips: r.chips ?? 0,
  paid: !!r.paid,
  checkedIn: !!r.checked_in,
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
const entryToRow = (tid: number, e: ChipEntry) => ({
  id: e.id,
  tournament_id: tid,
  p1_name: e.p1Name,
  p1_fargo: e.p1Fargo,
  p1_phone: e.p1Phone ?? null,
  p2_name: e.p2Name ?? null,
  p2_fargo: e.p2Fargo ?? null,
  team_fargo: e.teamFargo,
  start_chips: e.startChips,
  chips: e.chips,
  paid: e.paid,
  checked_in: e.checkedIn,
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

const rowToTable = (r: any): ChipTable => ({
  id: r.id,
  label: r.label ?? "",
  isStream: !!r.is_stream,
  streamUrl: r.stream_url,
  status: r.status,
  matchId: r.match_id,
  holderId: r.holder_id,
  lastLoserId: r.last_loser_id,
});
const tableToRow = (tid: number, t: ChipTable, sort: number) => ({
  id: t.id,
  tournament_id: tid,
  label: t.label,
  is_stream: t.isStream,
  stream_url: t.streamUrl ?? null,
  status: t.status,
  match_id: t.matchId ?? null,
  holder_id: t.holderId ?? null,
  last_loser_id: t.lastLoserId ?? null,
  sort,
});

const rowToMatch = (r: any): ChipMatch => ({
  id: r.id,
  tableId: r.table_id,
  aId: r.a_id,
  bId: r.b_id,
  winnerId: r.winner_id,
  loserId: r.loser_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  status: r.status,
});
const matchToRow = (tid: number, m: ChipMatch) => ({
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

const rowToEvent = (r: any): ChipEvent => ({
  id: r.id,
  type: r.type,
  text: r.text ?? "",
  at: r.created_at,
  by: r.actor_id,
  payload: r.payload ?? undefined,
});
const eventToRow = (tid: number, ev: ChipEvent) => ({
  id: ev.id,
  tournament_id: tid,
  type: ev.type,
  text: ev.text,
  actor_id: ev.by ?? null,
  payload: ev.payload ?? null,
  created_at: ev.at,
});

// Upsert the current rows for a table and delete any rows for this tournament
// that are no longer present (entries/tables/matches removed in the UI).
const syncTable = async (
  table: string,
  tid: number,
  rows: any[],
  ids: string[],
): Promise<void> => {
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw error;
  }
  let del = supabase.from(table).delete().eq("tournament_id", tid);
  if (ids.length) {
    del = del.not("id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
  }
  const { error } = await del;
  if (error) throw error;
};

export const chipService = {
  // Hydrate the tournament + its chip state from the relational tables.
  async load(id: number): Promise<ChipTournamentBundle> {
    const { data: t, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (!t) throw new Error("Tournament not found.");

    const [cfg, entries, tables, matches, events] = await Promise.all([
      supabase.from("chip_config").select("*").eq("tournament_id", id).maybeSingle(),
      supabase.from("chip_entries").select("*").eq("tournament_id", id),
      supabase.from("chip_tables").select("*").eq("tournament_id", id).order("sort", { ascending: true }),
      supabase.from("chip_matches").select("*").eq("tournament_id", id),
      supabase.from("chip_events").select("*").eq("tournament_id", id).order("created_at", { ascending: false }),
    ]);

    const c = cfg.data;
    const tt = t as Tournament;
    // Format follows the Compete-form game type (*-scotch-doubles → Scotch Doubles).
    const derivedFormat = String(tt.game_type ?? "").includes("scotch-doubles")
      ? "scotch_doubles"
      : "singles";
    // The Fargo chip table is edited on the Compete Settings page and stored on the
    // tournament row (chip_ranges) — read it from there, not chip_config.
    const tiers = ((tt.chip_ranges as any[]) ?? []).map((r, i) => {
      const max = r.maxRating ?? r.maxFargo;
      return {
        id: `t_${i}`,
        minFargo: r.minRating ?? r.minFargo ?? 0,
        maxFargo: max == null || max >= 9000 ? null : max,
        chips: r.chips ?? 0,
      };
    });
    const chip: ChipState = {
      settings: {
        format: derivedFormat,
        tiers,
        // Buy-backs are configured on the Compete Settings form (live_settings).
        buyBacksAllowed: !!(tt.live_settings as any)?.chipBuyBacks,
      },
      entries: (entries.data ?? []).map(rowToEntry),
      tables: (tables.data ?? []).map(rowToTable),
      matches: (matches.data ?? []).map(rowToMatch),
      queue: (c?.queue as string[]) ?? [],
      events: (events.data ?? []).map(rowToEvent),
      startedAt: c?.started_at ?? null,
      finishedAt: c?.finished_at ?? null,
      winnerId: c?.winner_entry_id ?? null,
      reshuffleCount: c?.reshuffle_count ?? 0,
    };
    return { tournament: t as Tournament, chip };
  },

  // Write the whole chip state back to the tables (upsert + prune removed rows).
  async save(id: number, chip: ChipState): Promise<void> {
    const { error: cfgErr } = await supabase.from("chip_config").upsert({
      tournament_id: id,
      format: chip.settings.format,
      // tiers (chip_ranges) + buy-backs (live_settings) are edited on the Compete
      // Settings form, not here.
      queue: chip.queue,
      started_at: chip.startedAt ?? null,
      finished_at: chip.finishedAt ?? null,
      winner_entry_id: chip.winnerId ?? null,
      reshuffle_count: chip.reshuffleCount ?? 0,
      updated_at: new Date().toISOString(),
    });
    if (cfgErr) throw cfgErr;

    await syncTable("chip_entries", id, chip.entries.map((e) => entryToRow(id, e)), chip.entries.map((e) => e.id));
    await syncTable("chip_tables", id, chip.tables.map((t, i) => tableToRow(id, t, i)), chip.tables.map((t) => t.id));
    await syncTable("chip_matches", id, chip.matches.map((m) => matchToRow(id, m)), chip.matches.map((m) => m.id));

    // Events are append-only — insert new ones, never rewrite or delete.
    if (chip.events.length) {
      const { error } = await supabase
        .from("chip_events")
        .upsert(chip.events.map((ev) => eventToRow(id, ev)), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }
  },

  async setName(id: number, name: string): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  async setLiveState(id: number, state: TournamentLiveState): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ live_state: state, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  async start(id: number, chip: ChipState): Promise<void> {
    await chipService.save(id, chip);
    await chipService.setLiveState(id, "in_progress");
  },
};
