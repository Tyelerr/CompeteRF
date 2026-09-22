// supabase/tests/elim_live_apply.test.ts
// SQL-level tests for supabase/migrations/20260922120000_elim_live_apply.sql, executed against
// a real Postgres (PGlite = Postgres compiled to WASM, in-process). The migration is loaded
// verbatim; only the surrounding Supabase objects it depends on (auth.uid(), profiles,
// tournaments, tournament_players, tournament_tables, venue_owners, venue_directors,
// current_player_id) are stubbed. can_manage_tournament is loaded from its real migration.
//
// Run (PGlite is not a project dependency — point PGLITE_MODULE at an install):
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_live_apply.test.ts
//
// NOTE: PGlite is single-connection, so "concurrent" cases are tested as every serial
// interleaving of the two writers. Real concurrency is serialized by the FOR UPDATE row lock
// every writer takes (standard Postgres semantics), so the serial orders are exactly the
// outcomes that can occur.
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { RaceConfig } from "../../src/utils/bracket.utils";
import { resolveBracket, MatchResult } from "../../src/utils/bracket.resolve";
import { buildLiveMatches } from "../../src/utils/match.utils";
import { buildQueueEntries, computeReadyAtMap, freeTables, orderQueue, planAutoAssign } from "../../src/utils/queue.utils";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/20260922120000_elim_live_apply.sql"), "utf8");
const PHASE5 = readFileSync(join(ROOT, "supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const CAN_MANAGE = cut(PHASE5, "create or replace function public.can_manage_tournament");

// ── Users ──────────────────────────────────────────────────────────────────────
const U = {
  td: "00000000-0000-0000-0000-000000000001", // director of T (id_auto 1)
  admin: "00000000-0000-0000-0000-000000000002", // compete_admin (2)
  owner: "00000000-0000-0000-0000-000000000003", // active venue owner of venue 5 (3)
  vdir: "00000000-0000-0000-0000-000000000004", // active venue director of venue 5 (4)
  outsider: "00000000-0000-0000-0000-000000000005", // basic user (5)
  exOwner: "00000000-0000-0000-0000-000000000006", // ARCHIVED venue owner (6)
};
// players: uuid ...1xx, id_auto 100+n, registration id 1000+n
const P = (n: number) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const T = 10; // tournament id (double elim, 8 players)
const TS = 11; // single elim, 8 players
const TC = 12; // chip tournament
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
const seeds = NAMES.map((n, i) => ({ registrationId: 1001 + i, name: n, fargo: 500 }));
const bracketOf = (dbl: boolean) => ({
  generatedAt: "2026-09-01T10:00:00.000Z",
  drawType: "random",
  format: dbl ? "double_elimination" : "single_elimination",
  drawNumber: 1,
  players: 8,
  bracketSize: 8,
  byes: 0,
  round1: [],
  doubleElim: dbl,
  graph: buildBracketGraph(8, dbl),
  seeds,
});

let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const as = async (uid: string | null) => {
  await q("select set_config('test.uid', $1, false)", [uid ?? ""]);
};
const apply = async (tid: number, ops: unknown[], atomic = false) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, $3) as r", [tid, JSON.stringify(ops), atomic]))[0].r;
const score = async (tid: number, matchId: string, patch: Record<string, unknown>) =>
  (await q("select public.submit_match_state($1, $2, $3::jsonb) as r", [tid, matchId, JSON.stringify(patch)]))[0].r;
const ls = async (tid: number) => (await q("select live_settings from public.tournaments where id = $1", [tid]))[0].live_settings;
const ms = async (tid: number) => (await ls(tid)).matchState ?? {};
const reset = async (tid: number, matchState: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
  await q("update public.tournaments set live_settings = $2::jsonb, live_state = 'registration_closed' where id = $1", [
    tid,
    JSON.stringify({ bracket: bracketOf(tid !== TS), matchState, raceMode: "fixed", fixedRaceWinners: 5, ...extra }),
  ]);
};
const done = (w: 1 | 2) => ({ status: "completed", winner: w, completedAt: "2026-09-01T10:30:00.000Z", result: "normal" });

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (
      id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'not_started' not null,
      live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int,
      player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int,
      status text default 'available' not null);
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create function public.current_player_id() returns uuid language sql stable as
      $$ select null::uuid $$;
  `);
  await db.exec(CAN_MANAGE);
  await db.exec(MIGRATION);
  await db.exec(`
    insert into public.profiles (id, id_auto, role) values
      ('${U.td}', 1, 'tournament_director'), ('${U.admin}', 2, 'compete_admin'),
      ('${U.owner}', 3, 'bar_owner'), ('${U.vdir}', 4, 'tournament_director'),
      ('${U.outsider}', 5, 'basic_user'), ('${U.exOwner}', 6, 'bar_owner');
    insert into public.venue_owners values (5, 3, null), (5, 6, now());
    insert into public.venue_directors values (5, 4, null);
    insert into public.tournaments (id, venue_id, director_id, tournament_format) values
      (${T}, 5, 1, 'double_elimination'), (${TS}, 5, 1, 'single_elimination'), (${TC}, 5, 1, 'chip-tournament');
    insert into public.tournament_tables (id, tournament_id, table_number, status) values
      (71, ${T}, 1, 'available'), (72, ${T}, 2, 'available'), (73, ${T}, 3, 'available'),
      (74, ${T}, 4, 'unavailable'), (75, ${TS}, 1, 'available'), (76, ${TS}, 2, 'available');
  `);
  for (let n = 1; n <= 8; n++) {
    await q("insert into public.profiles (id, id_auto) values ($1, $2)", [P(n), 100 + n]);
    for (const tid of [T, TS])
      await q("insert into public.tournament_players (id, tournament_id, player_id) values ($1, $2, $3)", [
        tid === T ? 1000 + n : 2000 + n, tid, 100 + n,
      ]);
  }
  // Single-elim seeds use registration ids 2001..2008 (own tournament_players rows).
  await q(
    "update public.tournaments set live_settings = $1::jsonb where id = $2",
    [JSON.stringify({ bracket: { ...bracketOf(false), seeds: seeds.map((s) => ({ ...s, registrationId: s.registrationId + 1000 })) } }), TS],
  );
});

// ── Resolver parity: SQL _elim_resolve vs the app's TypeScript resolveBracket ─────────────
const cfg: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null };
test("server resolver matches the client resolver across random play-throughs (single + double, byes, forfeits, withdrawals, GF reset)", async () => {
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checks = 0;
  for (const size of [4, 8, 16]) {
    for (const dbl of [false, true]) {
      for (let run = 0; run < 6; run++) {
        const seedList = Array.from({ length: size }, (_, i) =>
          i % 5 === 3 && run % 2 === 1 ? null : { registrationId: 500 + i, name: `P${i}`, fargo: 500 },
        );
        const graph = buildBracketGraph(size, dbl);
        const matchState: Record<string, any> = {};
        for (let step = 0; step < 4 * size; step++) {
          const results: Record<string, MatchResult> = {};
          for (const [id, st] of Object.entries(matchState))
            results[id] = { completed: st.status === "completed", winner: st.winner ?? null, result: st.result ?? null };
          const tsr = resolveBracket(graph, seedList as any, results, { ...cfg });
          const lsj = { bracket: { graph, seeds: seedList }, matchState };
          const sql = (await q("select public._elim_resolve($1::jsonb) as r", [JSON.stringify(lsj)]))[0].r;
          for (const m of tsr.matches) {
            const exp = {
              p1: m.s1.player?.registrationId ?? null,
              p2: m.s2.player?.registrationId ?? null,
              real: !m.isBye && !m.isEmpty && !m.pending && !m.skipped,
            };
            assert.deepEqual(sql[m.id], exp, `size=${size} dbl=${dbl} run=${run} step=${step} ${m.id}`);
            checks++;
          }
          // advance: complete a random playable match (occasionally forfeit/withdraw; sometimes forfeit a bye)
          const playable = tsr.matches.filter((m) => !m.isBye && !m.isEmpty && !m.pending && !m.skipped && !results[m.id]?.completed);
          const byes = tsr.matches.filter((m) => m.isBye && !results[m.id]?.completed);
          if (byes.length && rand() < 0.08) {
            matchState[byes[0].id] = { status: "completed", winner: null, result: "forfeit" };
            continue;
          }
          if (!playable.length) break;
          const m = playable[Math.floor(rand() * playable.length)];
          const r = rand();
          matchState[m.id] = {
            status: "completed",
            winner: rand() < 0.5 ? 1 : 2,
            result: r < 0.1 ? "withdraw" : r < 0.2 ? "forfeit" : "normal",
          };
        }
      }
    }
  }
  assert.ok(checks > 2000, `ran ${checks} checks`);
});

// ── Concurrency (all serial interleavings of the row-locked writers) ──────────────────────
test("A. TD assigns W5 while a player scores W2 → both survive (either order)", async () => {
  // W2 = W1M2 (Cy 1003 vs Di 1004) in progress on table 71; W5 = W2M1 needs W1M1+W1M2… use a ready R1 match instead:
  // TD assigns W1M3 (Ed vs Fay) to table 72; player Cy scores W1M2.
  for (const order of ["playerFirst", "tdFirst"]) {
    await reset(T, { W1M2: { status: "in_progress", tableId: 71, startedAt: "2026-09-01T10:05:00.000Z", p1Score: 2, p2Score: 1 } });
    const player = async () => {
      await as(P(3));
      await score(T, "W1M2", { p1Score: 3, p2Score: 1, status: "in_progress" });
    };
    const td = async () => {
      await as(U.td);
      const r = await apply(T, [{ op: "assign", matchId: "W1M3", tableId: 72 }]);
      assert.equal(r.results[0].ok, true);
    };
    if (order === "playerFirst") { await player(); await td(); } else { await td(); await player(); }
    const s = await ms(T);
    assert.equal(s.W1M2.p1Score, 3, order);
    assert.equal(s.W1M2.tableId, 71, order);
    assert.equal(s.W1M3.tableId, 72, order);
    assert.equal(s.W1M3.status, "scheduled", order);
  }
});

test("A (control). The OLD whole-object TD write from a stale snapshot loses the player's score", async () => {
  await reset(T, { W1M2: { status: "in_progress", tableId: 71, p1Score: 2, p2Score: 1 } });
  const stale = await ls(T); // TD's cached copy
  await as(P(3));
  await score(T, "W1M2", { p1Score: 3, p2Score: 1 });
  // old client path: {...prevLS, matchState: {...prevMS, W1M3: {...}}} written wholesale
  const blob = { ...stale, matchState: { ...stale.matchState, W1M3: { status: "scheduled", tableId: 72 } } };
  await q("update public.tournaments set live_settings = $1::jsonb where id = $2", [JSON.stringify(blob), T]);
  assert.equal((await ms(T)).W1M2.p1Score, 2); // the race this migration removes
});

test("B. TD reorders the schedule while another TD assigns → both survive (either order)", async () => {
  for (const order of [0, 1]) {
    await reset(T, {}, { queueOrder: ["W1M1", "W1M2"], autoAssignMode: "balanced" });
    const reorder = async () => {
      await as(U.td);
      await apply(T, [{ op: "set_queue", queueOrder: ["W1M4", "W1M3", "W1M2", "W1M1"], autoAssignMode: "manual" }]);
    };
    const assign = async () => {
      await as(U.admin);
      await apply(T, [{ op: "assign", matchId: "W1M1", tableId: 71 }]);
    };
    if (order === 0) { await reorder(); await assign(); } else { await assign(); await reorder(); }
    const l = await ls(T);
    assert.deepEqual(l.queueOrder, ["W1M4", "W1M3", "W1M2", "W1M1"]);
    assert.equal(l.autoAssignMode, "manual");
    assert.equal(l.matchState.W1M1.tableId, 71);
  }
});

test("C. Auto Assign batch while a player scores one of those matches → score kept, conflicting assign skipped", async () => {
  await reset(T);
  // player of W1M1 starts/scores it before the TD's batch lands
  await as(P(1));
  await score(T, "W1M1", { p1Score: 1, p2Score: 0, status: "in_progress" });
  await as(U.td);
  const r = await apply(T, [
    { op: "assign", matchId: "W1M1", tableId: 71 },
    { op: "assign", matchId: "W1M2", tableId: 72 },
    { op: "assign", matchId: "W1M3", tableId: 73 },
  ]);
  assert.deepEqual(r.results.map((x: any) => x.ok), [false, true, true]);
  assert.equal(r.results[0].error, "match_in_progress");
  const s = await ms(T);
  assert.equal(s.W1M1.p1Score, 1);
  assert.equal(s.W1M1.status, "in_progress");
  assert.equal(s.W1M1.tableId, undefined); // the rejected op changed nothing
  assert.equal(s.W1M2.tableId, 72);
  assert.equal(s.W1M3.tableId, 73);
});

test("two TDs assign the same table → second rejected (table_occupied)", async () => {
  await reset(T);
  await as(U.td);
  assert.equal((await apply(T, [{ op: "assign", matchId: "W1M1", tableId: 71 }])).results[0].ok, true);
  await as(U.owner);
  const r = await apply(T, [{ op: "assign", matchId: "W1M2", tableId: 71 }]);
  assert.deepEqual(r.results[0], { i: 0, ok: false, error: "table_occupied" });
  assert.equal((await ms(T)).W1M2, undefined);
  // a completed match no longer holds its table
  await as(U.td);
  await apply(T, [{ op: "patch_match", matchId: "W1M1", set: { ...done(1) } }]);
  assert.equal((await apply(T, [{ op: "assign", matchId: "W1M2", tableId: 71 }])).results[0].ok, true);
});

test("assign against a match already in progress / completed → rejected", async () => {
  await reset(T, { W1M1: { status: "in_progress", tableId: 71 }, W1M2: done(2) });
  await as(U.td);
  const r = await apply(T, [
    { op: "assign", matchId: "W1M1", tableId: 72 },
    { op: "assign", matchId: "W1M2", tableId: 72 },
  ]);
  assert.deepEqual(r.results.map((x: any) => x.error), ["match_in_progress", "match_completed"]);
});

test("batch with one occupied table → the other valid ops still succeed; failed op mutates nothing", async () => {
  await reset(T, { W1M4: { status: "in_progress", tableId: 71 } });
  await as(U.td);
  const r = await apply(T, [
    { op: "assign", matchId: "W1M1", tableId: 72, start: true },
    { op: "assign", matchId: "W1M2", tableId: 71, start: true }, // occupied by W1M4
    { op: "assign", matchId: "W1M3", tableId: 73, start: true },
  ]);
  assert.deepEqual(r.results.map((x: any) => x.ok), [true, false, true]);
  assert.equal(r.results[1].error, "table_occupied");
  assert.equal(r.live_state, "in_progress"); // first real start → Running
  const s = await ms(T);
  assert.equal(s.W1M2, undefined);
  assert.equal(s.W1M1.status, "in_progress");
  assert.match(s.W1M1.startedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test("atomic batch: any failure rolls back the whole call", async () => {
  await reset(T, { W1M4: { status: "in_progress", tableId: 71 } });
  await as(U.td);
  const before = await ls(T);
  await assert.rejects(
    apply(T, [
      { op: "assign", matchId: "W1M1", tableId: 72 },
      { op: "assign", matchId: "W1M2", tableId: 71 },
    ], true),
    /table_occupied/,
  );
  assert.deepEqual(await ls(T), before);
  // and a clean atomic batch commits everything
  const ok = await apply(T, [
    { op: "assign", matchId: "W1M1", tableId: 72 },
    { op: "assign", matchId: "W1M2", tableId: 73 },
  ], true);
  assert.deepEqual(ok.results.map((x: any) => x.ok), [true, true]);
});

test("set_queue changes only queueOrder / autoAssignMode; validates ids + mode", async () => {
  await reset(T, { W1M1: { status: "in_progress", tableId: 71, p1Score: 2 } }, { prizePool: { x: 1 }, autoAssignMode: "balanced" });
  await as(U.td);
  const before = await ls(T);
  await apply(T, [{ op: "set_queue", queueOrder: ["W1M2", "L1M1"] }]);
  const after = await ls(T);
  assert.deepEqual({ ...after, queueOrder: undefined }, { ...before, queueOrder: undefined });
  assert.deepEqual(after.queueOrder, ["W1M2", "L1M1"]);
  const bad = await apply(T, [
    { op: "set_queue", queueOrder: ["W1M2", "ZZZ"] },
    { op: "set_queue", autoAssignMode: "fastest" },
    { op: "set_queue", queueOrder: [1, 2] },
    { op: "set_queue" },
  ]);
  assert.deepEqual(bad.results.map((x: any) => x.error), ["unknown_match", "invalid_mode", "unknown_match", "empty_op"]);
  assert.deepEqual((await ls(T)).queueOrder, ["W1M2", "L1M1"]);
});

test("patch_match changes only the targeted match; field whitelist + value validation", async () => {
  await reset(T, { W1M1: { status: "in_progress", tableId: 71 }, W1M2: { status: "in_progress", tableId: 72, p1Score: 1 } });
  await as(U.td);
  const before = await ms(T);
  await apply(T, [{ op: "patch_match", matchId: "W1M1", set: { p1Score: 4, p2Score: 2, timerSeconds: 3600 } }]);
  const after = await ms(T);
  assert.deepEqual(after.W1M2, before.W1M2);
  assert.deepEqual(after.W1M1, { ...before.W1M1, p1Score: 4, p2Score: 2, timerSeconds: 3600 });
  const bad = await apply(T, [
    { op: "patch_match", matchId: "W1M1", set: { preferredTableId: 72 } },
    { op: "patch_match", matchId: "W1M1", set: { winner: 3 } },
    { op: "patch_match", matchId: "W1M1", set: { p1Score: -1 } },
    { op: "patch_match", matchId: "W1M1", set: { p1Score: 1.5 } },
    { op: "patch_match", matchId: "W1M1", set: { status: "done" } },
    { op: "patch_match", matchId: "W1M1", set: { startedAt: "not a date" } },
    { op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: null } },
    { op: "patch_match", matchId: "W1M1", set: { tableId: 74 } },
    { op: "patch_match", matchId: "W1M1", set: { tableId: 75 } },
    { op: "patch_match", matchId: "W1M1", set: { tableId: 72 } },
    { op: "patch_match", matchId: "NOPE", set: { p1Score: 1 } },
    { op: "assign", matchId: "W1M3", tableId: 7.5 },
    { op: "explode" },
  ]);
  assert.deepEqual(bad.results.map((x: any) => x.error), [
    "invalid_field", "invalid_value", "invalid_value", "invalid_value", "invalid_value", "invalid_value",
    "invalid_transition", "table_unavailable", "table_not_found", "table_occupied", "unknown_match", "invalid_table", "invalid_op",
  ]);
  assert.deepEqual(await ms(T), after);
  // forfeit/withdraw may complete with no winner (nobody advances)
  const ff = await apply(T, [{ op: "patch_match", matchId: "W1M1", set: { status: "completed", winner: null, result: "forfeit" } }]);
  assert.equal(ff.results[0].ok, true);
});

test("server time for starts; reopen keeps the original start time", async () => {
  await reset(T, { W1M1: { status: "scheduled", tableId: 71 } });
  await as(U.td);
  // start op + patch_match first start both ignore the device clock
  await apply(T, [{ op: "start", matchId: "W1M1" }]);
  const t1 = Date.parse((await ms(T)).W1M1.startedAt);
  assert.ok(Math.abs(t1 - Date.now()) < 60_000);
  await apply(T, [{ op: "assign", matchId: "W1M2", tableId: 72 }]);
  await apply(T, [{ op: "patch_match", matchId: "W1M2", set: { status: "in_progress", startedAt: "2001-01-01T00:00:00.000Z" } }]);
  assert.ok(Math.abs(Date.parse((await ms(T)).W1M2.startedAt) - Date.now()) < 60_000);
  // complete then reopen: startedAt already present → client value (the original) is kept
  const orig = (await ms(T)).W1M2.startedAt;
  await apply(T, [{ op: "patch_match", matchId: "W1M2", set: done(1) }]);
  await apply(T, [{ op: "patch_match", matchId: "W1M2", set: { status: "in_progress", winner: null, result: null, startedAt: orig } }]);
  assert.equal((await ms(T)).W1M2.startedAt, orig);
  // elapsed-time correction on a live match is honored as sent
  await apply(T, [{ op: "patch_match", matchId: "W1M2", set: { startedAt: "2026-09-01T09:00:00.000Z" } }]);
  assert.equal((await ms(T)).W1M2.startedAt, "2026-09-01T09:00:00.000Z");
  // start requires a table; unassign clears table + start
  const r = await apply(T, [{ op: "start", matchId: "W1M3" }, { op: "unassign", matchId: "W1M1" }]);
  assert.deepEqual(r.results.map((x: any) => x.error ?? "ok"), ["no_table", "ok"]);
  assert.deepEqual((await ms(T)).W1M1, { status: "scheduled", tableId: null, startedAt: null });
});

// ── submit_match_state hardening ─────────────────────────────────────────────────────────
test("unauthorized participant cannot modify another match (or a bye / pending match)", async () => {
  await reset(T, { W1M1: { status: "in_progress", tableId: 71 } });
  await as(P(3)); // Cy plays W1M2, not W1M1
  await assert.rejects(score(T, "W1M1", { p1Score: 5 }), /Not allowed to score this match/);
  await assert.rejects(score(T, "W2M1", { p1Score: 1 }), /Not allowed to score this match/); // not resolved yet
  await assert.rejects(score(T, "NOPE", { p1Score: 1 }), /Not allowed to score this match/);
  await as(U.outsider);
  await assert.rejects(score(T, "W1M1", { p1Score: 5 }), /Not allowed to score this match/);
  await as(null);
  await assert.rejects(score(T, "W1M1", { p1Score: 5 }), /Not authenticated/);
  // a cancelled registration loses scoring rights
  await q("update public.tournament_players set status = 'cancelled' where id = 1001");
  await as(P(1));
  await assert.rejects(score(T, "W1M1", { p1Score: 1 }), /Not allowed/);
  await q("update public.tournament_players set status = 'checked_in' where id = 1001");
  assert.equal((await ms(T)).W1M1.p1Score, undefined);
});

test("authorized player can modify their own eligible match; later rounds resolve server-side", async () => {
  await reset(T);
  await as(P(2)); // Bo is slot 2 of W1M1
  await score(T, "W1M1", { p2Score: 5, status: "completed", winner: 2, completedAt: "2026-09-01T10:30:00.000Z", result: "normal" });
  assert.equal((await ms(T)).W1M1.winner, 2);
  // final match is locked for players
  await assert.rejects(score(T, "W1M1", { p2Score: 4, status: "in_progress" }), /final and locked/);
  // Ann (loser of W1M1) now drops to L1M1 — authorized once L1M1 is fully resolved
  await as(P(1));
  await assert.rejects(score(T, "L1M1", { p1Score: 1 }), /Not allowed/); // opponent (loser of W1M2) unknown
  await as(P(3));
  await score(T, "W1M2", { ...done(1) }); // Cy beats Di
  await as(P(1));
  await score(T, "L1M1", { p1Score: 1, status: "in_progress" }); // Ann vs Di
  await as(P(2));
  await score(T, "W2M1", { p1Score: 1, status: "in_progress" }); // Bo vs Cy
  await as(P(4)); // Di plays L1M1, not W2M1
  await assert.rejects(score(T, "W2M1", { p2Score: 1 }), /Not allowed/);
  // player patch values are type-checked; non-whitelisted keys are ignored as before
  await as(P(1));
  await assert.rejects(score(T, "L1M1", { p1Score: "lots" }), /Invalid value/);
  await score(T, "L1M1", { tableId: 99, p1Score: 2 });
  const s = await ms(T);
  assert.equal(s.L1M1.p1Score, 2);
  assert.equal(s.L1M1.tableId, undefined);
});

test("manager/admin authorization through can_manage_tournament (both RPCs)", async () => {
  await reset(T);
  for (const [who, allowed] of [
    [U.td, true], [U.admin, true], [U.owner, true], [U.vdir, true], [U.outsider, false], [U.exOwner, false], [P(1), false],
  ] as const) {
    await as(who);
    const call = apply(T, [{ op: "set_queue", autoAssignMode: "manual" }]);
    if (allowed) assert.equal((await call).results[0].ok, true, who);
    else await assert.rejects(call, /Not allowed to manage/, who);
    const merge = q("select public.elim_merge_live_settings($1, $2::jsonb, '{}') as r", [T, '{"prizePool":{"a":1}}']);
    if (allowed) await merge; else await assert.rejects(merge, /Not allowed to manage/, who);
  }
  // managers may still use submit_match_state on any match (and a completed one)
  await reset(T, { W1M1: done(1) });
  await as(U.vdir);
  await score(T, "W1M1", { status: "in_progress", winner: null, completedAt: null });
  assert.equal((await ms(T)).W1M1.status, "in_progress");
  // chip tournaments are refused by the new elimination functions
  await as(U.td);
  await assert.rejects(apply(TC, [{ op: "set_queue", autoAssignMode: "manual" }]), /Not an elimination/);
  await assert.rejects(q("select public.elim_merge_live_settings($1, '{}'::jsonb)", [TC]), /Not an elimination/);
});

test("Settings/Prize Pool merge never touches scheduler keys and preserves concurrent score", async () => {
  await reset(T, { W1M1: { status: "in_progress", tableId: 71, p1Score: 1 } }, { queueOrder: ["W1M2"], autoAssignMode: "manual", raceMode: "fixed", fees: [1] });
  await as(P(1));
  await score(T, "W1M1", { p1Score: 2 }); // lands after the TD opened Settings
  await as(U.td);
  await q("select public.elim_merge_live_settings($1, $2::jsonb, $3)", [T, JSON.stringify({ fixedRaceWinners: 7, prizePool: { p: 1 } }), ["fees"]]);
  const l = await ls(T);
  assert.equal(l.matchState.W1M1.p1Score, 2);
  assert.deepEqual(l.queueOrder, ["W1M2"]);
  assert.equal(l.autoAssignMode, "manual");
  assert.equal(l.fixedRaceWinners, 7);
  assert.equal(l.fees, undefined); // removal (undefined key in the old whole-object write) preserved
  assert.ok(l.bracket.graph.length > 0);
  for (const bad of ['{"matchState":{}}', '{"queueOrder":[]}', '{"autoAssignMode":"manual"}', '{"bracket":null}', '{"drawLog":[]}'])
    await assert.rejects(q("select public.elim_merge_live_settings($1, $2::jsonb)", [T, bad]), /Scheduler-owned/);
  await assert.rejects(q("select public.elim_merge_live_settings($1, '{}'::jsonb, $2)", [T, ["matchState"]]), /Scheduler-owned/);
});

test("Single elimination works through the same RPCs", async () => {
  await as(U.td);
  const r = await apply(TS, [
    { op: "assign", matchId: "W1M1", tableId: 75, start: true },
    { op: "assign", matchId: "L1M1", tableId: 76 }, // no losers bracket in single elim
  ]);
  assert.deepEqual(r.results.map((x: any) => x.error ?? "ok"), ["ok", "unknown_match"]);
  await as(P(1)); // reg 2001 = seed 0 = W1M1 slot 1
  await score(TS, "W1M1", { p1Score: 3 });
  assert.equal((await ms(TS)).W1M1.p1Score, 3);
});

test("Auto Assign output/semantics unchanged: the client plan applied via the RPC yields the same assignments", async () => {
  await reset(T, { W1M1: done(1), W1M2: done(2), W1M3: { status: "in_progress", tableId: 71 } });
  const l = await ls(T);
  const tables: any[] = [71, 72, 73, 74].map((id, i) => ({ id, tournament_id: T, table_number: i + 1, status: id === 74 ? "unavailable" : "available", is_streaming: false }));
  const matches = buildLiveMatches(l.bracket, l.matchState, tables, "9-ball", cfg);
  const occ: Record<number, string> = {};
  for (const m of matches) if (m.tableId != null && m.status !== "completed") occ[m.tableId] = m.id;
  const plan = planAutoAssign(orderQueue(buildQueueEntries(matches, computeReadyAtMap(l.bracket, l.matchState), Date.now()), "balanced", []), freeTables(tables, occ));
  assert.ok(plan.length >= 1);
  await as(U.td);
  const r = await apply(T, plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId })));
  assert.ok(r.results.every((x: any) => x.ok));
  const s = await ms(T);
  for (const p of plan) assert.equal(s[p.matchId].tableId, p.tableId);
});

test("input guards: op count, shape, missing tournament", async () => {
  await as(U.admin);
  await assert.rejects(apply(T, []), /1\.\.64/);
  await assert.rejects(apply(T, Array.from({ length: 65 }, () => ({ op: "set_queue", autoAssignMode: "manual" }))), /1\.\.64/);
  await assert.rejects(q("select public.elim_live_apply($1, '{}'::jsonb)", [T]), /1\.\.64/);
  await assert.rejects(apply(999, [{ op: "start", matchId: "W1M1" }]), /Not allowed|not found/);
  // internal helpers are not callable by clients
  const priv = await q("select has_function_privilege('authenticated', 'public._elim_resolve(jsonb)', 'execute') as a, has_function_privilege('authenticated', 'public.elim_live_apply(bigint, jsonb, boolean)', 'execute') as b, has_function_privilege('anon', 'public.elim_live_apply(bigint, jsonb, boolean)', 'execute') as c");
  assert.deepEqual(priv[0], { a: false, b: true, c: false });
});
