// supabase/tests/check_in_timer.test.ts
// SQL tests for supabase/migrations/20260929120000_check_in_timer.sql: the submit_match_state
// tightening, player Start Match, manager manual presence, Extend Time, and the once-per-
// assignment Forfeit Review sweep. PGlite, with net/vault/cron stubbed like the other suites.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/check_in_timer.test.ts
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
const M4 = read("20260926120000_elim_clear_table.sql");
const M5 = read("20260927120000_match_check_in.sql");
const M6 = read("20260928120000_match_issue_resolve.sql");
const MIG = read("20260929120000_check_in_timer.sql");
const PHASE5 = readFileSync(join(ROOT, "supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s + 2) + 2) + 3);
};
const CAN_MANAGE = cut(PHASE5, "create or replace function public.can_manage_tournament");

const T = 10;
const U = {
  td: "00000000-0000-0000-0000-000000000001",
  owner: "00000000-0000-0000-0000-000000000003",
  outsider: "00000000-0000-0000-0000-000000000005",
};
const P = (n: number) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const REG = (n: number) => 1000 + n;
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket = (drawNumber = 1) => ({
  generatedAt: "2026-09-01T10:00:00.000Z", drawNumber, doubleElim: true,
  graph: buildBracketGraph(8, true),
  seeds: NAMES.map((n, i) => ({ registrationId: REG(i + 1), name: n, fargo: 500 })),
});

let db: any;
let M1_REGS: number[] = [];
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const as = async (uid: string | null) => q("select set_config('test.uid', $1, false)", [uid ?? ""]);
const uuidFor = (reg: number) => P(reg - 1000);
/** assignedAt N minutes ago, so the sweep's thresholds can be crossed deterministically. */
const agoIso = async (min: number) => (await q("select (now() - make_interval(mins => $1))::text t", [min]))[0].t;
const setState = async (ms: Record<string, unknown>, checkIn: Record<string, unknown> | null = { required: true, forfeitReviewAfterMinutes: 10 }) =>
  q("update public.tournaments set live_settings = $2::jsonb, live_state = 'in_progress' where id = $1", [
    T, JSON.stringify({ bracket: bracket(), matchState: ms, ...(checkIn ? { checkIn } : {}) }),
  ]);
const assigned = (assignedAt: string, over: Record<string, unknown> = {}) => ({
  status: "scheduled", tableId: 71, assignedAt, ...over,
});
const matchState = async (id = "W1M1") =>
  (await q("select live_settings #> array['matchState', $1] ms from public.tournaments where id = $2", [id, T]))[0].ms;
const checkInAs = async (reg: number, matchId = "W1M1") => {
  await as(uuidFor(reg));
  return (await q("select public.match_check_in($1, $2) r", [T, matchId]))[0].r;
};
const playerStart = async (reg: number, matchId = "W1M1") => {
  await as(uuidFor(reg));
  return (await q("select public.match_player_start($1, $2) r", [T, matchId]))[0].r;
};

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema net; create schema vault; create schema cron;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user',
      user_name text, first_name text, last_name text);
    create table public.tournaments (id bigint primary key, name text, venue_id int, director_id int,
      tournament_format text not null, status text default 'active', live_state text default 'in_progress' not null,
      is_paused boolean default false, live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id bigint primary key, tournament_id int, player_id int,
      guest_name text, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int,
      status text default 'available' not null);
    create table public.venue_owners (id serial, venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (id serial, venue_id int, director_id int, archived_at timestamptz);
    create table public.notifications (id bigserial primary key, user_id bigint not null, title text not null,
      body text not null, category text, data jsonb, status text, sent_at timestamptz, created_at timestamptz default now());
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
    grant select on public.tournament_players, public.profiles, public.tournaments to authenticated;
    create table public.net_calls (id serial primary key, body jsonb);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
      language sql as $$ insert into public.net_calls (body) values (body) returning id $$;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    insert into vault.decrypted_secrets values ('elim_review_url', 'https://x.test/review'), ('elim_auto_assign_secret', 'secret');
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as
      $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as
      $$ with d as (delete from cron.job where jobid = id returning 1) select exists (select 1 from d) $$;
  `);
  await db.exec(CAN_MANAGE);
  for (const m of [M1, M2, M4, M5, M6, MIG]) await db.exec(m);
  await db.exec(`
    insert into public.profiles (id, id_auto, role, user_name) values
      ('${U.td}', 1, 'tournament_director', 'td'), ('${U.owner}', 3, 'bar_owner', 'owner'),
      ('${U.outsider}', 5, 'basic_user', 'outsider');
    insert into public.venue_owners (venue_id, owner_id, archived_at) values (5, 3, null);
    insert into public.tournaments (id, name, venue_id, director_id, tournament_format) values
      (${T}, 'Test elim', 5, 1, 'double_elimination');
    insert into public.tournament_tables (id, tournament_id, table_number) values (71, ${T}, 1), (72, ${T}, 2);
  `);
  for (let n = 1; n <= 8; n++) {
    await q("insert into public.profiles (id, id_auto, user_name) values ($1, $2, $3)", [P(n), 100 + n, `p${n}`]);
    await q("insert into public.tournament_players (id, tournament_id, player_id) values ($1, $2, $3)", [REG(n), T, 100 + n]);
  }
  await setState({});
  const who = (await q("select public._elim_resolve(live_settings) -> 'W1M1' w from public.tournaments where id = $1", [T]))[0].w;
  M1_REGS = [Number(who.p1), Number(who.p2)];
});

beforeEach(async () => {
  await q("delete from public.match_player_status");
  await q("delete from public.match_assignment_status");
  await q("delete from public.notifications");
  await q("delete from public.net_calls");
  await setState({ W1M1: assigned(await agoIso(1)) });
});

// ── submit_match_state tightening ──────────────────────────────────────────────────────────
test("a participant can no longer start/complete a match through submit_match_state", async () => {
  await as(uuidFor(M1_REGS[0]));
  for (const patch of [
    { status: "in_progress" },
    { startedAt: "2020-01-01T00:00:00.000Z" },
    { status: "completed", winner: 1 },
    { completedAt: "2020-01-01T00:00:00.000Z" },
  ]) {
    await assert.rejects(
      q("select public.submit_match_state($1, 'W1M1', $2::jsonb)", [T, JSON.stringify(patch)]),
      /Only a tournament manager can change the match lifecycle/,
      JSON.stringify(patch),
    );
  }
  const ms = await matchState();
  assert.equal(ms.status, "scheduled", "the match never started");
  assert.equal(ms.startedAt ?? null, null);
});

test("a participant can still score, and a manager keeps the lifecycle fields", async () => {
  await as(uuidFor(M1_REGS[0]));
  await q("select public.submit_match_state($1, 'W1M1', '{\"p1Score\":3,\"p2Score\":1}'::jsonb)", [T]);
  let ms = await matchState();
  assert.equal(ms.p1Score, 3);
  assert.equal(ms.status, "scheduled");
  await as(U.td);
  await q("select public.submit_match_state($1, 'W1M1', '{\"status\":\"in_progress\"}'::jsonb)", [T]);
  ms = await matchState();
  assert.equal(ms.status, "in_progress", "managers are unaffected");
});

// ── Player Start Match ─────────────────────────────────────────────────────────────────────
test("both sides present → either player may start; the server stamps startedAt", async () => {
  for (const starter of [0, 1]) {
    await setState({ W1M1: assigned(await agoIso(2)) });
    await q("delete from public.match_player_status");
    await checkInAs(M1_REGS[0]);
    await checkInAs(M1_REGS[1]);
    const r = await playerStart(M1_REGS[starter]);
    assert.equal(r.status, "started");
    const ms = await matchState();
    assert.equal(ms.status, "in_progress");
    assert.equal(typeof ms.startedAt, "string", "server-stamped, not client-supplied");
    assert.equal((await q("select live_state from public.tournaments where id = $1", [T]))[0].live_state, "in_progress");
  }
});

test("when check-in is required, one side alone cannot start", async () => {
  await checkInAs(M1_REGS[0]);
  await assert.rejects(playerStart(M1_REGS[0]), /waiting_for_check_in/);
  assert.equal((await matchState()).status, "scheduled");
  // a manager marking the other player present unblocks it (guest / no phone)
  await as(U.td);
  await q("select public.match_mark_checked_in($1, 'W1M1', $2, true)", [T, M1_REGS[1]]);
  const r = await playerStart(M1_REGS[0]);
  assert.equal(r.status, "started");
});

test("with check-in NOT required, a player may start without any check-in", async () => {
  await setState({ W1M1: assigned(await agoIso(1)) }, { required: false });
  assert.equal((await playerStart(M1_REGS[0])).status, "started");
});

test("a player can never start someone else's match, an unassigned match, or a finished one", async () => {
  await setState({ W1M1: assigned(await agoIso(1)), W1M2: assigned(await agoIso(1), { tableId: 72 }) }, { required: false });
  await as(uuidFor(M1_REGS[0]));
  await assert.rejects(q("select public.match_player_start($1, 'W1M2')", [T]), /Not a player in this match/);
  await as(U.outsider);
  await assert.rejects(q("select public.match_player_start($1, 'W1M1')", [T]), /Not a player in this match/);
  // no table
  await setState({ W1M1: { status: "scheduled" } }, { required: false });
  await assert.rejects(playerStart(M1_REGS[0]), /match_not_assigned/);
  // already started / completed
  await setState({ W1M1: assigned(await agoIso(1), { status: "in_progress", startedAt: await agoIso(0) }) }, { required: false });
  await assert.rejects(playerStart(M1_REGS[0]), /match_in_progress/);
  await setState({ W1M1: assigned(await agoIso(1), { status: "completed", winner: 1 }) }, { required: false });
  await assert.rejects(playerStart(M1_REGS[0]), /match_completed/);
  assert.equal((await q("select count(*)::int n from public.match_assignment_status"))[0].n, 0);
});

// ── Manager manual presence ────────────────────────────────────────────────────────────────
test("a manager marks a player present (and can undo); the opponent cannot", async () => {
  await as(U.owner);
  const r = (await q("select public.match_mark_checked_in($1, 'W1M1', $2, true) r", [T, M1_REGS[1]]))[0].r;
  assert.equal(r.status, "checked_in");
  assert.equal(r.source, "manager");
  let rows = await q("select registration_id, checked_in_at, checked_in_source from public.match_player_status");
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].registration_id), M1_REGS[1]);

  // undo clears presence only
  await q("select public.match_mark_checked_in($1, 'W1M1', $2, false)", [T, M1_REGS[1]]);
  rows = await q("select checked_in_at from public.match_player_status");
  assert.equal(rows[0].checked_in_at, null);

  // a player may not mark anyone (not even themselves) through the manager RPC
  await as(uuidFor(M1_REGS[0]));
  await assert.rejects(q("select public.match_mark_checked_in($1, 'W1M1', $2, true)", [T, M1_REGS[0]]), /Not allowed to manage/);
  await assert.rejects(q("select public.match_mark_checked_in($1, 'W1M1', $2, true)", [T, M1_REGS[1]]), /Not allowed to manage/);
});

test("a manager cannot mark someone who is not in that match", async () => {
  await as(U.td);
  await assert.rejects(q("select public.match_mark_checked_in($1, 'W1M1', $2, true)", [T, REG(7)]), /not_in_match/);
});

test("manual presence does not touch an open Contact TD message", async () => {
  await checkInAs(M1_REGS[0]);
  await as(uuidFor(M1_REGS[0]));
  await q("select public.match_contact_td($1, 'W1M1', 'opponent_not_here', 'nobody here')", [T]);
  await as(U.td);
  await q("select public.match_mark_checked_in($1, 'W1M1', $2, false)", [T, M1_REGS[0]]);
  const [row] = await q("select checked_in_at, issue_reason, resolved_at from public.match_player_status where registration_id = $1", [M1_REGS[0]]);
  assert.equal(row.checked_in_at, null);
  assert.equal(row.issue_reason, "opponent_not_here", "the message survives");
  assert.equal(row.resolved_at, null);
});

// ── Extend Time ────────────────────────────────────────────────────────────────────────────
test("Extend Time applies to THIS assignment only and accumulates", async () => {
  await as(U.td);
  let r = (await q("select public.match_extend_deadline($1, 'W1M1', 5) r", [T]))[0].r;
  assert.equal(Number(r.extendedMinutes), 5);
  r = (await q("select public.match_extend_deadline($1, 'W1M1', 10) r", [T]))[0].r;
  assert.equal(Number(r.extendedMinutes), 15, "extensions add up");
  // the tournament defaults are untouched
  const ls = (await q("select live_settings from public.tournaments where id = $1", [T]))[0].live_settings;
  assert.equal(ls.checkIn.forfeitReviewAfterMinutes, 10);
  // a NEW assignment has no extension
  await setState({ W1M1: assigned(await agoIso(0)) });
  assert.equal((await q("select count(*)::int n from public.match_assignment_status a join public.tournaments t on t.id = a.tournament_id where a.assigned_at = (t.live_settings #>> '{matchState,W1M1,assignedAt}')::timestamptz"))[0].n, 0);
});

test("Extend Time is manager-only and range-checked", async () => {
  await as(uuidFor(M1_REGS[0]));
  await assert.rejects(q("select public.match_extend_deadline($1, 'W1M1', 5)", [T]), /Not allowed to manage/);
  await as(U.td);
  for (const bad of [0, -5, 500]) {
    await assert.rejects(q("select public.match_extend_deadline($1, 'W1M1', $2)", [T, bad]), /invalid_minutes/, String(bad));
  }
});

// ── Forfeit Review sweep ───────────────────────────────────────────────────────────────────
const sweep = async () => (await q("select public._match_review_sweep() n"))[0].n;
const alerts = async () => q("select user_id, title, body, data from public.notifications where data->>'type' = 'match_review' order by id");

test("past the threshold, still unstarted → ONE alert per assignment to the event's managers", async () => {
  await setState({ W1M1: assigned(await agoIso(11)) });
  assert.equal(await sweep(), 1);
  const n = await alerts();
  assert.deepEqual(n.map((x: any) => Number(x.user_id)).sort(), [1, 3], "director + active venue owner");
  assert.match(n[0].body, /Forfeit Review/);
  assert.equal(n[0].data.match_id, "W1M1");
  assert.equal((await q("select count(*)::int n from public.net_calls"))[0].n, 1, "one push kick");

  // …and never again for the same assignment
  assert.equal(await sweep(), 0);
  assert.equal(await sweep(), 0);
  assert.equal((await alerts()).length, 2, "still just the two recipients");
});

test("no alert before the threshold, or once the match has started / been cleared / finished", async () => {
  await setState({ W1M1: assigned(await agoIso(5)) });
  assert.equal(await sweep(), 0, "below the threshold");
  await setState({ W1M1: assigned(await agoIso(30), { status: "in_progress", startedAt: await agoIso(20) }) });
  assert.equal(await sweep(), 0, "already started");
  await setState({ W1M1: assigned(await agoIso(30), { status: "completed", winner: 1 }) });
  assert.equal(await sweep(), 0, "completed");
  await setState({ W1M1: { status: "scheduled", clearedAt: await agoIso(1) } });
  assert.equal(await sweep(), 0, "cleared / unassigned");
  await setState({ W1M1: assigned(await agoIso(30)) }, null);
  assert.equal(await sweep(), 0, "check-in not required for this tournament");
  await setState({ W1M1: assigned(await agoIso(30)) });
  await q("update public.tournaments set is_paused = true where id = $1", [T]);
  assert.equal(await sweep(), 0, "paused");
  await q("update public.tournaments set is_paused = false, live_state = 'finished' where id = $1", [T]);
  assert.equal(await sweep(), 0, "tournament no longer running");
  await q("update public.tournaments set live_state = 'in_progress' where id = $1", [T]);
  assert.equal((await alerts()).length, 0);
});

test("an extension delays the alert; a NEW assignment gets its own single alert", async () => {
  await setState({ W1M1: assigned(await agoIso(11)) });
  await as(U.td);
  await q("select public.match_extend_deadline($1, 'W1M1', 10)", [T]);
  assert.equal(await sweep(), 0, "deadline moved out by 10 minutes");
  await setState({ W1M1: assigned(await agoIso(25)) }); // a brand-new assignment, well past due
  assert.equal(await sweep(), 1);
  assert.equal(await sweep(), 0);
});

test("the alert says whether nobody checked in or nobody started", async () => {
  await setState({ W1M1: assigned(await agoIso(11)) });
  await checkInAs(M1_REGS[0]);
  await checkInAs(M1_REGS[1]);
  await sweep();
  assert.match((await alerts())[0].body, /not started/);
  await q("delete from public.notifications");
  await q("delete from public.match_assignment_status");
  await setState({ W1M1: assigned(await agoIso(12)) });
  await sweep();
  assert.match((await alerts())[0].body, /players not checked in/);
});

test("nothing is ever forfeited or penalised automatically", async () => {
  await setState({ W1M1: assigned(await agoIso(60)) });
  await sweep();
  const ms = await matchState();
  assert.equal(ms.status, "scheduled");
  assert.equal(ms.winner ?? null, null);
  assert.equal(ms.result ?? null, null);
  assert.equal(ms.tableId, 71, "the table is not taken away either");
});

test("read access: managers read assignment status; sweep helpers are service-role only", async () => {
  await as(U.td);
  await q("select public.match_extend_deadline($1, 'W1M1', 5)", [T]);
  const readAs = async (uid: string) => {
    await q("begin");
    await q("select set_config('test.uid', $1, true)", [uid]);
    await q("set local role authenticated");
    const out = await q("select count(*)::int n from public.match_assignment_status");
    await q("commit");
    return out[0].n;
  };
  assert.equal(await readAs(U.td), 1);
  assert.equal(await readAs(U.owner), 1);
  assert.equal(await readAs(uuidFor(M1_REGS[0])), 1, "a player sees their own event's extension");
  assert.equal(await readAs(U.outsider), 0);
  for (const [role, priv] of [["authenticated", "insert"], ["authenticated", "update"], ["anon", "select"]] as const)
    assert.equal((await q("select has_table_privilege($1, 'public.match_assignment_status', $2) ok", [role, priv]))[0].ok, false);
  for (const fn of ["public._match_review_sweep()", "public._match_review_kick(bigint)", "public.match_review_pending(bigint)"])
    assert.equal((await q("select has_function_privilege('authenticated', $1, 'execute') ok", [fn]))[0].ok, false, fn);
  assert.equal((await q("select has_function_privilege('service_role', 'public.match_review_pending(bigint)', 'execute') ok"))[0].ok, true);
});

test("cron: one sweep job every minute", async () => {
  const jobs = await q("select jobname, schedule, command from cron.job where jobname = 'match-review-sweep'");
  assert.deepEqual(jobs, [{ jobname: "match-review-sweep", schedule: "* * * * *", command: "select public._match_review_sweep()" }]);
});

test("'opponent not here' is accepted as a Contact TD reason", async () => {
  await as(uuidFor(M1_REGS[0]));
  const r = (await q("select public.match_contact_td($1, 'W1M1', 'opponent_not_here', 'Nobody at the table') r", [T]))[0].r;
  assert.equal(r.status, "sent");
  assert.equal((await q("select issue_reason from public.match_player_status"))[0].issue_reason, "opponent_not_here");
});
