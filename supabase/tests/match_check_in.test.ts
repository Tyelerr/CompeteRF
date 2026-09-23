// supabase/tests/match_check_in.test.ts
// SQL tests for supabase/migrations/20260927120000_match_check_in.sql against PGlite: the two
// RPCs' authorization, idempotency, per-ASSIGNMENT identity (an old check-in can never carry
// into a new assignment), Contact TD recipients, and the read policies.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/match_check_in.test.ts
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
const MIG = read("20260927120000_match_check_in.sql");
// Mark Resolved + the two mid-match reasons.
const MIG2 = read("20260928120000_match_issue_resolve.sql");
const PHASE5 = readFileSync(join(ROOT, "supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s + 2) + 2) + 3);
};
const CAN_MANAGE = cut(PHASE5, "create or replace function public.can_manage_tournament");

const T = 10; // double elim, venue 5, director = id_auto 1
const TC = 12; // chip
const U = {
  td: "00000000-0000-0000-0000-000000000001", // director (id_auto 1)
  admin: "00000000-0000-0000-0000-000000000002", // compete_admin (2) — manager, NOT a push recipient
  owner: "00000000-0000-0000-0000-000000000003", // active venue owner (3)
  vdir: "00000000-0000-0000-0000-000000000004", // active venue director (4)
  exOwner: "00000000-0000-0000-0000-000000000006", // ARCHIVED owner (6) — never notified
};
const P = (n: number) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const REG = (n: number) => 1000 + n; // registration ids
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const bracket = (drawNumber = 1) => ({
  generatedAt: "2026-09-01T10:00:00.000Z", drawNumber, doubleElim: true,
  graph: buildBracketGraph(8, true),
  seeds: NAMES.map((n, i) => ({ registrationId: REG(i + 1), name: n, fargo: 500 })),
});
const A1 = "2026-09-22T18:00:00.000Z";
const A2 = "2026-09-22T19:30:00.000Z";

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const as = async (uid: string | null) => q("select set_config('test.uid', $1, false)", [uid ?? ""]);
const setMs = async (ms: Record<string, unknown>, drawNumber = 1) =>
  q("update public.tournaments set live_settings = $2::jsonb where id = $1", [T, JSON.stringify({ bracket: bracket(drawNumber), matchState: ms })]);
const checkIn = async (matchId: string) => (await q("select public.match_check_in($1, $2) r", [T, matchId]))[0].r;
const contact = async (matchId: string, reason: string, msg: string | null = null) =>
  (await q("select public.match_contact_td($1, $2, $3, $4) r", [T, matchId, reason, msg]))[0].r;
const rows = async () =>
  q(`select registration_id, match_id, assigned_at, draw_number dn, checked_in_at is not null checked,
            issue_reason, issue_message from public.match_player_status order by id`);
/** timestamptz equality (never compare rendered text — PGlite prints in the session zone). */
const sameTs = (a: unknown, iso: string) => Date.parse(String(a)) === Date.parse(iso);
const notifs = async () => q("select user_id, title, body, data from public.notifications order by id");
/** W1M1's two registrations, resolved the same way the RPC does. */
let M1_REGS: number[] = [];

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
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
    -- prod grants these to clients; the read policy is evaluated AS the caller, so it needs them
    grant select on public.tournament_players, public.profiles, public.tournaments to authenticated;
  `);
  await db.exec(CAN_MANAGE);
  await db.exec(M1);
  await db.exec(M2);
  await db.exec(M4);
  await db.exec(MIG);
  await db.exec(MIG2);
  await db.exec(`
    insert into public.profiles (id, id_auto, role, user_name, first_name, last_name) values
      ('${U.td}', 1, 'tournament_director', 'td', 'Tina', 'Director'),
      ('${U.admin}', 2, 'compete_admin', 'admin', 'Al', 'Admin'),
      ('${U.owner}', 3, 'bar_owner', 'owner', 'Ola', 'Owner'),
      ('${U.vdir}', 4, 'tournament_director', 'vdir', 'Vic', 'Venue'),
      ('${U.exOwner}', 6, 'bar_owner', 'exowner', 'Ex', 'Owner');
    insert into public.venue_owners (venue_id, owner_id, archived_at) values (5, 3, null), (5, 6, now());
    insert into public.venue_directors (venue_id, director_id, archived_at) values (5, 4, null);
    insert into public.tournaments (id, name, venue_id, director_id, tournament_format) values
      (${T}, 'Test 2 elim 1', 5, 1, 'double_elimination'), (${TC}, 'Chip night', 5, 1, 'chip-tournament');
    insert into public.tournament_tables (id, tournament_id, table_number) values (71, ${T}, 1), (72, ${T}, 2);
  `);
  for (let n = 1; n <= 8; n++) {
    await q("insert into public.profiles (id, id_auto, user_name, first_name, last_name) values ($1, $2, $3, $4, 'Player')",
      [P(n), 100 + n, `p${n}`, NAMES[n - 1]]);
    await q("insert into public.tournament_players (id, tournament_id, player_id) values ($1, $2, $3)", [REG(n), T, 100 + n]);
  }
  await setMs({});
  const who = (await q("select public._elim_resolve(live_settings) -> 'W1M1' w from public.tournaments where id = $1", [T]))[0].w;
  M1_REGS = [Number(who.p1), Number(who.p2)];
});

beforeEach(async () => {
  await q("delete from public.match_player_status");
  await q("delete from public.notifications");
  await setMs({ W1M1: { status: "scheduled", tableId: 71, assignedAt: A1 } });
});
const playerUuidFor = (reg: number) => P(reg - 1000);

// ── Check in ───────────────────────────────────────────────────────────────────────────────
test("a player checks in for their own match; the opponent stays unchecked", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  const r = await checkIn("W1M1");
  assert.equal(r.status, "checked_in");
  assert.equal(Number(r.registrationId), M1_REGS[0]);
  const all = await rows();
  assert.equal(all.length, 1, "only the caller's row exists");
  assert.equal(Number(all[0].registration_id), M1_REGS[0]);
  assert.equal(all[0].checked, true);
  assert.ok(sameTs(all[0].assigned_at, A1), "the row carries the match's assignedAt");
  // the opponent has no row → shown as ○ until they check in themselves
  assert.equal(all.some((x: any) => Number(x.registration_id) === M1_REGS[1]), false);
});

test("check in is idempotent — repeat taps keep the first time and add no rows", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  const first = await checkIn("W1M1");
  const again = await checkIn("W1M1");
  assert.equal(String(first.checkedInAt), String(again.checkedInAt));
  assert.equal((await rows()).length, 1);
});

test("a player cannot check in for a match they are not in, and an outsider cannot check in at all", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await assert.rejects(checkIn("W1M2"), /Not a player in this match/);
  await as(U.td); // the TD is not a player
  await assert.rejects(checkIn("W1M1"), /Not a player in this match/);
  await as(null);
  await assert.rejects(checkIn("W1M1"), /Not signed in|Not a player/);
  assert.equal((await rows()).length, 0);
});

test("check in is refused when the match is not assigned, or completed", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await setMs({ W1M1: { status: "scheduled" } }); // no table
  await assert.rejects(checkIn("W1M1"), /match_not_assigned/);
  await setMs({ W1M1: { status: "scheduled", tableId: 71 } }); // table but no assignedAt
  await assert.rejects(checkIn("W1M1"), /match_not_assigned/);
  await setMs({ W1M1: { status: "completed", winner: 1, tableId: 71, assignedAt: A1 } });
  await assert.rejects(checkIn("W1M1"), /match_completed/);
  await assert.rejects(q("select public.match_check_in($1, $2)", [TC, "W1M1"]), /not found/i);
  assert.equal((await rows()).length, 0);
});

// ── Assignment identity / reset rules ──────────────────────────────────────────────────────
test("a NEW assignment (new assignedAt) never inherits the old check-in", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  // Clear Table → unassigned; then re-assigned to another table with a fresh stamp
  await setMs({ W1M1: { status: "scheduled", clearedAt: A1 } });
  await assert.rejects(checkIn("W1M1"), /match_not_assigned/);
  await setMs({ W1M1: { status: "scheduled", tableId: 72, assignedAt: A2 } });
  const all = await rows();
  assert.equal(all.length, 1, "the old row is history, not current state");
  assert.ok(sameTs(all[0].assigned_at, A1), "the row carries the match's assignedAt");
  // the CURRENT assignment has no row → the player shows as ○ and must check in again
  const current = await q("select * from public.match_player_status where assigned_at = $1", [A2]);
  assert.equal(current.length, 0);
  await checkIn("W1M1");
  assert.equal((await rows()).length, 2, "a separate row per assignment");
});

test("the SAME assignment saved again keeps the check-in", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await setMs({ W1M1: { status: "scheduled", tableId: 71, assignedAt: A1, p1Score: 0 } }); // same stamp
  const r = await checkIn("W1M1");
  assert.equal((await rows()).length, 1);
  assert.equal(r.status, "checked_in");
});

test("a new draw gives a fresh assignment identity", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await setMs({ W1M1: { status: "scheduled", tableId: 71, assignedAt: A1 } }, 2); // redrawn
  await checkIn("W1M1");
  const all = await rows();
  assert.deepEqual(all.map((r: any) => r.dn).sort(), [1, 2]);
});

// ── Contact TD ─────────────────────────────────────────────────────────────────────────────
test("Contact TD records the issue and notifies the people running THIS event only", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  const r = await contact("W1M1", "equipment", "Cue ball is chipped");
  assert.equal(r.status, "sent");
  assert.equal(Number(r.recipients), 3);
  const n = await notifs();
  assert.deepEqual(n.map((x: any) => Number(x.user_id)).sort(), [1, 3, 4], "director + active owner + active venue director");
  assert.equal(n.some((x: any) => Number(x.user_id) === 2), false, "no global-admin push noise");
  assert.equal(n.some((x: any) => Number(x.user_id) === 6), false, "archived owner never notified");
  assert.equal(n.some((x: any) => [101, 102, 103].includes(Number(x.user_id))), false, "no player broadcast");
  assert.equal(n[0].title, "Test 2 elim 1");
  assert.match(n[0].body, /Equipment issue: Cue ball is chipped/);
  assert.equal(n[0].data.type, "match_issue");
  assert.equal(n[0].data.match_id, "W1M1");
  const [row] = await rows();
  assert.equal(row.issue_reason, "equipment");
  assert.equal(row.issue_message, "Cue ball is chipped");
});

test("Contact TD validates the reason and the message, and works without a message", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await assert.rejects(contact("W1M1", "hangry"), /invalid_reason/);
  await assert.rejects(contact("W1M1", null as any), /invalid_reason/);
  await assert.rejects(contact("W1M1", "other", "x".repeat(281)), /message_too_long/);
  const r = await contact("W1M1", "running_late");
  assert.equal(r.status, "sent");
  const [row] = await rows();
  assert.equal(row.issue_message, null);
  assert.match((await notifs())[0].body, /Running late$/);
});

test("Contact TD uses the same participant rule as check-in", async () => {
  await as(U.td);
  await assert.rejects(contact("W1M1", "other", "hi"), /Not a player in this match/);
  await as(playerUuidFor(M1_REGS[0]));
  await assert.rejects(contact("W1M2", "other", "hi"), /Not a player in this match/);
  assert.equal((await notifs()).length, 0);
});

test("check-in and an issue share ONE row per assignment (both states visible to the TD)", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await contact("W1M1", "running_late", "10 minutes away");
  const all = await rows();
  assert.equal(all.length, 1);
  assert.equal(all[0].checked, true);
  assert.equal(all[0].issue_reason, "running_late");
});

// ── Read access ────────────────────────────────────────────────────────────────────────────
test("RLS: players read only their own rows; managers read the event's rows; nobody can write directly", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await as(playerUuidFor(M1_REGS[1]));
  await checkIn("W1M1");

  const readAs = async (uid: string) => {
    await q("begin");
    await q("select set_config('test.uid', $1, true)", [uid]);
    await q("set local role authenticated");
    const out = await q("select registration_id from public.match_player_status");
    await q("commit");
    return out.map((r: any) => Number(r.registration_id)).sort();
  };
  assert.deepEqual(await readAs(playerUuidFor(M1_REGS[0])), [M1_REGS[0]], "own row only");
  assert.deepEqual(await readAs(playerUuidFor(M1_REGS[1])), [M1_REGS[1]]);
  assert.deepEqual(await readAs(U.td), [...M1_REGS].sort(), "director sees both");
  assert.deepEqual(await readAs(U.owner), [...M1_REGS].sort(), "venue owner sees both");
  assert.deepEqual(await readAs(U.admin), [...M1_REGS].sort(), "admin can still see it in the manager UI");
  assert.deepEqual(await readAs(U.exOwner), [], "archived owner sees nothing");

  for (const [role, priv] of [["authenticated", "insert"], ["authenticated", "update"], ["authenticated", "delete"], ["anon", "select"]] as const)
    assert.equal((await q("select has_table_privilege($1, 'public.match_player_status', $2) ok", [role, priv]))[0].ok, false, `${role} ${priv}`);
  for (const fn of ["public._match_player_context(bigint, text)", "public._match_issue_recipients(bigint)"])
    assert.equal((await q("select has_function_privilege('authenticated', $1, 'execute') ok", [fn]))[0].ok, false, fn);
  for (const fn of ["public.match_check_in(bigint, text)", "public.match_contact_td(bigint, text, text, text)"]) {
    assert.equal((await q("select has_function_privilege('authenticated', $1, 'execute') ok", [fn]))[0].ok, true, fn);
    assert.equal((await q("select has_function_privilege('anon', $1, 'execute') ok", [fn]))[0].ok, false, fn);
  }
});

test("the match's live state is never modified by either RPC", async () => {
  const before = (await q("select live_settings from public.tournaments where id = $1", [T]))[0].live_settings;
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await contact("W1M1", "table_missing", "Where is Diamond 1?");
  const after = (await q("select live_settings from public.tournaments where id = $1", [T]))[0].live_settings;
  assert.deepEqual(after, before, "no live_settings write at all");
});

// ── Tournament-management roles ─────────────────────────────────────────────────────────────
test("every ACTIVE event manager can read the ○/✓/? status and the issue details", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await contact("W1M1", "equipment", "Cue ball is chipped");

  const readAs = async (uid: string) => {
    await q("begin");
    await q("select set_config('test.uid', $1, true)", [uid]);
    await q("set local role authenticated");
    const out = await q(
      `select registration_id, checked_in_at is not null checked, issue_reason, issue_message
         from public.match_player_status where tournament_id = $1 and match_id = 'W1M1'`, [T]);
    await q("commit");
    return out;
  };
  for (const [who, uid] of [["director", U.td], ["venue owner", U.owner], ["venue director", U.vdir], ["compete admin", U.admin]] as const) {
    const rowsSeen = await readAs(uid);
    assert.equal(rowsSeen.length, 1, who);
    assert.equal(rowsSeen[0].checked, true, who);
    assert.equal(rowsSeen[0].issue_reason, "equipment", who);
    assert.equal(rowsSeen[0].issue_message, "Cue ball is chipped", `${who} can read the issue details`);
  }
  // an archived venue owner is not a manager any more
  assert.deepEqual(await readAs(U.exOwner), []);
  // …and the two players see only their own row
  assert.equal((await readAs(playerUuidFor(M1_REGS[0]))).length, 1);
  assert.equal((await readAs(playerUuidFor(M1_REGS[1]))).length, 0);
});

test("a manager holding SEVERAL roles gets exactly ONE notification", async () => {
  // the director (id_auto 1) is also an active venue owner AND venue director of the same venue
  await q("insert into public.venue_owners (venue_id, owner_id, archived_at) values (5, 1, null)");
  await q("insert into public.venue_directors (venue_id, director_id, archived_at) values (5, 1, null)");
  try {
    await as(playerUuidFor(M1_REGS[0]));
    const r = await contact("W1M1", "running_late", "5 minutes out");
    const n = await notifs();
    assert.deepEqual(n.filter((x: any) => Number(x.user_id) === 1).length, 1, "one row for the multi-role manager");
    assert.deepEqual(n.map((x: any) => Number(x.user_id)).sort(), [1, 3, 4], "still one per person");
    assert.equal(Number(r.recipients), 3);
  } finally {
    await q("delete from public.venue_owners where venue_id = 5 and owner_id = 1");
    await q("delete from public.venue_directors where venue_id = 5 and director_id = 1");
  }
});

test("managers of OTHER venues, archived managers and players are never notified", async () => {
  // an active owner + director of a different venue, and a different tournament at that venue
  await q("insert into public.profiles (id, id_auto, role, user_name) values ('00000000-0000-0000-0000-000000000009', 9, 'bar_owner', 'other')");
  await q("insert into public.venue_owners (venue_id, owner_id, archived_at) values (99, 9, null)");
  await q("insert into public.venue_directors (venue_id, director_id, archived_at) values (99, 9, null)");
  try {
    await as(playerUuidFor(M1_REGS[1]));
    await contact("W1M1", "other", "hello");
    const ids = (await notifs()).map((x: any) => Number(x.user_id));
    assert.deepEqual(ids.sort(), [1, 3, 4]);
    assert.equal(ids.includes(9), false, "unrelated venue manager");
    assert.equal(ids.includes(6), false, "archived owner");
    assert.equal(ids.includes(2), false, "global admin not pushed");
    assert.equal(ids.some((i: number) => i >= 101), false, "no players");
  } finally {
    await q("delete from public.venue_owners where venue_id = 99");
    await q("delete from public.venue_directors where venue_id = 99");
  }
});

// ── Mark Resolved + mid-match reasons (20260928120000) ──────────────────────────────────────
test("all six Contact TD reasons are accepted, pre-match and mid-match", async () => {
  for (const reason of ["running_late", "table_missing", "equipment", "dispute", "watch_shot", "other"]) {
    await as(playerUuidFor(M1_REGS[0]));
    const r = await contact("W1M1", reason, `${reason} message`);
    assert.equal(r.status, "sent", reason);
    assert.equal((await rows())[0].issue_reason, reason);
  }
  // …including while the match is IN PROGRESS
  await setMs({ W1M1: { status: "in_progress", tableId: 71, assignedAt: A1, startedAt: A1 } });
  assert.equal((await contact("W1M1", "dispute", "He fouled")).status, "sent");
  await assert.rejects(contact("W1M1", "nonsense"), /invalid_reason/);
});

test("Mark Resolved clears the indicator and NEVER clears the check-in", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await contact("W1M1", "dispute", "Need a ruling");
  let [row] = await rows();
  assert.equal(row.checked, true);
  assert.equal(row.issue_reason, "dispute");

  await as(U.td);
  const r = (await q("select public.match_issue_resolve($1, 'W1M1', $2) r", [T, M1_REGS[0]]))[0].r;
  assert.equal(r.status, "resolved");
  assert.equal(r.checkedIn, true);
  const after = await q("select checked_in_at, issue_at, resolved_at, issue_reason from match_player_status where registration_id = $1", [M1_REGS[0]]);
  assert.ok(after[0].checked_in_at, "check-in survives resolution");
  assert.ok(after[0].resolved_at, "issue is resolved");
  assert.ok(after[0].issue_at, "issue history is kept");
  // idempotent
  assert.equal((await q("select public.match_issue_resolve($1, 'W1M1', $2) r", [T, M1_REGS[0]]))[0].r.status, "no_open_issue");
});

test("only managers of THIS event can resolve; players and outsiders cannot", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await contact("W1M1", "equipment", "broken rack");
  for (const [who, uid] of [["the player", playerUuidFor(M1_REGS[0])], ["the opponent", playerUuidFor(M1_REGS[1])]] as const) {
    await as(uid);
    await assert.rejects(q("select public.match_issue_resolve($1, 'W1M1', $2)", [T, M1_REGS[0]]), /Not allowed to manage/, who);
  }
  const stillOpen = await q("select resolved_at from match_player_status where registration_id = $1", [M1_REGS[0]]);
  assert.equal(stillOpen[0].resolved_at, null);
  // every active event manager can
  for (const uid of [U.td, U.owner, U.vdir]) {
    await q("update match_player_status set resolved_at = null where registration_id = $1", [M1_REGS[0]]);
    await as(uid);
    assert.equal((await q("select public.match_issue_resolve($1, 'W1M1', $2) r", [T, M1_REGS[0]]))[0].r.status, "resolved", uid);
  }
});

test("resolving one player's issue leaves the other player untouched", async () => {
  await as(playerUuidFor(M1_REGS[0]));
  await checkIn("W1M1");
  await contact("W1M1", "running_late", "10 min");
  await as(playerUuidFor(M1_REGS[1]));
  await contact("W1M1", "equipment", "cue broken");
  await as(U.td);
  await q("select public.match_issue_resolve($1, 'W1M1', $2)", [T, M1_REGS[0]]);
  const all = await q("select registration_id, checked_in_at is not null checked, resolved_at from match_player_status order by registration_id");
  const mine = all.find((r: any) => Number(r.registration_id) === M1_REGS[0]);
  const theirs = all.find((r: any) => Number(r.registration_id) === M1_REGS[1]);
  assert.ok(mine.resolved_at, "mine resolved");
  assert.equal(mine.checked, true, "my check-in intact");
  assert.equal(theirs.resolved_at, null, "the opponent's issue stays open");
});
