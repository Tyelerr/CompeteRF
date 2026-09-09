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
  ChipRestorePoint,
  ChipState,
  ChipTable,
} from "../types/chip.types";
import { Tournament } from "../types/tournament.types";
import { TournamentLiveState } from "../types/common.types";
import { reconcileSidePotMembership, safePaidSidePots } from "../../utils/side-pots";

export interface ChipTournamentBundle {
  tournament: Tournament;
  chip: ChipState;
}

// One persisted final-placement row (chip_results). Deliberately just the durable
// relationship — tournament ↔ place ↔ team ↔ members — with no payout amount /
// split / lock yet (those derive from the prize structure + placement later).
export interface ChipResultRow {
  entryId: string;
  place: number;
  teamName: string | null;
  p1ProfileId: number | null;
  p2ProfileId: number | null;
  // Phase 5: stable players.id per member so a PENDING player's placement/history
  // survives account claim (p1ProfileId may be null for pending; p1PlayerId is the
  // durable link). Optional for back-compat with older callers/rows.
  p1PlayerId?: string | null;
  p2PlayerId?: string | null;
}

// Fargo-cap override columns are identical on chip_entries / tournament_players /
// tournament_teams (migration 20260817120000), so one pair of mappers serves all three.
const overrideFromRow = (r: any): Partial<ChipEntry> => ({
  fargoCapOverride: !!r?.fargo_cap_override,
  fargoCapAtOverride: r?.fargo_cap_at_override ?? null,
  playerFargoAtOverride: r?.player_fargo_at_override ?? null,
  fargoCapOverrideReason: r?.fargo_cap_override_reason ?? null,
  fargoCapOverrideNotes: r?.fargo_cap_override_notes ?? null,
  overriddenBy: r?.overridden_by ?? null,
  overriddenAt: r?.overridden_at ?? null,
});
const overrideToRow = (e: ChipEntry) => ({
  fargo_cap_override: !!e.fargoCapOverride,
  fargo_cap_at_override: e.fargoCapAtOverride ?? null,
  player_fargo_at_override: e.playerFargoAtOverride ?? null,
  fargo_cap_override_reason: e.fargoCapOverrideReason ?? null,
  fargo_cap_override_notes: e.fargoCapOverrideNotes ?? null,
  overridden_by: e.overriddenBy ?? null,
  overridden_at: e.overriddenAt ?? null,
});

// ── row ↔ model mappers ────────────────────────────────────────────────────────
const rowToEntry = (r: any): ChipEntry => ({
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
const entryToRow = (tid: number, e: ChipEntry) => ({
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

// A self-service registration (tournament_players row) projected into a chip
// entry so players who registered themselves show up in the chip Players list
// even before the TD touches them. Matched to real chip_entries by player_id so
// we never duplicate a player the TD already added/linked. Stable id `reg_<id>`
// makes the import idempotent (the same registration always maps to the same
// chip entry row once it's saved).
const regToEntry = (r: any): ChipEntry => {
  const p = r.profiles;
  const name = p
    ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || p.user_name
    : r.guest_name ?? "Player";
  // Prefer this event's confirmed snapshot, then the registration rating, then the
  // player's verified profile Fargo (the default for a returning verified player).
  const fargo = r.fargo_at_registration ?? r.fargo_rating ?? p?.fargo ?? null;
  return {
    ...overrideFromRow(r), // tournament_players carries the same override columns
    id: `reg_${r.id}`,
    p1Name: name,
    p1Fargo: fargo,
    p1Phone: null,
    p1ProfileId: r.player_id ?? null,
    p2ProfileId: null,
    p1PlayerId: r.player_uuid ?? null,
    p2PlayerId: null,
    p2Name: null,
    p2Fargo: null,
    teamFargo: fargo,
    startChips: 0,
    chips: 0,
    paid: !!r.paid_entry,
    checkedIn: r.status === "checked_in",
    // Self-reg singles carry their side-pot entries on tournament_players.
    paidSidePots: safePaidSidePots(r.paid_side_pots),
    status: "queued",
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    eliminations: 0,
    createdAt: r.registered_at ?? r.created_at ?? new Date().toISOString(),
    fromRegistration: true,
    regId: r.id,
    regStatus: r.status ?? null,
    fargoStatus: p?.fargo_status ?? null,
  };
};

// A team (grouped rows from get_tournament_team_roster) projected into ONE chip
// entry: captain = P1, partner = P2. member_fargo already resolves TD-snapshot →
// verified profile Fargo → self-reported hint. Transient (fromRegistration) so
// it isn't persisted until the tournament starts.
interface RosterTeam {
  id: number;
  status: string;
  locked: boolean;
  approved: boolean;
  checkedIn: boolean;
  paid: boolean;
  name: string | null;
  chipOverride: number | null;
  paidSidePots: string[];
  members: any[];
}

const rosterTeamToEntry = (tm: RosterTeam): ChipEntry => {
  const cap = tm.members.find((m) => m.role === "captain") ?? {};
  const par = tm.members.find((m) => m.role === "member" && m.invite_status === "accepted") ?? null;
  const p1Fargo = cap.member_fargo ?? null;
  const p2Fargo = par?.member_fargo ?? null;
  return {
    id: `team_${tm.id}`,
    p1Name: cap.member_name ?? "",
    p1Fargo,
    p1Phone: null,
    p1ProfileId: cap.player_id ?? null,
    p2ProfileId: par?.player_id ?? null,
    p1PlayerId: cap.player_uuid ?? null,
    p2PlayerId: par?.player_uuid ?? null,
    p2Name: par ? par.member_name ?? "" : null,
    p2Fargo,
    teamFargo: (p1Fargo ?? 0) + (p2Fargo ?? 0),
    startChips: 0,
    chips: 0,
    paid: !!tm.paid,
    checkedIn: !!tm.checkedIn,
    status: "queued",
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    eliminations: 0,
    createdAt: new Date().toISOString(),
    fromRegistration: true,
    isTeam: true,
    regId: null,
    regStatus: tm.status ?? null,
    fargoStatus: null,
    teamId: tm.id,
    teamName: tm.name ?? null,
    chipOverride: tm.chipOverride ?? null,
    paidSidePots: tm.paidSidePots ?? [],
    teamLocked: !!tm.locked,
    teamApproved: !!tm.approved,
    p1MemberId: cap.member_id ?? null,
    p2MemberId: par?.member_id ?? null,
    p1FargoVerified: !!cap.fargo_verified,
    p2FargoVerified: !!par?.fargo_verified,
  };
};

const rowToTable = (r: any): ChipTable => ({
  id: r.id,
  label: r.label ?? "",
  isStream: !!r.is_stream,
  streamUrl: r.stream_url,
  status: r.status,
  inactive: !!r.inactive,
  closing: !!r.closing,
  locked: !!r.locked,
  matchId: r.match_id,
  holderId: r.holder_id,
  lastLoserId: r.last_loser_id,
  pendingChallengerId: r.pending_challenger_id ?? null,
});
const tableToRow = (tid: number, t: ChipTable, sort: number) => ({
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
  txId: r.tx_id ?? undefined,
  superseded: !!r.superseded,
});
const eventToRow = (tid: number, ev: ChipEvent) => ({
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
  // Append an audit row to chip_events (history timeline). Used e.g. for Fargo-cap
  // overrides so the decision is auditable even though the current state also lives on
  // the registration record.
  async logEvent(
    tournamentId: number,
    type: string,
    text: string,
    payload?: Record<string, unknown> | null,
    actorId?: number | null,
    txId?: string | null,
  ): Promise<void> {
    const eid = `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from("chip_events").insert({
      id: eid,
      tournament_id: tournamentId,
      type,
      text,
      // actor_id (profiles.id_auto) is the authoritative "who did this" column; thread it
      // explicitly for director actions (Fargo-cap override, Settings unlock, …) so the
      // audit row is never anonymous. Callers may still mirror it into payload.
      actor_id: actorId ?? null,
      // tx_id groups linked events from one session (e.g. Settings unlocked → updated &
      // locked / relocked) so the Activity Log can relate them.
      tx_id: txId ?? null,
      payload: payload ?? null,
    });
    if (error) throw error;
  },

  // Hydrate the tournament + its chip state from the relational tables.
  async load(id: number): Promise<ChipTournamentBundle> {
    const { data: t, error } = await supabase
      .from("tournaments")
      .select("*, venues(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (!t) throw new Error("Tournament not found.");

    const [cfg, entries, tables, matches, events, regs] = await Promise.all([
      supabase.from("chip_config").select("*").eq("tournament_id", id).maybeSingle(),
      supabase.from("chip_entries").select("*").eq("tournament_id", id),
      supabase.from("chip_tables").select("*").eq("tournament_id", id).order("sort", { ascending: true }),
      supabase.from("chip_matches").select("*").eq("tournament_id", id),
      supabase.from("chip_events").select("*").eq("tournament_id", id).order("created_at", { ascending: false }),
      supabase
        .from("tournament_players")
        .select(
          "*, profiles:player_id (id_auto, user_name, name, first_name, last_name, fargo, fargo_status)",
        )
        .eq("tournament_id", id)
        .not("status", "in", "(cancelled,no_show)"),
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
    // Chip entries the TD has already created/linked, plus any self-service
    // registrations (tournament_players) not yet represented as a chip entry —
    // deduped by linked player id so a player is never listed twice.
    const chipEntries = (entries.data ?? []).map(rowToEntry);
    // Dedupe by BOTH identities: players.id (uuid) is primary — it covers PENDING
    // players (no id_auto) and is the stable identity — with id_auto as the
    // compatibility fallback for old rows that only carry p1_profile_id.
    const linkedProfileIds = new Set<number>();
    const linkedPlayerIds = new Set<string>();
    for (const e of chipEntries) {
      if (e.p1ProfileId != null) linkedProfileIds.add(e.p1ProfileId);
      if (e.p2ProfileId != null) linkedProfileIds.add(e.p2ProfileId);
      if (e.p1PlayerId) linkedPlayerIds.add(e.p1PlayerId);
      if (e.p2PlayerId) linkedPlayerIds.add(e.p2PlayerId);
    }

    // Doubles → each registered TEAM is one chip entry (captain P1 / partner P2).
    // Singles → each self-service tournament_players registration is one entry.
    // Deduped by linked player id so nobody the TD already added is doubled up.
    let importedEntries: ChipEntry[] = [];
    if (derivedFormat === "scotch_doubles") {
      // Roster comes from a SECURITY DEFINER RPC (member rows are RLS-restricted,
      // so a direct embed returns empty members[] and the team would drop).
      const { data: roster } = await supabase.rpc("get_tournament_team_roster", { p_tid: id });
      // Fargo-cap override lives on tournament_teams (the roster RPC predates it and
      // doesn't return it). The TEAM row is directly selectable, so read it separately
      // and merge by team id below.
      const { data: teamOverrides } = await supabase
        .from("tournament_teams")
        .select(
          "id, fargo_cap_override, fargo_cap_at_override, player_fargo_at_override, fargo_cap_override_reason, fargo_cap_override_notes, overridden_by, overridden_at",
        )
        .eq("tournament_id", id);
      const overrideByTeam = new Map<number, Partial<ChipEntry>>();
      for (const to of (teamOverrides ?? []) as any[]) overrideByTeam.set(to.id, overrideFromRow(to));
      const byTeam = new Map<number, RosterTeam>();
      for (const r of (roster ?? []) as any[]) {
        let t = byTeam.get(r.team_id);
        if (!t) {
          t = { id: r.team_id, status: r.team_status, locked: r.team_locked, approved: r.team_approved, checkedIn: !!r.team_checked_in, paid: !!r.team_paid, name: r.team_name ?? null, chipOverride: r.team_chip_override ?? null, paidSidePots: (r.team_paid_side_pots ?? []) as string[], members: [] };
          byTeam.set(r.team_id, t);
        }
        t.members.push(r);
      }
      importedEntries = [...byTeam.values()]
        .filter((tm) => {
          const cap = tm.members.find((m) => m.role === "captain");
          // Include the team unless its captain is already listed as a chip_entry.
          // Match on uuid first (covers PENDING captains, who have no id_auto), then
          // fall back to id_auto for old rows.
          if (!cap) return false;
          if (cap.player_uuid && linkedPlayerIds.has(cap.player_uuid)) return false;
          if (cap.player_id != null && linkedProfileIds.has(cap.player_id)) return false;
          return true;
        })
        .map(rosterTeamToEntry)
        .map((e) => (e.teamId != null && overrideByTeam.has(e.teamId) ? { ...e, ...overrideByTeam.get(e.teamId) } : e));
    } else {
      importedEntries = (regs.data ?? [])
        .filter((r: any) => {
          if (r.player_uuid && linkedPlayerIds.has(r.player_uuid)) return false;
          if (r.player_id != null && linkedProfileIds.has(r.player_id)) return false;
          return true;
        })
        .map(regToEntry);
    }

    const chip: ChipState = {
      settings: {
        format: derivedFormat,
        tiers,
        // Buy-backs are configured on the Compete Settings form (live_settings).
        buyBacksAllowed: !!(tt.live_settings as any)?.chipBuyBacks,
      },
      entries: [...chipEntries, ...importedEntries],
      tables: (tables.data ?? []).map(rowToTable),
      matches: (matches.data ?? []).map(rowToMatch),
      queue: (c?.queue as string[]) ?? [],
      events: (events.data ?? []).map(rowToEvent),
      startedAt: c?.started_at ?? null,
      finishedAt: c?.finished_at ?? null,
      winnerId: c?.winner_entry_id ?? null,
      reshuffleCount: c?.reshuffle_count ?? 0,
      reshufflePending: !!c?.reshuffle_pending,
      reshuffleTableCount: c?.reshuffle_table_count ?? null,
      reshuffleRemovingIds: (c?.reshuffle_removing_ids as string[] | null) ?? [],
      shuffleMode: !!c?.shuffle_mode,
      shuffleReady: !!c?.shuffle_ready,
      shuffleRound: !!c?.shuffle_round,
      roundRemaining: (c?.round_remaining as string[] | null) ?? [],
      restorePoints: (c?.restore_points as ChipRestorePoint[] | null) ?? [],
    };
    return { tournament: t as Tournament, chip };
  },

  // Write the whole chip state back to the tables (upsert + prune removed rows).
  // Each section persists INDEPENDENTLY: a failure in one (e.g. a column from an
  // unapplied migration) must not block the others — so match results/timers still
  // save even if a newer table/config column isn't there yet. The first error is
  // rethrown at the end so explicit callers still see a problem.
  async save(id: number, chip: ChipState): Promise<void> {
    const errors: any[] = [];
    const run = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        errors.push(e);
      }
    };

    // CORE config (long-standing columns) — must always persist, especially the
    // queue. tiers (chip_ranges) + buy-backs (live_settings) live on the Compete
    // Settings form, not here.
    await run(async () => {
      const { error } = await supabase.from("chip_config").upsert({
        tournament_id: id,
        format: chip.settings.format,
        queue: chip.queue,
        started_at: chip.startedAt ?? null,
        finished_at: chip.finishedAt ?? null,
        winner_entry_id: chip.winnerId ?? null,
        reshuffle_count: chip.reshuffleCount ?? 0,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    });
    // EXTENDED config (newer shuffle columns) — persisted separately so an
    // unapplied migration can't take the queue down with it. Same config row.
    await run(async () => {
      const { error } = await supabase.from("chip_config").upsert({
        tournament_id: id,
        reshuffle_pending: !!chip.reshufflePending,
        reshuffle_table_count: chip.reshuffleTableCount ?? null,
        shuffle_mode: !!chip.shuffleMode,
        shuffle_ready: !!chip.shuffleReady,
        shuffle_round: !!chip.shuffleRound,
        round_remaining: chip.roundRemaining ?? [],
      });
      if (error) throw error;
    });
    // Restore points (persisted history) — its own section so a large/absent
    // column never blocks the core save. Same config row.
    await run(async () => {
      const { error } = await supabase.from("chip_config").upsert({
        tournament_id: id,
        restore_points: chip.restorePoints ?? [],
      });
      if (error) throw error;
    });
    // Shuffle-owned closing table ids — its OWN block that swallows its error so a
    // not-yet-applied migration for this newest column never surfaces as a save
    // failure (before the column exists it simply no-ops; Cancel Shuffle then reopens
    // nothing after a reload, which is the safe fallback — it never touches manual
    // closings). Once the column exists, the distinction survives reloads.
    try {
      await supabase.from("chip_config").upsert({
        tournament_id: id,
        reshuffle_removing_ids: chip.reshuffleRemovingIds ?? [],
      });
    } catch {
      /* column pending migration — non-critical */
    }

    // Registration-backed entries live in tournament_players and are re-projected
    // on every load — never write (or prune against) them here, otherwise they'd
    // be duplicated/absorbed and lose their approval lifecycle. They materialize
    // into real chip_entries only when the tournament starts (flag cleared).
    const ownedEntries = chip.entries.filter((e) => !e.fromRegistration);
    await run(() => syncTable("chip_entries", id, ownedEntries.map((e) => entryToRow(id, e)), ownedEntries.map((e) => e.id)));
    await run(() => syncTable("chip_matches", id, chip.matches.map((m) => matchToRow(id, m)), chip.matches.map((m) => m.id)));
    await run(() => syncTable("chip_tables", id, chip.tables.map((t, i) => tableToRow(id, t, i)), chip.tables.map((t) => t.id)));

    // Events are append-only — insert new ones, never rewrite or delete.
    await run(async () => {
      if (!chip.events.length) return;
      const { error } = await supabase
        .from("chip_events")
        .upsert(chip.events.map((ev) => eventToRow(id, ev)), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    });
    // A Tournament Restore flips existing events to superseded — a one-way flag the
    // append-only insert above (ignoreDuplicates) won't apply, so update it here.
    await run(async () => {
      const supersededIds = chip.events.filter((ev) => ev.superseded).map((ev) => ev.id);
      if (!supersededIds.length) return;
      const { error } = await supabase
        .from("chip_events")
        .update({ superseded: true })
        .eq("tournament_id", id)
        .in("id", supersededIds);
      if (error) throw error;
    });

    if (errors.length) throw errors[0];
  },

  // Targeted write of ONE singles entry's side-pot membership to chip_entries — the
  // singles counterpart to teamService.setTeamSidePots. Lets a side-pot toggle persist
  // IMMEDIATELY (independent of the debounced whole-blob save), so a background refetch
  // can't drop it. Matches an OWNED entry by (tournament_id, id); a brand-new not-yet-saved
  // entry matches 0 rows (no error) and is inserted by the whole-blob save instead — hence
  // no .single() here. Throws on a real error.
  async setEntrySidePots(id: number, entryId: string, pots: string[]): Promise<void> {
    const { error } = await supabase
      .from("chip_entries")
      .update({ paid_side_pots: pots })
      .eq("tournament_id", id)
      .eq("id", entryId);
    if (error) throw error;
  },

  // Reconcile EVERY owned singles entry's side-pot membership after a Settings rename/
  // remove (B4). Fetches the current chip_entries for the tournament, applies the shared
  // reconciler (keep valid, migrate renames, drop removals) and writes back only the rows
  // that actually changed. Registration-backed singles live in tournament_players and are
  // reconciled separately by the caller. Throws on the first write error.
  async reconcileSidePots(
    id: number,
    renameMap: Record<string, string>,
    validNames: string[],
  ): Promise<void> {
    const { data, error } = await supabase
      .from("chip_entries")
      .select("id, paid_side_pots")
      .eq("tournament_id", id);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; paid_side_pots: unknown }[]) {
      const cur = safePaidSidePots(row.paid_side_pots);
      const next = reconcileSidePotMembership(cur, renameMap, validNames);
      if (next.length !== cur.length || next.some((n, i) => n !== cur[i])) {
        const { error: e2 } = await supabase
          .from("chip_entries")
          .update({ paid_side_pots: next })
          .eq("tournament_id", id)
          .eq("id", row.id);
        if (e2) throw e2;
      }
    }
  },

  // Admin payout paid/unpaid tracking (item 29). Stored in tournament.live_settings under
  // `payoutsPaid` keyed by a stable payout key ("entry:<place>" or "sidepot:<name>:<place>")
  // so it uniformly covers the entry pool AND every side pot with no schema change. Read-
  // modify-write of the current live_settings (fresh read to avoid clobbering siblings).
  // Post-completion, low-frequency director action. NOTE: spectators must never read this —
  // PayoutsTab intentionally does not. (A durable chip_results-based store is the Phase G
  // direction, item 37.)
  async setPayoutPaid(id: number, key: string, paid: boolean): Promise<Record<string, boolean>> {
    const { data: cur, error: readErr } = await supabase
      .from("tournaments")
      .select("live_settings")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;
    const ls: any = (cur?.live_settings as any) ?? {};
    const next: Record<string, boolean> = { ...(ls.payoutsPaid ?? {}) };
    if (paid) next[key] = true;
    else delete next[key];
    const { error } = await supabase
      .from("tournaments")
      .update({ live_settings: { ...ls, payoutsPaid: next }, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return next;
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

  // Pure live_state setter (start/registration transitions). Completion and reopen
  // do NOT go through here — they route through tournamentService.completeTournament
  // / reopenTournament, the single source of truth for status + completed_at, so the
  // lifecycle fields can never drift. See use.chip.tournament.ts endTournament/reopen.
  async setLiveState(id: number, state: TournamentLiveState): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ live_state: state, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },

  // ── final placements (chip_results) ─────────────────────────────────────────
  // Idempotent: one row per (tournament, entry), upserted on Finish. Rewriting
  // the same placements is a no-op-equivalent (no duplicate rows).
  async saveResults(id: number, placements: ChipResultRow[]): Promise<void> {
    if (placements.length === 0) return;
    const rows = placements.map((p) => ({
      tournament_id: id,
      entry_id: p.entryId,
      place: p.place,
      team_name: p.teamName ?? null,
      p1_profile_id: p.p1ProfileId ?? null,
      p2_profile_id: p.p2ProfileId ?? null,
      // Always persist the stable identity when known (active AND pending). For a
      // pending player p1_profile_id is null and this uuid is the only link.
      p1_player_id: p.p1PlayerId ?? null,
      p2_player_id: p.p2PlayerId ?? null,
    }));
    const { error } = await supabase
      .from("chip_results")
      .upsert(rows, { onConflict: "tournament_id,entry_id" });
    if (error) throw error;
  },

  async loadResults(id: number): Promise<ChipResultRow[]> {
    const { data, error } = await supabase
      .from("chip_results")
      .select("*")
      .eq("tournament_id", id)
      .order("place", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      entryId: r.entry_id,
      place: r.place,
      teamName: r.team_name ?? null,
      p1ProfileId: r.p1_profile_id ?? null,
      p2ProfileId: r.p2_profile_id ?? null,
      p1PlayerId: r.p1_player_id ?? null,
      p2PlayerId: r.p2_player_id ?? null,
    }));
  },

  // Undo/reopen: drop this tournament's persisted placements so it can finish
  // fresh again.
  async clearResults(id: number): Promise<void> {
    const { error } = await supabase.from("chip_results").delete().eq("tournament_id", id);
    if (error) throw error;
  },

  async start(id: number, chip: ChipState): Promise<void> {
    await chipService.save(id, chip);
    // Going live makes the tournament PUBLIC-DISCOVERABLE: besides live_state, it
    // must satisfy the Billiards discovery rule (status="active", is_draft=false).
    // A chip created via the TD "New Tournament" draft flow starts is_draft=true;
    // if it reached "running" without a settings-save clearing that flag, it stayed
    // hidden from Billiards while still visible on Profile (participation-based).
    // Setting these here is the authoritative "started ⇒ public/active" invariant.
    const { error } = await supabase
      .from("tournaments")
      .update({
        live_state: "in_progress",
        status: "active",
        is_draft: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  },
};
