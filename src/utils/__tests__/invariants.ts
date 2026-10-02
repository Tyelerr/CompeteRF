// src/utils/__tests__/invariants.ts
// Reusable tournament-state invariants for tests and simulations (not a test file itself).
// Every simulation asserts these instead of re-implementing them. Each throws an
// AssertionError whose message carries `ctx` (put the reproducible seed in it).
/// <reference types="node" />

import assert from "node:assert/strict";
import { ChipState } from "../../models/types/chip.types";
import { computeEliminatedRegIds, LiveMatch } from "../match.utils";
import { computeStandings } from "../tournament.stats";

// ── Elimination ─────────────────────────────────────────────────────────────────────────────
export interface ElimInvariantOpts {
  // Registration ids that belong to THIS tournament (cross-tournament isolation).
  field?: Set<number>;
  // Table ids that belong to THIS tournament.
  tables?: Set<number>;
}

export const assertElimInvariants = (matches: LiveMatch[], ctx: string, opts: ElimInvariantOpts = {}) => {
  const elim = new Set(computeEliminatedRegIds(matches));
  const tableUse = new Map<number, string>();
  const playerUse = new Map<number, string>();
  for (const m of matches) {
    for (const r of [m.p1RegId, m.p2RegId])
      if (r != null && opts.field) assert.ok(opts.field.has(r), `${ctx}: foreign entrant ${r} in ${m.id}`);
    if (m.tableId != null && opts.tables) assert.ok(opts.tables.has(m.tableId), `${ctx}: foreign table ${m.tableId} on ${m.id}`);
    if (m.status === "completed" || m.bye || m.empty) continue;
    // one active match per table
    if (m.tableId != null) {
      assert.ok(!tableUse.has(m.tableId), `${ctx}: table ${m.tableId} double-booked (${tableUse.get(m.tableId)} + ${m.id})`);
      tableUse.set(m.tableId, m.id);
    }
    if (m.status !== "in_progress") continue;
    assert.ok(!m.pending, `${ctx}: ${m.id} live with an unknown player`);
    for (const r of [m.p1RegId, m.p2RegId]) {
      if (r == null) continue;
      // one active match per player; eliminated players never play
      assert.ok(!playerUse.has(r), `${ctx}: player ${r} in two live matches (${playerUse.get(r)} + ${m.id})`);
      playerUse.set(r, m.id);
      assert.ok(!elim.has(r), `${ctx}: eliminated player ${r} live in ${m.id}`);
    }
  }
  // standings unique, at most one champion
  const st = computeStandings(matches);
  assert.equal(new Set(st.map((e) => e.key)).size, st.length, `${ctx}: duplicate standings rows`);
  assert.ok(st.filter((e) => e.place === 1).length <= 1, `${ctx}: more than one champion`);
  return { eliminated: elim, standings: st };
};

// ── Chip ────────────────────────────────────────────────────────────────────────────────────
export interface ChipInvariantOpts {
  // Without Undo/restore in the history, chips lost must equal finished matches.
  chipsConserved?: boolean;
  // Entry ids that belong to THIS tournament (cross-tournament isolation).
  field?: Set<string>;
}

// Everyone seated at a table: holder, pending challenger, and both sides of its live match.
export const chipSeatedIds = (s: ChipState): string[] => {
  const out: string[] = [];
  for (const t of s.tables) {
    if (t.holderId) out.push(t.holderId);
    if (t.pendingChallengerId) out.push(t.pendingChallengerId);
    const m = t.matchId ? s.matches.find((x) => x.id === t.matchId) : null;
    if (m) for (const id of [m.aId, m.bId]) if (id !== t.holderId && id !== t.pendingChallengerId) out.push(id);
  }
  return out;
};

export const assertChipInvariants = (s: ChipState, ctx: string, opts: ChipInvariantOpts = {}) => {
  const field = s.entries.filter((e) => e.checkedIn);
  const live = s.matches.filter((m) => m.status === "in_progress");
  if (opts.field) {
    for (const e of s.entries) assert.ok(opts.field.has(e.id), `${ctx}: foreign entry ${e.id}`);
    for (const id of s.queue) assert.ok(opts.field.has(id), `${ctx}: foreign queued entry ${id}`);
  }
  for (const e of field) {
    // chips >= 0, integer; zero chips ⇒ eliminated (unless mid-match)
    assert.ok(Number.isInteger(e.chips) && e.chips >= 0, `${ctx}: bad chips ${e.chips} on ${e.id}`);
    if (e.status === "eliminated") assert.equal(e.chips, 0, `${ctx}: eliminated ${e.id} holds ${e.chips} chips`);
    else if (!s.winnerId)
      assert.ok(e.chips > 0 || live.some((m) => m.aId === e.id || m.bId === e.id), `${ctx}: ${e.id} alive with 0 chips and not playing`);
  }
  // queue no duplicates; a team appears in one place only; no team seated twice
  assert.equal(new Set(s.queue).size, s.queue.length, `${ctx}: duplicate queue entry`);
  const seated = chipSeatedIds(s);
  assert.equal(new Set(seated).size, seated.length, `${ctx}: entry seated twice ${JSON.stringify(seated)}`);
  for (const id of s.queue) assert.ok(!seated.includes(id), `${ctx}: ${id} both queued and seated`);
  // no table has more than one active match; a live match sits on its table
  const perTable = new Map<string, number>();
  for (const m of live) {
    perTable.set(m.tableId, (perTable.get(m.tableId) ?? 0) + 1);
    assert.ok(s.tables.find((t) => t.id === m.tableId)?.matchId === m.id, `${ctx}: live match ${m.id} not on its table`);
  }
  for (const [tid, c] of perTable) assert.equal(c, 1, `${ctx}: table ${tid} has ${c} live matches`);
  // eliminated not queued / seated; alive never lost
  const byId = new Map(s.entries.map((e) => [e.id, e]));
  for (const id of [...s.queue, ...seated]) assert.notEqual(byId.get(id)?.status, "eliminated", `${ctx}: eliminated ${id} still in play`);
  if (!s.winnerId) {
    const where = new Set([...s.queue, ...seated]);
    for (const e of field) if (e.status !== "eliminated") assert.ok(where.has(e.id), `${ctx}: alive ${e.id} lost (not queued, not seated)`);
  }
  // finished matches correspond to chip losses
  if (opts.chipsConserved) {
    const lost = field.reduce((a, e) => a + (e.startChips - e.chips), 0);
    const finished = s.matches.filter((m) => m.status === "finished").length;
    assert.equal(lost, finished, `${ctx}: chips lost ${lost} != finished matches ${finished}`);
  }
};
