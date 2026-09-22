// supabase/tests/elim_auto_assign_server.test.ts
// SQL-level tests for supabase/migrations/20260924120000_elim_auto_assign_server.sql (server-backed
// Auto Assign: triggers, kick, system RPC, recovery sweep, cron), executed against a real Postgres
// (PGlite). The two previous elimination migrations are loaded verbatim (the system RPC reuses
// their _elim_apply_one validator). Supabase platform objects are stubbed: pg_net (net.http_post
// records calls instead of sending), Vault (vault.decrypted_secrets), pg_cron (cron.job /
// schedule / unschedule) and the service_role role. The only line removed from the migration is
// `create extension pg_net` (PGlite has no pg_net; the stub schema stands in for it).
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_auto_assign_server.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
const M1 = read("20260922120000_elim_live_apply.sql");
const M2 = read("20260923120000_elim_assign_notify.sql");
const M3_RAW = read("20260924120000_elim_auto_assign_server.sql");
const M3 = M3_RAW.replace(/^create extension if not exists pg_net with schema extensions;$/m, "-- (pg_net stubbed)");
const ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20260924120000_elim_auto_assign_server_rollback.sql"), "utf8")
  .replace(/^drop extension if exists pg_net;$/m, "-- (pg_net stubbed)");

const T = 10; // double elim, Auto Assign on
const T2 = 11; // second double elim (sweep)
const TC = 12; // chip
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket = {
  generatedAt: "2026-09-01T10:00:00.000Z",
  drawNumber: 1,
  doubleElim: true,
  graph: buildBracketGraph(8, true),
  seeds: NAMES.map((n, i) => ({ registrationId: 1001 + i, name: n, fargo: 500 })),
};
const T0 = "2026-09-01T12:00:00.000Z";

let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const kicks = async () => (await q("select tournament_id, reason from net_calls order by id")) as { tournament_id: number; reason: string }[];
const kickCount = async () => (await kicks()).length;
const ls = async (tid: number) => (await q("select live_settings from public.tournaments where id = $1", [tid]))[0].live_settings;
const setLs = async (tid: number, v: unknown) =>
  q("update public.tournaments set live_settings = $2::jsonb, updated_at = now() where id = $1", [tid, JSON.stringify(v)]);
const patchMs = async (tid: number, matchId: string, patch: Record<string, unknown>) => {
  const cur = await ls(tid);
  cur.matchState = { ...(cur.matchState ?? {}), [matchId]: { ...(cur.matchState?.[matchId] ?? {}), ...patch } };
  await setLs(tid, cur);
};
const sysApply = async (tid: number, ops: unknown[], expected: string | null) =>
  (await q("select public.elim_auto_assign_apply($1, $2::jsonb, $3::timestamptz) as r", [tid, JSON.stringify(ops), expected]))[0].r;
const updatedAt = async (tid: number) =>
  (await q("select updated_at::text as u from public.tournaments where id = $1", [tid]))[0].u as string;
const assignOp = (matchId: string, tableId: number) => ({ op: "assign", matchId, tableId, ifUnassigned: true });

/** Put T into a running, Auto-Assign-enabled state WITHOUT counting the setup kick. */
const baseline = async (extra: Record<string, unknown> = {}, matchState: Record<string, unknown> = {}) => {
  await q(
    `update public.tournaments set live_settings = $2::jsonb, live_state = 'in_progress', is_paused = false,
       updated_at = $3::timestamptz where id = $1`,
    [T, JSON.stringify({ bracket, matchState, autoAssignEnabled: true, autoAssignMode: "balanced", ...extra }), T0],
  );
  await q("update public.tournament_tables set status = 'available' where tournament_id = $1 and id <> 74", [T]);
  await q("update public.tournament_tables set status = 'unavailable' where id = 74");
  await q("delete from net_calls");
};

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions; create schema net; create schema vault; create schema cron;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.tournaments (
      id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'not_started' not null, is_paused boolean default false,
      game_type text default '9-ball', live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int,
      player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int,
      status text default 'available' not null);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;

    -- pg_net stub: record instead of sending
    create table public.net_calls (id serial primary key, url text, body jsonb, headers jsonb,
      tournament_id bigint, reason text);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
    language plpgsql as $$
    declare v bigint;
    begin
      if current_setting('test.net_fail', true) = 'on' then raise exception 'network down'; end if;
      insert into public.net_calls (url, body, headers, tournament_id, reason)
      values (url, body, headers, (body ->> 'tournament_id')::bigint, body ->> 'reason') returning id into v;
      return v;
    end $$;
    -- Vault stub
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    -- pg_cron stub
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as
      $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as
      $$ with d as (delete from cron.job where jobid = id returning 1) select exists (select 1 from d) $$;
  `);
  await db.exec(M1);
  await db.exec(M2);
  await db.exec(M3);
  await db.exec(`
    insert into vault.decrypted_secrets values
      ('elim_auto_assign_url', 'https://example.test/functions/v1/auto-assign-run'),
      ('elim_auto_assign_secret', 'test-secret-0123456789abcdef0123456789');
    insert into public.tournaments (id, venue_id, director_id, tournament_format) values
      (${T}, 5, 1, 'double_elimination'), (${T2}, 5, 1, 'double_elimination'), (${TC}, 5, 1, 'chip-tournament');
    insert into public.tournament_tables (id, tournament_id, table_number, status) values
      (71, ${T}, 1, 'available'), (72, ${T}, 2, 'available'), (73, ${T}, 3, 'available'),
      (74, ${T}, 4, 'unavailable'), (75, ${T2}, 1, 'available');
  `);
});

beforeEach(async () => {
  await q("select set_config('test.net_fail', 'off', false)");
  await baseline();
});

// ── Triggers: what DOES kick ─────────────────────────────────────────────────────────────────
test("kick payload: function URL, tournament id, reason, secret header", async () => {
  await patchMs(T, "W1M1", { status: "completed", winner: 1, tableId: 71, completedAt: T0 });
  const [c] = await q("select url, body, headers from net_calls");
  assert.equal(c.url, "https://example.test/functions/v1/auto-assign-run");
  assert.deepEqual(c.body, { tournament_id: T, reason: "tournament_change" });
  assert.equal(c.headers["x-auto-assign-secret"], "test-secret-0123456789abcdef0123456789");
  assert.equal(c.headers["Content-Type"], "application/json");
});

test("match completed → kick (frees its table / can make matches Ready)", async () => {
  await baseline({}, { W1M1: { status: "in_progress", tableId: 71, startedAt: T0 } });
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  assert.equal(await kickCount(), 1);
});

test("table freed (match unassigned) → kick", async () => {
  await baseline({}, { W1M1: { status: "scheduled", tableId: 71, assignedAt: T0 } });
  await patchMs(T, "W1M1", { tableId: null, assignedAt: null });
  assert.equal(await kickCount(), 1);
});

test("Auto Assign enabled (off → on) → kick", async () => {
  await baseline({ autoAssignEnabled: false });
  await setLs(T, { ...(await ls(T)), autoAssignEnabled: true });
  assert.equal(await kickCount(), 1);
});

test("mode change / queue order change / queue pins change / Play Next change → kick each", async () => {
  const cur = await ls(T);
  await setLs(T, { ...cur, autoAssignMode: "manual" });
  await setLs(T, { ...(await ls(T)), queueOrder: ["W1M4", "W1M3"] });
  await setLs(T, { ...(await ls(T)), queuePins: [{ matchId: "W1M3", place: "top" }] });
  await patchMs(T, "W1M2", { preferredTableId: 72 });
  await patchMs(T, "W1M2", { preferredTableId: null });
  assert.deepEqual((await kicks()).map((k) => k.reason), Array(5).fill("tournament_change"));
});

test("resume from pause / tournament goes live → kick", async () => {
  await q("update public.tournaments set is_paused = true where id = $1", [T]);
  assert.equal(await kickCount(), 0, "pausing never kicks");
  await q("update public.tournaments set is_paused = false where id = $1", [T]);
  assert.equal(await kickCount(), 1);
  await q("update public.tournaments set live_state = 'registration_closed' where id = $1", [T]);
  await q("update public.tournaments set live_state = 'in_progress' where id = $1", [T]);
  assert.equal(await kickCount(), 2);
});

test("table becomes available (insert / unavailable → available) → kick", async () => {
  await q("update public.tournament_tables set status = 'available' where id = 74");
  assert.deepEqual(await kicks(), [{ tournament_id: T, reason: "table_available" }]);
  await q("insert into public.tournament_tables (id, tournament_id, table_number) values (79, $1, 9)", [T]);
  assert.equal(await kickCount(), 2);
  await q("delete from public.tournament_tables where id = 79");
});

// ── Triggers: what does NOT kick ─────────────────────────────────────────────────────────────
test("score-only rack updates, timers and start → NO kick", async () => {
  await baseline({}, { W1M1: { status: "scheduled", tableId: 71, assignedAt: T0 } });
  await patchMs(T, "W1M1", { status: "in_progress", startedAt: T0 });
  for (let r = 1; r <= 5; r++) await patchMs(T, "W1M1", { p1Score: r, p2Score: r - 1, timerSeconds: r * 60 });
  assert.equal(await kickCount(), 0);
});

test("unrelated settings (Prize Pool / race) → NO kick", async () => {
  await setLs(T, { ...(await ls(T)), prizePool: { total: 500 }, raceMode: "fixed", fixedRaceWinners: 7 });
  assert.equal(await kickCount(), 0);
});

test("disabled / paused / not running / chip → NO kick for any change", async () => {
  await baseline({ autoAssignEnabled: false });
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  await baseline();
  await q("update public.tournaments set is_paused = true where id = $1", [T]);
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  await q("update public.tournament_tables set status = 'available' where id = 74");
  await baseline();
  await q("update public.tournaments set live_state = 'completed' where id = $1", [T]);
  await patchMs(T, "W1M2", { status: "completed", winner: 1, completedAt: T0 });
  await q(`update public.tournaments set live_state = 'in_progress',
             live_settings = '{"autoAssignEnabled":true,"matchState":{}}' where id = $1`, [TC]);
  await q(`update public.tournaments set live_settings = '{"autoAssignEnabled":true,"matchState":{"x":{"status":"completed"}}}' where id = $1`, [TC]);
  assert.equal(await kickCount(), 0);
  await q(`update public.tournaments set live_state = 'not_started', live_settings = '{}' where id = $1`, [TC]);
});

test("table status changes that don't add capacity → NO kick", async () => {
  await q("update public.tournament_tables set status = 'in_use' where id = 71");
  await q("update public.tournament_tables set status = 'available' where id = 71");
  await q("update public.tournament_tables set status = 'unavailable' where id = 72");
  assert.equal(await kickCount(), 0);
});

test("kick is a silent no-op until Vault secrets exist", async () => {
  await q("delete from vault.decrypted_secrets where name = 'elim_auto_assign_secret'");
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  assert.equal(await kickCount(), 0);
  await q("insert into vault.decrypted_secrets values ('elim_auto_assign_secret', 'test-secret-0123456789abcdef0123456789')");
});

test("a failing HTTP kick never fails the write that triggered it", async () => {
  await q("select set_config('test.net_fail', 'on', false)");
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  assert.equal((await ls(T)).matchState.W1M1.status, "completed");
});

// ── System RPC ─────────────────────────────────────────────────────────────────────────────
test("system RPC + internals: service_role only", async () => {
  const can = async (role: string, fn: string) =>
    (await q("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]))[0].ok;
  const rpc = "public.elim_auto_assign_apply(bigint, jsonb, timestamptz)";
  assert.equal(await can("service_role", rpc), true);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await can(role, rpc), false, role);
    for (const fn of ["public._elim_auto_assign_kick(bigint, text)", "public._elim_auto_assign_sweep()",
                      "public._elim_auto_assign_signature(jsonb)"])
      assert.equal(await can(role, fn), false, `${role} ${fn}`);
  }
});

test("system RPC accepts ONLY assign + ifUnassigned:true, never start", async () => {
  const bad = [
    [{ op: "assign", matchId: "W1M1", tableId: 71 }], // ifUnassigned missing
    [{ op: "assign", matchId: "W1M1", tableId: 71, ifUnassigned: false }],
    [{ op: "assign", matchId: "W1M1", tableId: 71, ifUnassigned: true, start: true }],
    [{ op: "start", matchId: "W1M1" }],
    [{ op: "unassign", matchId: "W1M1" }],
    [{ op: "patch_match", matchId: "W1M1", set: { status: "completed" } }],
    [{ op: "set_queue", autoAssignMode: "manual" }],
    [{ ...assignOp("W1M1", 71), extra: 1 }],
  ];
  for (const ops of bad) {
    await assert.rejects(sysApply(T, ops, T0), /Only automatic assign ops/, JSON.stringify(ops));
  }
  await assert.rejects(sysApply(T, [], T0), /1\.\.64/);
  await assert.rejects(sysApply(T, Array(65).fill(assignOp("W1M1", 71)), T0), /1\.\.64/);
  assert.deepEqual((await ls(T)).matchState, {});
});

test("fresh plan applies: scheduled (not started), assignedAt stamped, Play Next cleared, updated_at bumped", async () => {
  await baseline({}, { W1M2: { preferredTableId: 72 } });
  const r = await sysApply(T, [assignOp("W1M1", 71), assignOp("W1M2", 72), { ...assignOp("W1M3", 73), start: false }], T0);
  assert.equal(r.status, "applied");
  assert.deepEqual(r.results.map((x: any) => x.ok), [true, true, true]);
  const s = (await ls(T)).matchState;
  for (const [m, t] of [["W1M1", 71], ["W1M2", 72], ["W1M3", 73]] as const) {
    assert.equal(s[m].tableId, t);
    assert.equal(s[m].status, "scheduled", "never auto-starts");
    assert.equal(s[m].startedAt, null);
    assert.equal(typeof s[m].assignedAt, "string");
  }
  assert.equal("preferredTableId" in s.W1M2, false);
  assert.notEqual(await updatedAt(T), (await q("select $1::timestamptz::text as u", [T0]))[0].u);
});

test("stale plan (state changed since it was read) → 'stale', nothing written", async () => {
  const before = await updatedAt(T);
  await patchMs(T, "W1M2", { preferredTableId: 71 }); // a TD write lands between read and apply
  const r = await sysApply(T, [assignOp("W1M1", 71)], before);
  assert.equal(r.status, "stale");
  assert.equal((await ls(T)).matchState.W1M1, undefined);
  assert.equal((await sysApply(T, [assignOp("W1M1", 71)], null)).status, "stale", "no expected version → stale");
});

test("inactive under the lock (disabled / paused / not running / chip) → 'inactive', nothing written", async () => {
  await baseline({ autoAssignEnabled: false });
  assert.equal((await sysApply(T, [assignOp("W1M1", 71)], T0)).status, "inactive");
  await baseline();
  await q("update public.tournaments set is_paused = true, updated_at = $2 where id = $1", [T, T0]);
  assert.equal((await sysApply(T, [assignOp("W1M1", 71)], T0)).status, "inactive");
  await baseline();
  await q("update public.tournaments set live_state = 'completed', updated_at = $2 where id = $1", [T, T0]);
  assert.equal((await sysApply(T, [assignOp("W1M1", 71)], T0)).status, "inactive");
  assert.deepEqual((await ls(T)).matchState, {});
  await assert.rejects(sysApply(999, [assignOp("W1M1", 71)], T0), /not found/);
});

test("per-op validation still applies: taken match / busy or unavailable table skipped, rest applied", async () => {
  await baseline({}, { W1M1: { status: "scheduled", tableId: 71, assignedAt: T0 }, W1M2: { status: "in_progress", tableId: 72 } });
  const r = await sysApply(T, [
    assignOp("W1M1", 73), // already has a table → match_assigned (never moved)
    assignOp("W1M3", 72), // table occupied
    assignOp("W1M3", 74), // table unavailable
    assignOp("W1M2", 73), // in progress
    assignOp("W1M4", 73), // ok
  ], T0);
  assert.equal(r.status, "applied");
  assert.deepEqual(r.results.map((x: any) => x.ok), [false, false, false, false, true]);
  assert.equal(r.results[0].error, "match_assigned");
  const s = (await ls(T)).matchState;
  assert.equal(s.W1M1.tableId, 71);
  assert.equal(s.W1M3, undefined);
  assert.equal(s.W1M4.tableId, 73);
});

test("nothing succeeds → no write, updated_at unchanged, no kick", async () => {
  await baseline({}, { W1M1: { status: "scheduled", tableId: 71, assignedAt: T0 } });
  const r = await sysApply(T, [assignOp("W1M1", 72)], T0);
  assert.equal(r.status, "applied");
  assert.equal(r.results[0].ok, false);
  assert.equal(await kickCount(), 0);
  assert.equal(await updatedAt(T), (await q("select $1::timestamptz::text as u", [T0]))[0].u);
});

test("an automatic write re-kicks once (occupancy changed) and converges", async () => {
  await sysApply(T, [assignOp("W1M1", 71)], T0);
  assert.equal(await kickCount(), 1, "follow-up run to fill any remaining table");
  const again = await sysApply(T, [assignOp("W1M1", 72)], await updatedAt(T)); // re-plan finds it taken
  assert.equal(again.results[0].ok, false);
  assert.equal(await kickCount(), 1, "no write → no further kick");
});

test("concurrency: two automatic runs (e.g. trigger + sweep) planned from the same read → one applies, the other is stale", async () => {
  // Serial interleaving of two row-locked writers (PGlite is single-connection; real
  // concurrency is serialized by the FOR UPDATE lock, so this is the only possible outcome).
  const read = await updatedAt(T);
  const first = await sysApply(T, [assignOp("W1M1", 71), assignOp("W1M2", 72)], read);
  const second = await sysApply(T, [assignOp("W1M1", 71), assignOp("W1M2", 72)], read);
  assert.equal(first.status, "applied");
  assert.equal(second.status, "stale");
  // …and even a re-plan from a fresh read cannot double-assign (ifUnassigned + occupied table).
  const third = await sysApply(T, [assignOp("W1M1", 73), assignOp("W1M3", 71)], await updatedAt(T));
  assert.deepEqual(third.results.map((x: any) => [x.ok, x.error ?? null]), [[false, "match_assigned"], [false, "table_occupied"]]);
});

test("concurrency: TD write lands between the automatic read and apply → automatic plan is stale, TD wins", async () => {
  const read = await updatedAt(T);
  await q("update public.tournaments set live_settings = jsonb_set(live_settings, '{matchState,W1M2}', $2::jsonb), updated_at = now() where id = $1",
    [T, JSON.stringify({ status: "scheduled", tableId: 71, assignedAt: T0 })]);
  assert.equal((await sysApply(T, [assignOp("W1M1", 71)], read)).status, "stale");
  const s = (await ls(T)).matchState;
  assert.equal(s.W1M2.tableId, 71);
  assert.equal(s.W1M1, undefined);
});

// ── Sweep + cron ───────────────────────────────────────────────────────────────────────────
test("sweep kicks exactly the active elimination tournaments", async () => {
  await q(`update public.tournaments set live_state = 'in_progress', is_paused = false,
             live_settings = $2::jsonb where id = $1`, [T2, JSON.stringify({ bracket, autoAssignEnabled: true })]);
  await q(`update public.tournaments set live_state = 'in_progress',
             live_settings = '{"autoAssignEnabled":true,"bracket":{"graph":[]}}' where id = $1`, [TC]);
  await q("delete from net_calls");
  assert.equal((await q("select public._elim_auto_assign_sweep() as n"))[0].n, 2);
  assert.deepEqual((await kicks()).map((k) => [Number(k.tournament_id), k.reason]).sort(), [[T, "sweep"], [T2, "sweep"]]);
  await q("update public.tournaments set is_paused = true where id = $1", [T2]);
  await q("delete from net_calls");
  assert.equal((await q("select public._elim_auto_assign_sweep() as n"))[0].n, 1);
  await q(`update public.tournaments set live_state = 'not_started', live_settings = '{}' where id in ($1, $2)`, [T2, TC]);
});

test("cron: one job, every minute, calling the sweep; re-running the migration keeps exactly one", async () => {
  await db.exec(M3);
  const jobs = await q("select jobname, schedule, command from cron.job");
  assert.deepEqual(jobs, [{ jobname: "elim-auto-assign-sweep", schedule: "* * * * *", command: "select public._elim_auto_assign_sweep()" }]);
});

test("rollback removes triggers, functions and the cron job; writes no longer kick", async () => {
  await db.exec(ROLLBACK);
  assert.equal((await q("select count(*)::int as n from cron.job"))[0].n, 0);
  assert.equal((await q(`select count(*)::int as n from pg_proc where proname like '%elim_auto_assign%'`))[0].n, 0);
  await patchMs(T, "W1M1", { status: "completed", winner: 1, completedAt: T0 });
  assert.equal(await kickCount(), 0);
  // _elim_apply_one (previous migration) is untouched
  assert.equal((await q(`select count(*)::int as n from pg_proc where proname = '_elim_apply_one'`))[0].n, 1);
  await db.exec(M3); // restore for any later test
});
