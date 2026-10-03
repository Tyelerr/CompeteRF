// supabase/tests/elim_finish_redraw_recovery.test.ts
// Server-contract tests for supabase/migrations/20261021130000_elim_finish_redraw_recovery.sql:
//   A — a correction on a FINISHED elimination event that leaves the bracket without a complete
//       champion path reopens the event in the same transaction (atomic, one revision, audited);
//       a correction that keeps the bracket complete leaves it finished.
//   B — Undo never crosses a bracket draw: it only targets audit rows stamped with the CURRENT
//       draw identity (server-owned, md5 of the bracket); Restore deliberately crosses draws, and
//       undoing a cross-draw Restore brings its bracket back with it.
// Real Postgres (PGlite) with the elimination migration chain loaded. Participants / champions are
// read back with the APP's resolver (buildLiveMatches / computeStandings).
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_finish_redraw_recovery.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { RaceConfig } from "../../src/utils/bracket.utils";
import { buildLiveMatches } from "../../src/utils/match.utils";
import { computeStandings } from "../../src/utils/tournament.stats";
import { MatchLiveState } from "../../src/models/types/tournament-settings.types";

const ROOT = join(__dirname, "..", "..");
const mig = (f: string) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
const FIX = "20261021130000_elim_finish_redraw_recovery.sql";
const HAS_FIX = existsSync(join(ROOT, "supabase/migrations", FIX)) && process.env.ELIM_FIX !== "0";
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const TD = "00000000-0000-0000-0000-000000000001";
const TD2 = "00000000-0000-0000-0000-000000000002";
const T = 10;
const CFG: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const asUser = (uid: string) => q("select set_config('test.uid', $1, false)", [uid]);

// ── bracket fixtures ─────────────────────────────────────────────────────────────────────────
type Br = { graph: any; seeds: any[]; drawNumber: number; generatedAt: string; bracketSize: number; players: number };
const mkBracket = (n: number, dbl: boolean, drawNumber: number, order: number[] = [...Array(n).keys()]): Br => ({
  graph: buildBracketGraph(n, dbl),
  seeds: order.map((i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 })),
  drawNumber,
  generatedAt: `2026-10-0${drawNumber}T10:00:00.000Z`,
  bracketSize: n,
  players: n,
});
let cur: Br;
const ls = async () => (await q("select live_settings l from public.tournaments where id = $1", [T]))[0].l;
const ms = async (): Promise<Record<string, MatchLiveState>> => (await ls()).matchState ?? {};
const row = async () => (await q("select status, live_state, completed_at, live_revision from public.tournaments where id = $1", [T]))[0];
const rev = async (): Promise<number> => Number((await row()).live_revision);
const live = (b: Br, m: Record<string, MatchLiveState>) => buildLiveMatches(b as any, m, [], "9-ball", CFG);
const champion = (b: Br, m: Record<string, MatchLiveState>) => computeStandings(live(b, m)).find((e) => e.place === 1)?.key ?? null;
const call = async (ops: unknown[], extra: { rev?: number | null; dry?: boolean } = {}) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, false, $3, $4::uuid, $5) as r", [
    T, JSON.stringify(ops), extra.rev ?? null, crypto.randomUUID(), extra.dry ?? false,
  ]))[0].r;
// The OLD 3-argument call shape (pre-recovery clients): no revision, no op id.
const callOld = async (ops: unknown[]) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, false) as r", [T, JSON.stringify(ops)]))[0].r;
const setWinner = (matchId: string, w: 1 | 2, extra: Record<string, unknown> = {}) =>
  ({ op: "patch_match", matchId, set: { status: "completed", winner: w, result: "normal", p1Score: 5, p2Score: 2, ...extra } });
const undo = async (r: number | null, dry = false) => (await q("select public.elim_undo($1, $2, $3) as r", [T, r, dry]))[0].r;
const undoErr = async (): Promise<string> => {
  try { await undo(await rev()); return "ok"; } catch (e: any) { return `${e.message}:${e.detail ?? ""}`; }
};
const restore = async (ck: number, r: number | null) => (await q("select public.elim_restore($1, $2, $3, false) as r", [T, ck, r]))[0].r;
const audits = async (): Promise<any[]> => await q("select id, op, match_id, detail from public.tournament_audit where tournament_id = $1 order by id", [T]);

// Fresh event with bracket `b`, matchState `m`, live.
const reset = async (b: Br, m: Record<string, MatchLiveState> = {}, state: { status?: string; live?: string } = {}) => {
  cur = b;
  await q("update public.tournaments set tournament_format = $5, live_settings = $2::jsonb, status = $3, live_state = $4, completed_at = null where id = $1", [
    T, JSON.stringify({ bracket: b, matchState: m, drawLog: [{ drawNumber: b.drawNumber }] }), state.status ?? "active", state.live ?? "in_progress",
    b.graph.some((x: any) => x.side === "losers") ? "double-elimination" : "single-elimination",
  ]);
  // AFTER the update: replacing the previous event's bracket makes the revision trigger save a
  // 'before redraw' checkpoint (and the draw audit) of the OLD event — clear those too.
  await q("delete from public.tournament_audit where tournament_id = $1", [T]);
  await q("delete from public.elim_checkpoints where tournament_id = $1", [T]);
  await q("delete from public.tournament_events where tournament_id = $1", [T]);
};
// A TD's redraw = the client's whole-blob UPDATE (new bracket, matchState cleared).
const redraw = async (b: Br) => {
  cur = b;
  const l = await ls();
  await q("update public.tournaments set live_settings = $2::jsonb, live_state = 'registration_closed' where id = $1", [
    T, JSON.stringify({ ...l, bracket: b, matchState: {}, drawLog: [...(l.drawLog ?? []), { drawNumber: b.drawNumber, reason: "test" }] }),
  ]);
};
// Play every playable match through the real RPC until nothing is left; winner picker per match.
const playOut = async (pick: (id: string) => 1 | 2 = () => 1) => {
  for (let guard = 0; guard < 300; guard++) {
    const m = live(cur, await ms()).find((x) => !x.bye && !x.empty && !x.pending && x.status !== "completed" && x.p1RegId != null && x.p2RegId != null);
    if (!m) return;
    const r = await call([setWinner(m.id, pick(m.id))]);
    assert.equal(r.results[0].ok, true, `play ${m.id}: ${JSON.stringify(r.results[0])}`);
  }
};
const finish = async () => q("update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = $1", [T]);
const isFinished = async () => { const r = await row(); return r.status === "completed" && r.live_state === "finished" && r.completed_at != null; };
const isLiveAgain = async () => { const r = await row(); return r.status === "active" && r.live_state === "in_progress" && r.completed_at == null; };

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions; create schema net; create schema vault; create schema cron;
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('test.uid', true), ''), '${TD}')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'not_started' not null, is_paused boolean default false,
      game_type text default '9-ball', live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz, completed_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int, status text default 'available' not null, label text not null default '');
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create table public.tournament_events (id text primary key, tournament_id bigint not null, type text not null, text text default '' not null,
      actor_id bigint, payload jsonb, tx_id text, created_at timestamptz default clock_timestamp() not null);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.net_calls (id serial primary key, body jsonb);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
    language sql as $$ insert into public.net_calls (body) values (body) returning id::bigint $$;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as
      $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as
      $$ with d as (delete from cron.job where jobid = id returning 1) select exists (select 1 from d) $$;
  `);
  await db.exec(cut(mig("20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament"));
  for (const f of ["20260922120000_elim_live_apply.sql", "20260923120000_elim_assign_notify.sql"]) await db.exec(mig(f));
  await db.exec(mig("20260924120000_elim_auto_assign_server.sql").replace(/^create extension if not exists pg_net with schema extensions;$/m, "-- (pg_net stubbed)"));
  for (const f of ["20260926120000_elim_clear_table.sql", "20261017120000_elim_server_guards.sql", "20261018120000_elim_recovery_foundation.sql",
                   "20261019120000_elim_undo_restore.sql", "20261020120000_elim_audit_autoassign_draw.sql"]) await db.exec(mig(f));
  if (HAS_FIX) await db.exec(mig(FIX));
  else {
    // Baseline runs (ELIM_FIX=0): only the two PURE helpers the fuzz invariants read — no behavior change.
    const src = mig(FIX);
    await db.exec(cut(src, 'create or replace function public._elim_draw_key('));
    await db.exec(cut(src, 'create or replace function public._elim_bracket_complete('));
  }
  await q(`insert into public.profiles values ('${TD}', 1, 'tournament_director'), ('${TD2}', 2, 'tournament_director')`);
  await q(`insert into public.tournaments (id, venue_id, director_id, tournament_format) values (${T}, 5, 1, 'double-elimination')`);
  await q("insert into public.venue_directors values (5, 2, null)");
  await q("insert into public.tournament_tables values (71,$1,1,'available','Diamond'),(72,$1,2,'available',''),(73,$1,3,'available','')", [T]);
});
beforeEach(async () => { await asUser(TD); });

// ══ A — correction after Finish ═══════════════════════════════════════════════════════════════
test("A1 Single: finished → correct a first-round result → downstream cleared AND the event reopens (atomic, +1 revision)", async () => {
  await reset(mkBracket(8, false, 1));
  await playOut();
  await finish();
  const champ0 = champion(cur, await ms());
  const r0 = await rev();
  const lastId = Math.max(0, ...(await audits()).map((x) => Number(x.id)));
  const res = await call([setWinner("W1M1", 2)], { rev: r0 });
  assert.equal(res.results[0].ok, true, JSON.stringify(res.results));
  assert.deepEqual([...res.cascade.reset].sort(), ["W2M1", "W3M1"], "only the matches whose players changed");
  assert.ok(await isLiveAgain(), `reopened: ${JSON.stringify(await row())}`);
  assert.equal(await rev(), r0 + 1, "exactly one revision bump");
  assert.equal(res.reopened, true);
  const m = await ms();
  assert.equal(m.W1M2.status, "completed", "unaffected results kept");
  assert.equal(champion(cur, m), null, "no stale champion");
  const a = (await audits()).filter((x) => Number(x.id) > lastId);
  assert.equal(a.length, 1, "one audit row for the correction");
  assert.equal(a[0].detail.reopened, true, "the reopen is recorded on the correction row");
  // replay → champion → finish again
  await playOut();
  assert.ok(champion(cur, await ms()) != null);
  await finish();
  assert.ok(await isFinished());
  assert.notEqual(champ0, null);
});

test("A3 Single: finished → corrections that keep a complete champion path stay finished", async () => {
  await reset(mkBracket(8, false, 1));
  await playOut();
  await finish();
  // flip the FINAL: nothing downstream, champion changes, bracket still complete
  let res = await call([setWinner("W3M1", 2)], { rev: await rev() });
  assert.equal(res.results[0].ok, true);
  assert.ok(await isFinished(), "final correction keeps the event finished");
  assert.notEqual(res.reopened, true);
  // score-only correction on an early match: winner unchanged
  res = await call([{ op: "patch_match", matchId: "W1M2", set: { p1Score: 5, p2Score: 4 } }], { rev: await rev() });
  assert.equal(res.results[0].ok, true);
  assert.ok(await isFinished(), "score-only correction keeps the event finished");
});

test("A2 Double: winners / losers / hotseat / losers-final corrections reopen; GF2 becoming required reopens", async () => {
  for (const id of ["W1M1", "L1M1", "W3M1", "L4M1"]) {
    await reset(mkBracket(8, true, 1));
    await playOut();
    await finish();
    const before = await ms();
    const w = (before[id].winner === 1 ? 2 : 1) as 1 | 2;
    const res = await call([setWinner(id, w)], { rev: await rev() });
    assert.equal(res.results[0].ok, true, `${id}: ${JSON.stringify(res.results)}`);
    assert.ok(res.cascade.reset.length > 0, `${id}: something downstream changed`);
    assert.ok(await isLiveAgain(), `${id}: reopened`);
    assert.equal(champion(cur, await ms()), null, `${id}: no stale champion`);
    await playOut();
    assert.ok(champion(cur, await ms()) != null, `${id}: playable to a champion again`);
    await finish();
    assert.ok(await isFinished(), `${id}: re-finished`);
  }
  // Finals won by the winners-side finalist (no 2nd set) → correct Finals to the losers-side
  // finalist: Finals (2nd Set) is now REQUIRED and unplayed → reopen (no cascade reset needed).
  await reset(mkBracket(8, true, 1));
  await playOut(() => 1);
  await finish();
  assert.equal((await ms()).GF.winner, 1);
  const res = await call([setWinner("GF", 2)], { rev: await rev() });
  assert.equal(res.results[0].ok, true);
  assert.ok(await isLiveAgain(), "GF2 now required → reopened");
  const gf2 = live(cur, await ms()).find((x) => x.id === "GF2")!;
  assert.ok(!gf2.bye && !gf2.empty && gf2.status !== "completed", "Finals (2nd Set) is playable");
  await playOut();
  await finish();
  assert.ok(await isFinished());
  // Finals (2nd Set) played → correct it: champion changes, bracket still complete → stays finished
  const r2 = await call([setWinner("GF2", (await ms()).GF2.winner === 1 ? 2 : 1)], { rev: await rev() });
  assert.equal(r2.results[0].ok, true);
  assert.ok(await isFinished(), "GF2 correction keeps a complete champion path");
});

test("A2b Double: old 3-argument clients get the same reopen (server rule, not client)", async () => {
  await reset(mkBracket(8, true, 1));
  await playOut();
  await finish();
  const res = await callOld([setWinner("W1M1", 2)]);
  assert.equal(res.results[0].ok, true);
  assert.ok(await isLiveAgain(), "old call shape cannot leave a finished-but-incomplete event");
});

test("A4: Undo of the reopening correction restores the complete bracket; the event can be finished again", async () => {
  await reset(mkBracket(8, true, 1));
  await playOut();
  await finish();
  const m0 = await ms();
  const champ0 = champion(cur, m0);
  await call([setWinner("W1M1", 2)], { rev: await rev() });
  assert.ok(await isLiveAgain());
  const u = await undo(await rev());
  assert.equal(u.ok, true);
  const m1 = await ms();
  for (const id of Object.keys(m0)) assert.equal(m1[id]?.winner ?? null, m0[id]?.winner ?? null, `${id} result back`);
  assert.equal(champion(cur, m1), champ0, "same champion as before the correction");
  await finish();
  assert.ok(await isFinished());
});

test("A5 multi-TD: a stale device cannot correct, re-finish or undo over a newer reopen", async () => {
  await reset(mkBracket(8, true, 1));
  await playOut();
  await finish();
  const rA = await rev();                    // TD A loaded the finished event
  await asUser(TD2);
  await call([setWinner("W1M1", 2)], { rev: rA }); // TD B's correction reopens it
  assert.ok(await isLiveAgain());
  const after = { ms: await ms(), rev: await rev() };
  await asUser(TD);
  await assert.rejects(call([setWinner("W1M2", 2)], { rev: rA }), /stale_revision/, "stale correction refused");
  // stale Finish (the app's revision-checked update) matches no row
  const fin = await q("update public.tournaments set status = 'completed', live_state = 'finished' where id = $1 and live_revision = $2 returning id", [T, rA]);
  assert.equal(fin.length, 0, "stale finish writes nothing");
  await assert.rejects(undo(rA), /stale_revision/, "stale undo refused");
  assert.deepEqual(await ms(), after.ms, "TD B's correction intact");
  assert.equal(await rev(), after.rev);
  assert.ok(await isLiveAgain());
  // two corrections from the same revision: exactly one lands
  const r1 = await rev();
  const ok1 = await call([setWinner("W1M3", 2)], { rev: r1 });
  assert.equal(ok1.results[0].ok, true);
  await assert.rejects(call([setWinner("W1M4", 2)], { rev: r1 }), /stale_revision/);
});

// ══ B — Undo never crosses a redraw ═══════════════════════════════════════════════════════════
const undoAll = async (max = 20) => {
  const done: string[] = [];
  for (let i = 0; i < max; i++) {
    const pre = await undo(null, true);
    if (!pre.available) return { done, reason: pre.reason as string };
    const r = await undo(await rev());
    done.push(`${r.undone.op}:${r.undone.matchId ?? ""}`);
  }
  return { done, reason: "loop" };
};

test("B1: Undo stops at the redraw — never touches an action from the previous draw", async () => {
  await reset(mkBracket(8, false, 1));
  await call([setWinner("W1M1", 1)]);
  await call([{ op: "assign", matchId: "W1M2", tableId: 72 }]);
  await call([{ op: "patch_match", matchId: "W1M3", set: { p1Score: 2, p2Score: 1 } }]);
  await redraw(mkBracket(8, false, 2, [7, 6, 5, 4, 3, 2, 1, 0]));
  await q("update public.tournaments set live_state = 'in_progress' where id = $1", [T]);
  await call([{ op: "patch_match", matchId: "W1M4", set: { p1Score: 1, p2Score: 0 } }]);
  await call([setWinner("W1M1", 2)]);
  const draw2 = await ms();
  const { done, reason } = await undoAll();
  assert.deepEqual(done, ["set_winner:W1M1", "score:W1M4"], "only Draw 2 actions undone");
  assert.equal(reason, "draw_boundary", "Undo reports the redraw boundary");
  const m = await ms();
  assert.equal(m.W1M2?.tableId ?? null, null, "Draw 1 table assignment NOT re-applied to Draw 2");
  assert.equal(m.W1M3?.p1Score ?? null, null, "Draw 1 score NOT re-applied to Draw 2");
  assert.ok(Object.keys(draw2).length > 0);
});

test("B1b: an old-draw action whose 'after' matches the new draw is still never applied to it", async () => {
  // Draw 1: assign W1M2 to table 72, then clear it (after = Waiting, no table). Draw 2's W1M2 is
  // also Waiting with no table — before the fix, Undo picked the Draw 1 'unassign' and put table
  // 72 back onto Draw 2's W1M2 (different players).
  await reset(mkBracket(8, false, 1));
  await call([{ op: "assign", matchId: "W1M2", tableId: 72 }]);
  await call([{ op: "unassign", matchId: "W1M2" }]);
  await redraw(mkBracket(8, false, 2, [7, 6, 5, 4, 3, 2, 1, 0]));
  const pre = await undo(null, true);
  assert.equal(pre.available, false, `nothing from Draw 1 is offered: ${JSON.stringify(pre.undoing ?? null)}`);
  await assert.rejects(undo(await rev()), /undo_unavailable/);
  assert.equal((await ms()).W1M2?.tableId ?? null, null, "Draw 2's W1M2 untouched");
});

test("B2: multiple redraws — Undo stays inside the latest draw", async () => {
  await reset(mkBracket(8, false, 1));
  await call([setWinner("W1M1", 1)]);
  await redraw(mkBracket(8, false, 2, [1, 0, 3, 2, 5, 4, 7, 6]));
  await call([setWinner("W1M2", 1)]);
  await redraw(mkBracket(8, false, 3, [7, 6, 5, 4, 3, 2, 1, 0]));
  await call([setWinner("W1M3", 2)]);
  const { done, reason } = await undoAll();
  assert.deepEqual(done, ["set_winner:W1M3"]);
  assert.equal(reason, "draw_boundary");
  assert.equal((await ms()).W1M2?.status ?? "scheduled", "scheduled", "Draw 2 result never reaches Draw 3");
});

test("B3+B4: Restore 'Before redraw' crosses draws deliberately; Undo then follows the restored draw", async () => {
  const d1 = mkBracket(8, false, 1);
  await reset(d1);
  await call([setWinner("W1M1", 1)]);
  await call([setWinner("W1M2", 2)]);
  const draw1ms = await ms();
  const d2 = mkBracket(8, false, 2, [7, 6, 5, 4, 3, 2, 1, 0]);
  await redraw(d2);
  await call([setWinner("W1M3", 1)]);
  const draw2ms = await ms();
  const ck = (await q("select id from public.elim_checkpoints where tournament_id = $1 and reason = 'before_redraw' order by id desc limit 1", [T]))[0].id;
  const r0 = await rev();
  const rr = await restore(ck, r0);
  assert.equal(rr.ok, true);
  assert.ok(await rev() > r0, "revision advances");
  let l = await ls();
  assert.equal(l.bracket.drawNumber, 1, "Draw 1 bracket restored");
  assert.deepEqual(l.matchState, draw1ms, "Draw 1 results restored");
  cur = d1;
  // Undo now: only the Restore itself (never a Draw 2 action onto Draw 1)
  const pre = await undo(null, true);
  assert.equal(pre.available, true);
  assert.equal(pre.undoing.op, "restore");
  const u = await undo(await rev());
  assert.equal(u.ok, true);
  l = await ls();
  assert.equal(l.bracket.drawNumber, 2, "undoing a cross-draw Restore brings its bracket back too");
  assert.deepEqual(l.matchState, draw2ms, "…with Draw 2's own results");
  cur = d2;
  const { done, reason } = await undoAll();
  assert.deepEqual(done, ["set_winner:W1M3"], "then only Draw 2 actions");
  assert.equal(reason, "draw_boundary");
});

test("B4b: after a cross-draw Restore, new play on the restored draw is undoable; the abandoned draw never is", async () => {
  const d1 = mkBracket(8, false, 1);
  await reset(d1);
  await call([setWinner("W1M1", 1)]);
  await redraw(mkBracket(8, false, 2, [7, 6, 5, 4, 3, 2, 1, 0]));
  await call([setWinner("W1M4", 1)]);
  const ck = (await q("select id from public.elim_checkpoints where tournament_id = $1 and reason = 'before_redraw' order by id desc limit 1", [T]))[0].id;
  await restore(ck, await rev());
  cur = d1;
  await call([setWinner("W1M2", 2)]);         // new play on the restored Draw 1
  const first = await undo(await rev());
  assert.equal(`${first.undone.op}:${first.undone.matchId}`, "set_winner:W1M2");
  const pre = await undo(null, true);         // next: the Restore — refused (things changed since)
  assert.equal(pre.undoing.op, "restore");
  assert.equal(pre.available, false);
  const m = await ms();
  assert.equal(m.W1M4?.status ?? "scheduled", "scheduled", "Draw 2's W1M4 result never applied to Draw 1");
});

test("B5: a stale revision cannot bypass the boundary (or anything else)", async () => {
  await reset(mkBracket(8, false, 1));
  await call([setWinner("W1M1", 1)]);
  const old = await rev();
  await redraw(mkBracket(8, false, 2, [7, 6, 5, 4, 3, 2, 1, 0]));
  await assert.rejects(undo(old), /stale_revision/);
  assert.match(await undoErr(), /undo_unavailable:draw_boundary/);
});

test("B6: undo rows record the draw identity; legacy rows without it are never undone", async () => {
  await reset(mkBracket(8, false, 1));
  await call([setWinner("W1M1", 1)]);
  const a = (await audits()).filter((x) => x.op === "set_winner");
  assert.match(String(a[0].detail.drawKey ?? ""), /^[0-9a-f]{32}$/, "server stamps the draw identity");
  await q("update public.tournament_audit set detail = detail - 'drawKey' where tournament_id = $1", [T]); // simulate a pre-migration row
  const pre = await undo(null, true);
  assert.equal(pre.available, false, "legacy row: fail safe");
});

// ══ Randomized: draws, play, corrections, Finish, Undo, Redraw, Restore, stale writes ══════════
// Invariants after EVERY operation:
//   I1 a finished event always has a complete champion path (server rule + app resolver agree)
//   I2 Undo never crosses a draw: the undone row's drawKey is the current one; the bracket only
//      changes when the undone op was a Restore
//   I3 every recorded result sits on a pairing that was actually played (no result re-attached
//      to different participants), per draw
//   I4 no table holds two live / assigned matches
//   I5 a stale-revision write is refused and changes nothing
const FUZZ_N = Number(process.env.ELIM_FUZZ ?? 6);
test(`FUZZ: ${FUZZ_N} random events — invariants I1–I5 hold after every operation`, { timeout: 3_600_000 }, async () => {
  let seed = 20261003;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pickOf = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
  const stats = { events: 0, ops: 0, finishes: 0, reopens: 0, undos: 0, undoRefused: 0, redraws: 0, restores: 0, stale: 0, violations: [] as string[] };
  const key = async () => (await q("select public._elim_draw_key(live_settings) k from public.tournaments where id = $1", [T]))[0]?.k ?? null;
  const played = new Set<string>(); // drawKey|match|p1|p2 combos a result was recorded on
  const tagged = new Map<number, string | null>(); // audit id → draw it was recorded on (observed, not the server stamp)
  let lastTag = 0;
  const tagNew = async () => {
    const k = await key();
    for (const a of await q('select id from public.tournament_audit where tournament_id = $1 and id > $2', [T, lastTag])) { tagged.set(Number(a.id), k); lastTag = Math.max(lastTag, Number(a.id)); }
  };
  const note = async (id: string) => {
    const k = await key();
    const x = live(cur, await ms()).find((y) => y.id === id)!;
    played.add(`${k}|${id}|${x.p1RegId}|${x.p2RegId}`);
  };
  const check = async (label: string) => {
    const r = await row();
    const m = await ms();
    const finished = r.status === "completed" || r.live_state === "finished";
    if (finished) {
      const complete = (await q("select public._elim_bracket_complete(live_settings) c from public.tournaments where id = $1", [T]))[0].c;
      if (!complete || champion(cur, m) == null) stats.violations.push(`I1 ${label}: finished but incomplete`);
    }
    const k = await key();
    for (const x of live(cur, m)) {
      if (x.status === "completed" && !x.bye && !x.empty && x.p1RegId != null && x.p2RegId != null
          && !played.has(`${k}|${x.id}|${x.p1RegId}|${x.p2RegId}`))
        stats.violations.push(`I3 ${label}: ${x.id} result on unplayed pairing ${x.p1RegId}v${x.p2RegId}`);
    }
    const busy = Object.entries(m).filter(([, s]: any) => typeof s?.tableId === "number" && s.status !== "completed").map(([, s]: any) => s.tableId);
    if (new Set(busy).size !== busy.length) stats.violations.push(`I4 ${label}: table double-booked`);
  };
  for (let ev = 0; ev < FUZZ_N; ev++) {
    stats.events++;
    const dbl = rnd() < 0.6;
    const n = pickOf([4, 5, 8]);
    let drawN = 1;
    const perm = () => [...Array(n).keys()].sort(() => rnd() - 0.5);
    await reset(mkBracket(n, dbl, drawN, perm()));
    played.clear(); tagged.clear(); lastTag = 0;
    for (let step = 0; step < 70; step++) {
      stats.ops++;
      const roll = rnd();
      const m = await ms();
      const lm = live(cur, m);
      const r = await row();
      const finished = r.status === "completed";
      const playable = lm.filter((x) => !x.bye && !x.empty && !x.pending && x.status !== "completed" && x.p1RegId != null && x.p2RegId != null);
      const completed = lm.filter((x) => x.status === "completed" && !x.bye && !x.empty);
      try {
        if (roll < 0.45 && playable.length && !finished) {
          const x = pickOf(playable);
          const res = await call([setWinner(x.id, rnd() < 0.5 ? 1 : 2)], { rev: await rev() });
          if (res.results[0].ok) await note(x.id);
        } else if (roll < 0.6 && completed.length) {
          const x = pickOf(completed);
          const before = await rev();
          const res = await call([setWinner(x.id, x.winner === 1 ? 2 : 1)], { rev: before });
          if (res.results[0].ok) { await note(x.id); if (res.reopened) stats.reopens++; }
        } else if (roll < 0.68 && !finished && playable.length === 0 && champion(cur, m) != null) {
          const f = await q("update public.tournaments set status = 'completed', live_state = 'finished', completed_at = now() where id = $1 and live_revision = $2 returning id", [T, await rev()]);
          if (f.length) stats.finishes++;
        } else if (roll < 0.82) {
          const kBefore = await key();
          const brBefore = JSON.stringify((await ls()).bracket);
          const pre = await undo(null, true);
          if (pre.available) {
            const u = await undo(await rev());
            stats.undos++;
            if (tagged.get(Number(u.undone.auditId)) !== kBefore) stats.violations.push(`I2 undo crossed draws (${u.undone.op})`);
            if (u.undone.op !== "restore" && JSON.stringify((await ls()).bracket) !== brBefore) stats.violations.push("I2 undo changed the bracket");
            if (u.undone.op === "restore") cur = (await ls()).bracket;
          } else stats.undoRefused++;
        } else if (roll < 0.88 && !finished) {
          drawN++;
          await redraw(mkBracket(n, dbl, drawN, perm()));
          await q("update public.tournaments set live_state = 'in_progress' where id = $1", [T]);
          stats.redraws++;
        } else if (roll < 0.94) {
          const cks = await q("select id from public.elim_checkpoints where tournament_id = $1 order by id", [T]);
          if (cks.length) {
            try { await restore((pickOf(cks) as any).id, await rev()); stats.restores++; cur = (await ls()).bracket; } catch { /* refused restore */ }
          }
        } else if (completed.length) {
          // I5: a stale write
          const stale = (await rev()) - 1;
          const snap = JSON.stringify(await ls());
          const x = pickOf(completed);
          await call([setWinner(x.id, x.winner === 1 ? 2 : 1)], { rev: stale }).then(
            () => stats.violations.push("I5 stale write accepted"),
            () => { stats.stale++; },
          );
          if (JSON.stringify(await ls()) !== snap) stats.violations.push("I5 stale write changed state");
        }
      } catch (e: any) {
        if (!/stale_revision|undo_unavailable|tournament_finished|match_not_ready|player_busy|stale_state/.test(e.message)) throw e;
      }
      await tagNew();
      await check(`ev${ev} step${step}`);
    }
  }
  const byType: Record<string, number> = {};
  for (const v of stats.violations) byType[v.slice(0, 2)] = (byType[v.slice(0, 2)] ?? 0) + 1;
  const badEvents = new Set(stats.violations.map((v) => v.split(" ")[1]?.split("step")[0] ?? "")).size;
  console.log(JSON.stringify({ ...stats, violations: stats.violations.length, byType, eventsWithViolations: badEvents, sample: stats.violations.slice(0, 4) }));
  assert.deepEqual(stats.violations, []);
});
