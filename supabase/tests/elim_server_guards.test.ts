// supabase/tests/elim_server_guards.test.ts
// Server-contract tests for supabase/migrations/20261017120000_elim_server_guards.sql (applied
// in prod 2026-10-02): stale-write preconditions, server-side playability, and the finished-event
// rule — on a real Postgres (PGlite) with the live migrations loaded first, then the guards.
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_server_guards.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const TD = "00000000-0000-0000-0000-000000000001";
const T = 10;
const seeds = Array.from({ length: 8 }, (_, i) => ({ registrationId: 1001 + i, name: `P${i}`, fargo: 500 }));

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const apply = async (ops: unknown[], atomic = false) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, $3) as r", [T, JSON.stringify(ops), atomic]))[0].r;
const one = async (op: unknown) => (await apply([op])).results[0];
const ms = async () => (await q("select live_settings->'matchState' m from public.tournaments where id = $1", [T]))[0].m ?? {};
const reset = async (matchState: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  q("update public.tournaments set live_settings = $2::jsonb, status = 'active', live_state = 'in_progress' where id = $1", [
    T,
    JSON.stringify({ bracket: { graph: buildBracketGraph(8, true), seeds }, matchState, ...extra }),
  ]);
const done = (w: 1 | 2, extra: Record<string, unknown> = {}) => ({ status: "completed", winner: w, result: "normal", completedAt: "2026-10-01T10:00:00.000Z", ...extra });
const live = (tableId: number) => ({ status: "in_progress", tableId, startedAt: "2026-10-01T09:00:00.000Z" });

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${TD}'::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'in_progress' not null, live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int, status text default 'available' not null);
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  await db.exec(cut(read("supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament"));
  await db.exec(read("supabase/migrations/20260922120000_elim_live_apply.sql"));
  await db.exec(read("supabase/migrations/20260923120000_elim_assign_notify.sql"));
  await db.exec(read("supabase/migrations/20260926120000_elim_clear_table.sql"));
  await db.exec(read("supabase/migrations/20261017120000_elim_server_guards.sql"));
  await q(`insert into public.profiles values ('${TD}', 1, 'tournament_director')`);
  await q("insert into public.tournaments (id, venue_id, director_id, tournament_format) values ($1, 5, 1, 'double_elimination')", [T]);
  await q("insert into public.tournament_tables values (71,$1,1,'available'),(72,$1,2,'available'),(73,$1,3,'available')", [T]);
});
beforeEach(async () => reset({}));

// ── Part 7: stale-write preconditions ──────────────────────────────────────────────────────
test("TD B with a stale view sets the OPPOSITE winner → refused; A's result stands", async () => {
  await reset({ W1M1: done(1, { tableId: 71 }) }); // A already recorded winner 1
  const r = await one({ op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: 2 }, expect: { status: "in_progress", winner: null } });
  assert.deepEqual([r.ok, r.error], [false, "stale_state"]);
  assert.equal((await ms()).W1M1.winner, 1);
});

test("A resets the match; B (still seeing it live) records a result → refused", async () => {
  await reset({ W1M1: { status: "scheduled", tableId: null } });
  const r = await one({ op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: 1 }, expect: { status: "in_progress", tableId: 71 } });
  assert.equal(r.error, "stale_state");
  assert.equal((await ms()).W1M1.status, "scheduled");
});

test("stale Reset Match (B never saw A start + score) → refused, A's live match intact", async () => {
  await reset({ W1M2: { ...live(72), p1Score: 3, p2Score: 2 } });
  const r = await one({
    op: "patch_match", matchId: "W1M2",
    set: { status: "scheduled", tableId: null, startedAt: null, winner: null, p1Score: null, p2Score: null },
    expect: { status: "scheduled", tableId: null },
  });
  assert.equal(r.error, "stale_state");
  assert.equal((await ms()).W1M2.p1Score, 3);
});

test("co-TD race around Reopen: second Reopen from a stale view of a re-completed match → refused", async () => {
  await reset({ W1M1: done(2, { tableId: 71 }) }); // A reopened then re-completed with winner 2
  const r = await one({ op: "patch_match", matchId: "W1M1", set: { status: "in_progress", winner: null, completedAt: null, result: null }, expect: { status: "completed", winner: 1 } });
  assert.equal(r.error, "stale_state");
  assert.equal((await ms()).W1M1.status, "completed");
});

test("duplicate tap / lost reply: an exact replay of an applied change is accepted (idempotent)", async () => {
  await reset({ W1M1: live(71) });
  const op = { op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: 1, result: "normal" }, expect: { status: "in_progress", winner: null } };
  assert.equal((await one(op)).ok, true);
  const again = await one(op); // the UI still showed in_progress when the 2nd tap fired
  assert.equal(again.ok, true, "replay is not stale");
  assert.equal((await ms()).W1M1.winner, 1);
});

test("reconnect then correction with a FRESH expect → accepted; ops without expect behave as before", async () => {
  await reset({ W1M1: done(1, { tableId: 71 }) });
  assert.equal((await one({ op: "patch_match", matchId: "W1M1", set: { winner: 2 }, expect: { status: "completed", winner: 1 } })).ok, true);
  assert.equal((await ms()).W1M1.winner, 2);
  assert.equal((await one({ op: "patch_match", matchId: "W1M1", set: { winner: 1 } })).ok, true, "no expect = legacy");
});

// ── Part 12: server-side playability ───────────────────────────────────────────────────────
test("a TBD (pending) match cannot be assigned, started, put live, or given a winner", async () => {
  for (const op of [
    { op: "assign", matchId: "W2M1", tableId: 71 },
    { op: "assign", matchId: "W2M1", tableId: 71, start: true },
    { op: "patch_match", matchId: "W2M1", set: { status: "in_progress" } },
    { op: "patch_match", matchId: "W2M1", set: { status: "completed", winner: 1 } },
    { op: "patch_match", matchId: "W2M1", set: { tableId: 72 } },
  ]) {
    const r = await one(op);
    assert.deepEqual([r.ok, r.error], [false, "match_not_ready"], JSON.stringify(op));
  }
  assert.deepEqual(await ms(), {}, "nothing written");
});

test("once its feeders finish the same match is playable; bye forfeits and resets stay allowed", async () => {
  await reset({ W1M1: done(1), W1M2: done(2) });
  assert.equal((await one({ op: "assign", matchId: "W2M1", tableId: 71, start: true })).ok, true);
  // a pending match holding stale progress can still be RESET (recovery path)
  await reset({ W2M2: { status: "in_progress", tableId: 72 } });
  assert.equal((await one({ op: "patch_match", matchId: "W2M2", set: { status: "scheduled", tableId: null, winner: null } })).ok, true);
  // forfeit of a bye (no winner) is not a "result with a winner"
  await q("update public.tournaments set live_settings = jsonb_set(live_settings, '{bracket,seeds,1}', 'null') where id = $1", [T]);
  assert.equal((await one({ op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: null, result: "forfeit" } })).ok, true);
});

test("a batch that completes a feeder can assign the newly-ready match in the SAME call", async () => {
  await reset({ W1M1: done(1), W1M2: live(72) });
  const r = await apply([
    { op: "patch_match", matchId: "W1M2", set: { status: "completed", winner: 2 } },
    { op: "assign", matchId: "W2M1", tableId: 71, start: true },
  ]);
  assert.deepEqual(r.results.map((x: any) => x.ok), [true, true]);
});

// ── Part 11: finished tournaments ──────────────────────────────────────────────────────────
test("finished event: live ops / reopen / reset refused; correcting a final result allowed", async () => {
  await reset({ W1M1: done(1, { tableId: 71 }), W1M2: done(1, { tableId: 72 }) });
  await q("update public.tournaments set status = 'completed', live_state = 'finished' where id = $1", [T]);
  const refused = [
    { op: "assign", matchId: "W1M3", tableId: 73 },
    { op: "start", matchId: "W1M3" },
    { op: "unassign", matchId: "W1M3" },
    { op: "set_queue", autoAssignMode: "manual" },
    { op: "patch_match", matchId: "W1M1", set: { status: "in_progress", winner: null } }, // reopen
    { op: "patch_match", matchId: "W1M1", set: { status: "scheduled", tableId: null } }, // reset
    { op: "patch_match", matchId: "W1M3", set: { status: "completed", winner: 1 } }, // new result on an unplayed match
  ];
  for (const op of refused) {
    const r = await one(op);
    assert.deepEqual([r.ok, r.error], [false, "tournament_finished"], JSON.stringify(op));
  }
  const fix = await one({ op: "patch_match", matchId: "W1M1", set: { winner: 2, p1Score: 3, p2Score: 5 }, expect: { status: "completed", winner: 1 } });
  assert.equal(fix.ok, true, "TD can still correct a recorded result after completion");
  assert.equal((await ms()).W1M1.winner, 2);
});

test("the app's expectOf(LiveMatch) precondition is what the guard compares", async () => {
  const { expectOf } = await import("../../src/utils/elim-live-ops");
  await reset({ W1M1: done(1, { tableId: 71 }) });
  const shownOnB = { status: "in_progress" as const, winner: null, tableId: 71 }; // B's stale screen
  const r = await one({ op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: 2 }, expect: expectOf(shownOnB) });
  assert.equal(r.error, "stale_state");
  const fresh = { status: "completed" as const, winner: 1 as const, tableId: 71 };
  assert.equal((await one({ op: "patch_match", matchId: "W1M1", set: { winner: 2 }, expect: expectOf(fresh) })).ok, true);
});
