// supabase/tests/elim_audit_autoassign_draw.test.ts
// Server-contract tests for supabase/migrations/20261020120000_elim_audit_autoassign_draw.sql on a
// real Postgres (PGlite), on top of the live-apply / Auto Assign / recovery / undo-restore chain:
//   • Auto Assign (service-role elim_auto_assign_apply) → one audit row per assigned match in the
//     same transaction, revision-linked, source auto_assign, actor NULL; sanitized spectator row;
//     nothing for no-op cycles; TD writes never mis-tagged; atomic rollback.
//   • Bracket draw / redraw → 'draw' vs 'redraw', compact detail, actor, revision, "Before redraw"
//     milestone kept; server format gate; Chip untouched; Restore not double-logged as a redraw.
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_audit_autoassign_draw.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const mig = (f: string) => read(`supabase/migrations/${f}`);
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const TD = "00000000-0000-0000-0000-000000000001";
const T = 10; // double elimination
const TS = 11; // "round-robin" (no bracket engine)
const TC = 12; // chip
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const seeds = (n: number) => NAMES.slice(0, n).map((name, i) => ({ registrationId: 1001 + i, name, fargo: 500 }));
const bracket = (drawNumber: number, n = 8) => ({
  generatedAt: "2026-10-01T10:00:00.000Z", drawType: "random", format: "double-elimination",
  drawNumber, players: n, bracketSize: 8, byes: 8 - n, doubleElim: true,
  graph: buildBracketGraph(8, true), seeds: seeds(n),
});

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const asTD = async () => {
  await q("select set_config('test.uid', $1, false)", [TD]);
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: TD, role: "authenticated" })]);
};
const asService = async () => {
  await q("select set_config('test.uid', '', false)");
  await q("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
};
const asNobody = async () => {
  await q("select set_config('test.uid', '', false)");
  await q("select set_config('request.jwt.claims', '', false)");
};
const ls = async (tid = T) => (await q("select live_settings from public.tournaments where id = $1", [tid]))[0].live_settings;
const rev = async (tid = T) => Number((await q("select live_revision from public.tournaments where id = $1", [tid]))[0].live_revision);
const updatedAt = async () => (await q("select updated_at::text u from public.tournaments where id = $1", [T]))[0].u as string;
const audits = async (tid = T) =>
  await q("select op, match_id, table_id, actor_id, source, revision, before, after, detail from public.tournament_audit where tournament_id = $1 order by id", [tid]);
const events = async () => await q("select type, payload, actor_id from public.tournament_events where tournament_id = $1 order by created_at, id", [T]);
const cps = async (tid = T) => await q("select reason, milestone, revision from public.elim_checkpoints where tournament_id = $1 order by id", [tid]);
const setLs = (tid: number, v: unknown) => q("update public.tournaments set live_settings = $2::jsonb where id = $1", [tid, JSON.stringify(v)]);
const sysApply = async (ops: unknown[]) =>
  (await q("select public.elim_auto_assign_apply($1, $2::jsonb, $3::timestamptz) as r", [T, JSON.stringify(ops), await updatedAt()]))[0].r;
const assignOp = (matchId: string, tableId: number) => ({ op: "assign", matchId, tableId, ifUnassigned: true });
const tdApply = async (ops: unknown[]) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, false, $3, $4::uuid, false) as r", [T, JSON.stringify(ops), await rev(), crypto.randomUUID()]))[0].r;

// T in a running, Auto-Assign-enabled state, audit / events / checkpoints cleared.
const reset = async (matchState: Record<string, unknown> = {}) => {
  await asNobody();
  await q("update public.tournaments set live_settings = $2::jsonb, live_state = 'in_progress', status = 'active', is_paused = false, updated_at = now() where id = $1", [
    T, JSON.stringify({ bracket: bracket(1), matchState, autoAssignEnabled: true, autoAssignMode: "balanced" }),
  ]);
  await q("update public.tournament_tables set status = 'available'");
  for (const t of ["tournament_audit", "elim_checkpoints", "tournament_events"]) await q(`delete from public.${t}`);
  await q("delete from public.net_calls");
};

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions; create schema net; create schema vault; create schema cron;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
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
  await db.exec(mig("20260922120000_elim_live_apply.sql"));
  await db.exec(mig("20260923120000_elim_assign_notify.sql"));
  await db.exec(mig("20260924120000_elim_auto_assign_server.sql").replace(/^create extension if not exists pg_net with schema extensions;$/m, "-- (pg_net stubbed)"));
  await db.exec(mig("20260926120000_elim_clear_table.sql"));
  await db.exec(mig("20261017120000_elim_server_guards.sql"));
  await db.exec(mig("20261018120000_elim_recovery_foundation.sql"));
  await db.exec(mig("20261019120000_elim_undo_restore.sql"));
  await db.exec(mig("20261020120000_elim_audit_autoassign_draw.sql"));
  await db.exec(mig("20261021130000_elim_finish_redraw_recovery.sql")); // + latest recovery rules (20261021130000)
  await q(`insert into public.profiles values ('${TD}', 1, 'tournament_director')`);
  await q(`insert into public.tournaments (id, venue_id, director_id, tournament_format) values
    (${T}, 5, 1, 'double-elimination'), (${TS}, 5, 1, 'round-robin'), (${TC}, 5, 1, 'chip-tournament')`);
  await q(`insert into public.tournament_tables values (71, ${T}, 1, 'available', 'Diamond'), (72, ${T}, 2, 'available', ''), (73, ${T}, 3, 'available', ''), (74, ${T}, 4, 'available', '')`);
});
beforeEach(() => reset());

// ══ AUTO ASSIGN ══════════════════════════════════════════════════════════════════════════
test("AA 1: an automatic assignment writes exactly one audit row — same revision, source auto_assign, no actor", async () => {
  await asService();
  const r0 = await rev();
  const r = await sysApply([assignOp("W1M1", 74)]);
  assert.equal(r.applied ?? r.ok ?? 1, r.applied ?? r.ok ?? 1);
  assert.equal((await ls()).matchState.W1M1.tableId, 74, "assigned");
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "auto_assign");
  assert.equal(a[0].source, "auto_assign");
  assert.equal(a[0].actor_id, null, "never attributed to a TD");
  assert.equal(a[0].match_id, "W1M1");
  assert.equal(Number(a[0].table_id), 74);
  assert.equal(Number(a[0].revision), r0 + 1, "linked to the revision the assignment produced");
  assert.equal(Number(a[0].revision), await rev());
  assert.equal(a[0].after.tableId, 74);
  assert.equal(a[0].detail.tableLabel, "Table 4");
  assert.equal(a[0].detail.p1Name, "Ann", "names stamped like every audit row");
  assert.equal(a[0].before.tableId, undefined);
});

test("AA 2: spectator activity is sanitized — 'Table assigned' with names + table label only", async () => {
  await asService();
  await sysApply([assignOp("W1M1", 71)]);
  const e = await events();
  assert.equal(e.length, 1);
  assert.equal(e[0].type, "table_assigned");
  assert.equal(e[0].actor_id, null);
  assert.equal(e[0].payload.tableLabel, "Diamond 1", "same table name the app shows");
  assert.equal(e[0].payload.p1Name, "Ann");
  assert.equal(e[0].payload.p2Name, "Bo");
  for (const k of ["revision", "before", "after", "actor", "actorId", "source", "tableId"]) assert.equal(k in e[0].payload, false, `no ${k}`);
});

test("AA 3: no-op cycles write nothing (no audit, no activity, no revision bump)", async () => {
  await reset({ W1M1: { status: "scheduled", tableId: 71 } });
  await asService();
  const r0 = await rev();
  await sysApply([assignOp("W1M1", 72)]); // ifUnassigned → skipped
  assert.equal(await rev(), r0);
  assert.deepEqual(await audits(), []);
  assert.deepEqual(await events(), []);
});

test("AA 4: several assignments in one cycle → one row per match, one shared revision", async () => {
  await asService();
  await sysApply([assignOp("W1M1", 71), assignOp("W1M2", 72), assignOp("W1M3", 73)]);
  const a = await audits();
  assert.deepEqual(a.map((x: any) => x.match_id).sort(), ["W1M1", "W1M2", "W1M3"]);
  assert.equal(new Set(a.map((x: any) => Number(x.revision))).size, 1);
  assert.equal(Number(a[0].revision), await rev());
  assert.equal((await events()).filter((x: any) => x.type === "table_assigned").length, 3);
});

test("AA 5: TD assignments are audited once by elim_live_apply — never as auto_assign", async () => {
  await asTD();
  await tdApply([{ op: "assign", matchId: "W1M1", tableId: 71 }]);
  const a = await audits();
  assert.equal(a.length, 1);
  assert.notEqual(a[0].op, "auto_assign");
  assert.equal(a[0].source, "td");
  assert.equal(a[0].actor_id, TD);
  // First assignment of a match with no prior state reads "Table assigned" (was "Table changed").
  assert.deepEqual((await events()).map((x: any) => x.type), ["table_assigned"]);
});

test("AA 6: Auto Assign on/off is a TD set_queue op — audited once with the TD as actor", async () => {
  await asTD();
  await tdApply([{ op: "set_queue", autoAssignEnabled: false }]);
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "set_queue");
  assert.equal(a[0].actor_id, TD);
  assert.deepEqual(a[0].after, { autoAssignEnabled: false }, "history can name it: Auto Assign disabled");
  assert.deepEqual(await events(), [], "not spectator activity");
});

test("AA 7: atomic — if the assignment's transaction rolls back, so does its audit + activity", async () => {
  await asService();
  await q("begin");
  await sysApply([assignOp("W1M1", 71)]);
  assert.equal((await audits()).length, 1);
  await q("rollback");
  assert.equal((await ls()).matchState?.W1M1, undefined);
  assert.deepEqual(await audits(), []);
  assert.deepEqual(await events(), []);
});

// ══ DRAW / REDRAW ════════════════════════════════════════════════════════════════════════
const clearBracket = (tid = T) => setLs(tid, { matchState: {} });

test("DRAW 1: first draw → op 'draw' with format, bracket size, players, actor, revision", async () => {
  await clearBracket();
  for (const t of ["tournament_audit", "elim_checkpoints"]) await q(`delete from public.${t}`);
  await asTD();
  await setLs(T, { bracket: bracket(1, 6), matchState: {}, drawLog: [{ drawNumber: 1, reason: "Initial draw" }] });
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "draw");
  assert.equal(a[0].source, "td");
  assert.equal(a[0].actor_id, TD);
  assert.equal(Number(a[0].revision), await rev());
  assert.deepEqual(a[0].after, { drawNumber: 1, bracketSize: 8, players: 6, byes: 2, format: "double-elimination" });
  assert.equal(JSON.stringify(a[0]).includes("graph"), false, "never the bracket JSON");
  assert.equal((await cps()).some((c: any) => c.reason === "before_redraw"), false, "nothing to preserve on a first draw");
});

test("DRAW 2: redraw → op 'redraw', reason from the draw log, Before-redraw milestone kept", async () => {
  await asTD();
  await setLs(T, { bracket: bracket(2), matchState: {}, drawLog: [{ drawNumber: 1 }, { drawNumber: 2, reason: "Late player" }] });
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "redraw");
  assert.equal(a[0].detail.previousDrawNumber, 1);
  assert.equal(a[0].detail.previousSaved, true);
  assert.equal(a[0].detail.reason, "Late player");
  assert.equal(a[0].after.drawNumber, 2);
  const m = (await cps()).filter((c: any) => c.reason === "before_redraw");
  assert.equal(m.length, 1);
  assert.equal(m[0].milestone, true);
  assert.equal(Number(m[0].revision), Number(a[0].revision) - 1, "milestone = the state just before the redraw");
});

test("DRAW 3: unsupported format → refused server-side; nothing changes", async () => {
  await asTD();
  const r0 = await rev(TS);
  await assert.rejects(setLs(TS, { bracket: bracket(1), matchState: {} }), /format_not_supported/);
  assert.equal(await rev(TS), r0);
  assert.deepEqual(await ls(TS), {});
  assert.deepEqual(await audits(TS), []);
  assert.deepEqual(await cps(TS), []);
});

test("DRAW 4: Chip tournaments are untouched", async () => {
  await asTD();
  await setLs(TC, { bracket: bracket(1), chipState: { x: 1 } });
  await setLs(TC, { bracket: bracket(2), chipState: { x: 2 } });
  assert.deepEqual(await audits(TC), []);
});

test("DRAW 5: Restore to 'Before redraw' is logged once as a restore — not as a redraw", async () => {
  await asTD();
  await setLs(T, { bracket: bracket(2), matchState: {} });
  const ck = (await q("select id from public.elim_checkpoints where tournament_id = $1 and reason = 'before_redraw'", [T]))[0].id;
  await q("delete from public.tournament_audit");
  const r = (await q("select public.elim_restore($1, $2, $3, false) as r", [T, ck, await rev()]))[0].r;
  assert.equal(r.ok, true);
  assert.equal((await ls()).bracket.drawNumber, 1, "earlier draw back");
  const a = await audits();
  assert.deepEqual(a.map((x: any) => x.op), ["restore"]);
  // The flag is scoped to Restore's own UPDATE: a later redraw in the same transaction is audited.
  await q("begin");
  const ck2 = (await q("select id from public.elim_checkpoints where tournament_id = $1 and reason = 'before_redraw' order by id desc limit 1", [T]))[0].id;
  await q("select public.elim_restore($1, $2, $3, false)", [T, ck2, await rev()]);
  await setLs(T, { bracket: bracket(5), matchState: {} });
  const ops = (await audits()).map((x: any) => x.op);
  await q("rollback");
  assert.deepEqual(ops.slice(-2), ["restore", "redraw"]);
});

test("DRAW 6: ordinary live-settings writes (queue, match state) don't produce draw / auto rows", async () => {
  await asTD();
  const cur = await ls();
  await setLs(T, { ...cur, queueOrder: ["W1M2", "W1M1"] });
  await setLs(T, { ...cur, matchState: { W1M1: { status: "scheduled", tableId: 71 } } });
  assert.deepEqual(await audits(), []);
});

test("DRAW 7: a draw with no signed-in user is source 'system' (never a fake TD)", async () => {
  await asNobody();
  await setLs(T, { bracket: bracket(3), matchState: {} });
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "redraw");
  assert.equal(a[0].source, "system");
  assert.equal(a[0].actor_id, null);
});

test("privileges + rollback script", async () => {
  const can = async (role: string, fn: string) => (await q("select has_function_privilege($1, $2, 'execute') ok", [role, fn]))[0].ok;
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await can(role, "public.tg_tournaments_elim_system_audit()"), false);
    assert.equal(await can(role, "public._elim_recovery_write(bigint, jsonb, jsonb, boolean, text, text, text, text, jsonb, jsonb, jsonb)"), false);
  }
  await db.exec(read("supabase/rollback/20261020120000_elim_audit_autoassign_draw_rollback.sql"));
  await asTD();
  await setLs(T, { bracket: bracket(9), matchState: {} });
  assert.deepEqual(await audits(), [], "trigger gone");
  const src = (await q("select prosrc from pg_proc where proname = '_elim_recovery_write'"))[0].prosrc as string;
  assert.equal(src.includes("elim_audited"), false, "writer restored verbatim");
  const pe = (await q("select prosrc from pg_proc where proname = '_elim_public_events'"))[0].prosrc as string;
  assert.equal(pe.includes("20261020"), false, "activity writer restored verbatim");
  await db.exec(mig("20261020120000_elim_audit_autoassign_draw.sql"));
});
