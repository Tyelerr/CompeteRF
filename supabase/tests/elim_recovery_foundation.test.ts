// supabase/tests/elim_recovery_foundation.test.ts
// Server-contract tests for supabase/migrations/20261018120000_elim_recovery_foundation.sql on a
// real Postgres (PGlite): the correction cascade (single + double elimination, losers drop,
// grand final + reset, withdrawals), revision protection, transactional audit, sanitized public
// activity, checkpoints + retention, dry-run parity and backward compatibility.
// Participants / winners / champions are read back with the APP's own resolver
// (buildLiveMatches / computeStandings), so the assertions are about what TDs actually see.
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_recovery_foundation.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { RaceConfig } from "../../src/utils/bracket.utils";
import { buildLiveMatches, computeEliminatedRegIds } from "../../src/utils/match.utils";
import { computeStandings } from "../../src/utils/tournament.stats";
import { MatchLiveState } from "../../src/models/types/tournament-settings.types";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const TD = "00000000-0000-0000-0000-000000000001";
const TD2 = "00000000-0000-0000-0000-000000000002";
const T = 10;
const CFG: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 }));

let db: any;
let graphDouble = true;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const asUser = (uid: string) => q("select set_config('test.uid', $1, false)", [uid]);
const call = async (ops: unknown[], extra: { atomic?: boolean; rev?: number | null; opId?: string | null; dry?: boolean } = {}) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, $3, $4, $5::uuid, $6) as r", [
    T, JSON.stringify(ops), extra.atomic ?? false, extra.rev ?? null, extra.opId ?? null, extra.dry ?? false,
  ]))[0].r;
const oldCall = async (ops: unknown[]) =>  // installed apps: 3 named args only
  (await q("select public.elim_live_apply(p_tournament_id => $1, p_ops => $2::jsonb, p_atomic => false) as r", [T, JSON.stringify(ops)]))[0].r;
const ms = async (): Promise<Record<string, MatchLiveState>> =>
  (await q("select live_settings->'matchState' m from public.tournaments where id = $1", [T]))[0].m ?? {};
const rev = async (): Promise<number> => Number((await q("select live_revision from public.tournaments where id = $1", [T]))[0].live_revision);
const count = async (table: string) => Number((await q(`select count(*)::int n from public.${table} where tournament_id = $1`, [T]))[0].n);
const bracket = (n: number) => ({ graph: buildBracketGraph(n, graphDouble), seeds: seeds(n) });
const reset = async (matchState: Record<string, MatchLiveState>, opts: { double?: boolean; n?: number } = {}) => {
  graphDouble = opts.double ?? true;
  await q("delete from public.tournament_audit where tournament_id = $1", [T]);
  await q("delete from public.elim_checkpoints where tournament_id = $1", [T]);
  await q("delete from public.tournament_events where tournament_id = $1", [T]);
  await q("update public.tournaments set live_settings = $2::jsonb, status = 'active', live_state = 'in_progress' where id = $1", [
    T, JSON.stringify({ bracket: { ...bracket(opts.n ?? 8), drawNumber: 1 }, matchState }),
  ]);
};
const W = (w: 1 | 2, extra: Partial<MatchLiveState> = {}): MatchLiveState =>
  ({ status: "completed", winner: w, result: "normal", completedAt: "2026-10-01T10:00:00.000Z", ...extra }) as MatchLiveState;
const setWinner = (matchId: string, w: 1 | 2, extra: Record<string, unknown> = {}) =>
  ({ op: "patch_match", matchId, set: { status: "completed", winner: w, result: "normal", ...extra } });
const RESET = { status: "scheduled", tableId: null, startedAt: null, completedAt: null, winner: null, p1Score: null, p2Score: null, result: null };

// The app's view of the bracket.
const live = (m: Record<string, MatchLiveState>, n = 8) => buildLiveMatches(bracket(n) as any, m, [], "9-ball", CFG);
const who = (m: Record<string, MatchLiveState>, id: string, n = 8) => {
  const x = live(m, n).find((y) => y.id === id)!;
  return { p1: x.p1RegId ?? null, p2: x.p2RegId ?? null, winner: x.winner == null ? null : x.winner === 1 ? x.p1RegId : x.p2RegId };
};
const champion = (m: Record<string, MatchLiveState>, n = 8) => computeStandings(live(m, n)).find((e) => e.place === 1)?.key ?? null;
// Play every playable match (slot 1 wins unless `pick` says otherwise) until nothing is left.
const playAll = (start: Record<string, MatchLiveState>, pick: (id: string) => 1 | 2 = () => 1, n = 8) => {
  const m = { ...start };
  for (let guard = 0; guard < 64; guard++) {
    const next = live(m, n).find((x) => !x.pending && !x.bye && !x.empty && !(x as { skipped?: boolean }).skipped && x.status !== "completed" && m[x.id]?.status !== "completed");
    if (!next) break;
    m[next.id] = W(pick(next.id));
  }
  return m;
};

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('test.uid', true), ''), '${TD}')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'in_progress' not null, live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz, completed_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int, status text default 'available' not null, label text not null default '');
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create table public.tournament_events (id text primary key, tournament_id bigint not null, type text not null, text text default '' not null,
      actor_id bigint, payload jsonb, tx_id text, created_at timestamptz default now() not null);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  await db.exec(cut(read("supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament"));
  await db.exec(read("supabase/migrations/20260922120000_elim_live_apply.sql"));
  await db.exec(read("supabase/migrations/20260923120000_elim_assign_notify.sql"));
  await db.exec(read("supabase/migrations/20260926120000_elim_clear_table.sql"));
  await db.exec(read("supabase/migrations/20261017120000_elim_server_guards.sql"));
  await db.exec(read("supabase/migrations/20261018120000_elim_recovery_foundation.sql"));
  await db.exec(readFileSync(join(ROOT, "supabase/migrations/20261021130000_elim_finish_redraw_recovery.sql"), "utf8")); // + latest recovery rules (20261021130000)
  await q(`insert into public.profiles values ('${TD}', 1, 'tournament_director'), ('${TD2}', 2, 'tournament_director')`);
  await q("insert into public.tournaments (id, venue_id, director_id, tournament_format) values ($1, 5, 1, 'double-elimination')", [T]);
  await q("insert into public.venue_directors values (5, 2, null)");
  await q("insert into public.tournament_tables values (71,$1,1,'available','Diamond'),(72,$1,2,'available',''),(73,$1,3,'available','')", [T]);
});
beforeEach(async () => { await asUser(TD); await reset({}); });

// ══ SINGLE ELIMINATION ═══════════════════════════════════════════════════════════════════
test("SE 1: change an early winner BEFORE any downstream result → nothing cleared", async () => {
  await reset({ W1M1: W(1), W1M2: W(1) }, { double: false });
  const r = await call([setWinner("W1M1", 2)]);
  assert.equal(r.results[0].ok, true);
  assert.deepEqual(r.cascade.reset, []);
  assert.equal(who(await ms(), "W2M1").p1, 2, "the corrected winner advances");
});

test("SE 2+3: change an early winner AFTER the next match was decided → that result is cleared, never re-attached", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1, { p1Score: 5, p2Score: 2, tableId: 71 }) }, { double: false });
  assert.equal(who(await ms(), "W2M1").winner, 1, "P1 had won the semifinal");
  const r = await call([setWinner("W1M1", 2)]);
  assert.deepEqual(r.cascade.cleared, ["W2M1"]);
  const m = await ms();
  const sf = who(m, "W2M1");
  assert.equal(sf.p1, 2, "P2 now sits in the semifinal");
  assert.equal(sf.winner, null, "…and is NOT credited with the win P1 played");
  assert.equal(m.W2M1.status, "scheduled");
  assert.equal(m.W2M1.p1Score, null);
  assert.equal(m.W2M1.tableId, null, "its table is released");
  assert.deepEqual(r.cascade.released, [71]);
});

test("SE 4: unaffected downstream results are preserved; the walk continues through cleared matches", async () => {
  const full = playAll({}, () => 1); // P1 champion
  await reset(full, { double: false });
  const r = await call([setWinner("W1M1", 2)]);
  const m = await ms();
  assert.deepEqual([...r.cascade.cleared].sort(), ["W2M1", "W3M1"], "semifinal + final cleared");
  for (const id of ["W1M2", "W1M3", "W1M4", "W2M2"]) assert.equal(m[id].status, "completed", `${id} preserved`);
  assert.equal(who(m, "W2M2").winner, 5, "the other semifinal keeps its winner");
});

test("SE 5: champion / standings recompute — no champion until the replayed final is recorded", async () => {
  const full = playAll({}, () => 1);
  await reset(full, { double: false });
  assert.equal(champion(full), "r1");
  await call([setWinner("W2M1", 2)]); // semifinal really won by P3
  let m = await ms();
  assert.equal(champion(m), null, "the old final no longer crowns anyone");
  assert.equal(who(m, "W3M1").p1, 3);
  await call([setWinner("W3M1", 1)]);
  m = await ms();
  assert.equal(champion(m), "r3", "the replayed final decides the new champion");
});

test("SE: same winner re-saved / score-only edit on a decided match → downstream untouched", async () => {
  const full = playAll({}, () => 1);
  await reset(full, { double: false });
  const r1 = await call([setWinner("W1M1", 1)]);
  const r2 = await call([{ op: "patch_match", matchId: "W1M1", set: { p1Score: 5, p2Score: 4 } }]);
  assert.deepEqual([r1.cascade.reset, r2.cascade.reset], [[], []]);
  assert.equal((await ms()).W3M1.status, "completed");
});

// ══ DOUBLE ELIMINATION ═══════════════════════════════════════════════════════════════════
test("DE 1-3: change a winners-side result → winner path AND the losers-bracket drop both follow", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1), L1M1: W(1) });
  const before = await ms();
  assert.deepEqual([who(before, "L1M1").p1, who(before, "L1M1").p2], [2, 4]);
  const r = await call([setWinner("W1M1", 2)]);
  const m = await ms();
  assert.deepEqual([...r.cascade.cleared].sort(), ["L1M1", "W2M1"]);
  assert.equal(who(m, "W2M1").p1, 2, "P2 advances on the winners side");
  assert.equal(who(m, "L1M1").p1, 1, "P1 now drops into the correct losers match");
  assert.equal(who(m, "L1M1").winner, null, "…without inheriting P2's losers-bracket win");
});

test("DE 4-5: only matches whose players changed are cleared; the rest of the bracket is preserved", async () => {
  const m0 = playAll({}, () => 1);
  await reset(m0);
  const r = await call([setWinner("W1M3", 2)]);
  const m = await ms();
  const resetSet = new Set<string>(r.cascade.reset);
  // W1M1 / W1M2 side of the bracket never involved P5/P6 → untouched.
  for (const id of ["W1M1", "W1M2", "W1M4", "L1M1"]) {
    assert.ok(!resetSet.has(id), `${id} not reset`);
    assert.equal(m[id].status, "completed", `${id} preserved`);
  }
  // Every remaining recorded result belongs to the players actually seated now.
  for (const x of live(m)) if (m[x.id]?.status === "completed") assert.ok(!x.pending, `${x.id} decided on known players`);
});

test("DE 6: second-loss elimination stays correct after a correction", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), L1M1: W(1) }); // P2 beat P4 → P4 out (2 losses? no: P4 lost W1M2 + L1M1)
  assert.ok(computeEliminatedRegIds(live(await ms())).includes(4), "P4 eliminated after two losses");
  await call([setWinner("W1M2", 2)]); // P4 actually won W1M2
  const elim = computeEliminatedRegIds(live(await ms()));
  assert.ok(!elim.includes(4), "P4 has one loss now → not eliminated");
  assert.ok(!elim.includes(3), "P3 dropped to losers with one loss → not eliminated");
  assert.equal((await ms()).L1M1.status, "scheduled", "the losers match with changed players is cleared");
});

test("DE 7: Grand Final participant change clears the GF (and GF2) result", async () => {
  const m0 = playAll({}, (id) => (id === "GF" ? 2 : 1)); // losers finalist wins GF → GF2 played
  await reset(m0);
  assert.equal(m0.GF2?.status, "completed", "GF2 was played");
  const wf = live(m0).find((x) => x.side === "winners" && !live(m0).some((y) => y.side === "winners" && y.round > x.round))!.id;
  const r = await call([setWinner(wf, 2)]); // the other finalist actually won the winners final
  const m = await ms();
  assert.ok(r.cascade.cleared.includes("GF"), "GF cleared");
  assert.ok(r.cascade.cleared.includes("GF2"), "GF2 cleared");
  assert.equal(champion(m), null, "no stale champion");
});

test("DE 8: GF reset — when GF is corrected to the winners finalist, a played GF2 can't keep its result", async () => {
  const m0 = playAll({}, (id) => (id === "GF" ? 2 : 1));
  await reset(m0);
  const r = await call([setWinner("GF", 1)]); // GF2 is no longer needed (skipped)
  const m = await ms();
  assert.deepEqual(r.cascade.cleared, ["GF2"]);
  assert.equal(m.GF2.status, "scheduled");
  assert.equal(m.GF2.winner, null);
  assert.equal(champion(m), "r1", "GF winner is champion");
});

test("DE: Reset Match / Reopen of an earlier match clears decided downstream matches too", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(2), L1M1: W(1) });
  const r = await call([{ op: "patch_match", matchId: "W1M1", set: RESET }]);
  assert.deepEqual([...r.cascade.cleared].sort(), ["L1M1", "W2M1"]);
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(2) });
  const r2 = await call([{ op: "patch_match", matchId: "W1M1", set: { status: "in_progress", winner: null, completedAt: null, result: null } }]);
  assert.deepEqual(r2.cascade.cleared, ["W2M1"], "reopen also clears");
});

test("DE: a withdrawal (no losers drop) clears the losers match its player can no longer be in", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), L1M1: W(1) }); // P2 played L1M1
  const r = await call([setWinner("W1M1", 1, { result: "withdraw" })]);
  assert.deepEqual(r.cascade.cleared, ["L1M1"]);
  const l1 = who(await ms(), "L1M1");
  assert.ok(l1.p1 !== 2 && l1.p2 !== 2, "P2 withdrew → P2 never drops into the losers bracket");
  assert.equal(l1.winner, null, "no inherited result");
});

// ══ IMPACT PREVIEW (dry run) ═════════════════════════════════════════════════════════════
test("dry run reports the exact cascade the real call applies, and writes nothing", async () => {
  const m0 = playAll({}, () => 1);
  await reset(m0);
  const r0 = await rev();
  const preview = await call([setWinner("W1M1", 2)], { dry: true });
  assert.equal(preview.dry_run, true);
  assert.equal(preview.revision, r0);
  assert.equal(await rev(), r0, "no revision bump");
  assert.deepEqual(await ms(), m0, "state unchanged");
  assert.deepEqual([await count("tournament_audit"), await count("elim_checkpoints")], [0, 0]);
  const real = await call([setWinner("W1M1", 2)], { rev: preview.revision });
  assert.deepEqual(real.cascade, preview.cascade, "preview == applied");
});

// ══ CONCURRENCY / REVISION ═══════════════════════════════════════════════════════════════
test("revision N succeeds; a second device still expecting N is refused — nothing written, no audit", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1) });
  const n = await rev();
  const a = await call([setWinner("W1M1", 2)], { rev: n, opId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(a.revision, n + 1, "revision incremented");
  const snapshot = await ms();
  const audits = await count("tournament_audit");
  const events = await count("tournament_events");
  await asUser(TD2);
  await assert.rejects(
    call([{ op: "patch_match", matchId: "W1M1", set: RESET }], { rev: n, opId: "22222222-2222-2222-2222-222222222222" }),
    (e: any) => e.message === "stale_revision" && String(e.detail ?? "") === String(n + 1),
  );
  assert.deepEqual(await ms(), snapshot, "no partial state");
  assert.equal(await count("tournament_audit"), audits, "no audit for the refused call");
  assert.equal(await count("tournament_events"), events, "no public activity for the refused call");
  assert.equal(await rev(), n + 1);
});

test("two TDs: the same expected revision can only win once (no silent overwrite)", async () => {
  await reset({ W1M1: W(1) });
  const n = await rev();
  await call([setWinner("W1M1", 2)], { rev: n });
  await asUser(TD2);
  await assert.rejects(call([setWinner("W1M1", 1)], { rev: n }), /stale_revision/);
  assert.equal((await ms()).W1M1.winner, 2);
});

test("revision is trigger-owned: every live write bumps it; a direct client update can't set or rewind it", async () => {
  const n = await rev();
  await q("update public.tournaments set live_settings = live_settings || '{\"queueOrder\":[]}'::jsonb where id = $1", [T]);
  assert.equal(await rev(), n + 1, "direct live_settings write (e.g. client draw) bumps");
  await q("update public.tournaments set live_revision = 0 where id = $1", [T]);
  assert.equal(await rev(), n + 1, "tamper ignored");
  await q("update public.tournaments set updated_at = now() where id = $1", [T]);
  assert.equal(await rev(), n + 1, "unrelated column → no bump");
});

// ══ AUDIT ════════════════════════════════════════════════════════════════════════════════
test("audit: one compact row per applied op, correct actor / tournament / match / label / cascade", async () => {
  await reset({ W1M1: W(1, { p1Score: 5, p2Score: 1 }), W1M2: W(1), W2M1: W(1) });
  await asUser(TD2);
  const r = await call([setWinner("W1M1", 2, { p1Score: 2, p2Score: 5 })], { opId: "33333333-3333-3333-3333-333333333333" });
  const rows = await q("select * from public.tournament_audit where tournament_id = $1", [T]);
  assert.equal(rows.length, 1, "exactly one row");
  const a = rows[0];
  assert.equal(a.actor_id, TD2);
  assert.equal(Number(a.tournament_id), T);
  assert.equal(a.match_id, "W1M1");
  assert.equal(a.op, "change_result");
  assert.equal(Number(a.revision), r.revision);
  assert.deepEqual([a.before.winner, a.after.winner, a.before.p1Score, a.after.p1Score], [1, 2, 5, 2]);
  assert.deepEqual(a.detail.cascade.cleared, ["W2M1"]);
  assert.ok(JSON.stringify(a).length < 1500, "compact (no full tournament JSON)");
  assert.ok(!("matchState" in a.before) && !("bracket" in (a.detail ?? {})));
});

test("audit: replaying the same op id writes nothing new (no duplicate event)", async () => {
  await reset({ W1M1: { status: "in_progress", tableId: 71, startedAt: "2026-10-01T09:00:00.000Z" } as any });
  const id = "44444444-4444-4444-4444-444444444444";
  const first = await call([setWinner("W1M1", 1)], { opId: id });
  const again = await call([setWinner("W1M1", 1)], { opId: id });
  assert.equal(again.replayed, true);
  assert.equal(again.revision, first.revision, "no second write");
  assert.equal(await count("tournament_audit"), 1);
  assert.equal(await count("tournament_events"), 1, "one public match_completed");
});

test("audit: an atomic call that fails rolls back BOTH state and audit", async () => {
  await reset({ W1M1: W(1) });
  const before = await ms();
  await assert.rejects(call([setWinner("W1M1", 2), { op: "assign", matchId: "W2M1", tableId: 71 }], { atomic: true, opId: "55555555-5555-5555-5555-555555555555" }));
  assert.deepEqual(await ms(), before);
  assert.deepEqual([await count("tournament_audit"), await count("tournament_events"), await count("elim_checkpoints")], [0, 0, 0]);
});

test("public activity is sanitized (names / table only) and only server-written for new clients", async () => {
  await reset({ W1M1: W(1, { tableId: 71 }), W1M2: W(1), W2M1: W(1) });
  await oldCall([setWinner("W1M1", 1)]); // re-save of the same result: no cascade
  assert.equal(await count("tournament_events"), 0, "old client: server leaves public activity to the app (no duplicates)");
  assert.equal(await count("tournament_audit"), 1, "…but the audit is still recorded");
  await call([setWinner("W1M1", 2)], { opId: "66666666-6666-6666-6666-666666666666" });
  const ev = await q("select type, actor_id, payload, tx_id from public.tournament_events where tournament_id = $1 order by type", [T]);
  const types = ev.map((e: any) => e.type);
  assert.deepEqual(types, ["bracket_corrected", "match_completed"]);
  const done = ev.find((e: any) => e.type === "match_completed");
  assert.equal(done.actor_id, null, "no actor exposed");
  assert.equal(done.payload.winnerName, "P2");
  assert.equal(done.payload.loserName, "P1");
  assert.equal(done.payload.tableLabel, "Diamond");
  for (const e of ev) for (const k of ["before", "after", "cascade", "actor", "checkpoint", "opId"]) assert.ok(!(k in e.payload), `${e.type} has no ${k}`);
});

// ══ CHECKPOINTS ══════════════════════════════════════════════════════════════════════════
test("checkpoint: destructive correction stores the PRE-change state; table assignment does not", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1) });
  const pre = await ms();
  await call([{ op: "assign", matchId: "W1M3", tableId: 72 }]);
  assert.equal(await count("elim_checkpoints"), 0, "no checkpoint for a simple assign");
  await call([setWinner("W1M1", 2)]);
  const cps = await q("select reason, milestone, match_id, state from public.elim_checkpoints where tournament_id = $1", [T]);
  assert.equal(cps.length, 1);
  assert.equal(cps[0].reason, "before_correction");
  assert.equal(cps[0].match_id, "W1M1");
  assert.equal(cps[0].state.matchState.W2M1.winner, pre.W2M1.winner, "pre-change downstream result kept for restore");
  assert.ok(!("bracket" in cps[0].state), "no bracket copy for an ordinary checkpoint");
});

test("retention: 30 rolling checkpoints; milestones kept; finishing trims rolling to 5", async () => {
  await reset({ W1M1: W(1) });
  for (let i = 0; i < 35; i++) await call([setWinner("W1M1", ((i % 2) + 1) as 1 | 2)]);
  assert.equal(Number((await q("select count(*) n from public.elim_checkpoints where tournament_id=$1 and not milestone", [T]))[0].n), 30);
  await q("update public.tournaments set status = 'completed' where id = $1", [T]);
  const rows = await q("select milestone, reason from public.elim_checkpoints where tournament_id = $1", [T]);
  assert.equal(rows.filter((r: any) => !r.milestone).length, 5, "completed → 5 rolling");
  assert.ok(rows.some((r: any) => r.milestone && r.reason === "finished"), "finish milestone");
});

test("milestones: before redraw (keeps the old bracket); first start; no tournament is ever cloned", async () => {
  await reset({ W1M1: W(1) });
  const tCount = Number((await q("select count(*) n from public.tournaments"))[0].n);
  await q("update public.tournaments set live_settings = jsonb_set(live_settings, '{bracket,drawNumber}', '2') where id = $1", [T]);
  const cp = (await q("select * from public.elim_checkpoints where tournament_id=$1 and reason='before_redraw'", [T]))[0];
  assert.equal(cp.milestone, true);
  assert.equal(cp.state.bracket.drawNumber, 1, "previous bracket kept");
  assert.equal(cp.state.matchState.W1M1.winner, 1);
  await q("update public.tournaments set live_state = 'registration_closed' where id = $1", [T]);
  await call([{ op: "assign", matchId: "W1M2", tableId: 72, start: true }]);
  assert.ok((await q("select 1 from public.elim_checkpoints where tournament_id=$1 and reason='tournament_started' and milestone", [T])).length);
  assert.equal(Number((await q("select count(*) n from public.tournaments"))[0].n), tCount, "one authoritative tournament");
});

// ══ BACKWARD COMPATIBILITY ═══════════════════════════════════════════════════════════════
test("old-style payload (no revision / op id / dry run) still works — and still cascades", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1) });
  const r = await oldCall([setWinner("W1M1", 2)]);
  assert.equal(r.results[0].ok, true);
  assert.deepEqual(r.cascade.cleared, ["W2M1"], "the correctness fix protects old clients too");
});

test("new payload gets stale-revision protection; existing per-op expect still enforced", async () => {
  await reset({ W1M1: W(1) });
  const n = await rev();
  await assert.rejects(call([setWinner("W1M1", 2)], { rev: n - 1 }), /stale_revision/);
  const r = await call([{ ...setWinner("W1M1", 2), expect: { status: "in_progress" } }], { rev: n });
  assert.equal(r.results[0].error, "stale_state");
});

test("privileges: TDs can call elim_live_apply; anon can't; internal helpers and tables aren't writable", async () => {
  const [p] = await q(`select
    has_function_privilege('authenticated', 'public.elim_live_apply(bigint, jsonb, boolean, bigint, uuid, boolean)', 'execute') as td,
    has_function_privilege('anon', 'public.elim_live_apply(bigint, jsonb, boolean, bigint, uuid, boolean)', 'execute') as anon,
    has_function_privilege('authenticated', 'public._elim_cascade(jsonb, jsonb, jsonb)', 'execute') as casc,
    has_function_privilege('authenticated', 'public._elim_checkpoint(bigint, bigint, text, text, text, boolean, jsonb, boolean)', 'execute') as ckpt,
    has_table_privilege('authenticated', 'public.tournament_audit', 'insert') as audit_ins,
    has_table_privilege('authenticated', 'public.elim_checkpoints', 'insert') as ckpt_ins,
    has_table_privilege('anon', 'public.tournament_audit', 'select') as anon_audit`);
  assert.deepEqual(p, { td: true, anon: false, casc: false, ckpt: false, audit_ins: false, ckpt_ins: false, anon_audit: false });
});
