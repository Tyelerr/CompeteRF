// supabase/tests/multi_tournament_concurrency.test.ts
// A busy tournament night on a real Postgres (PGlite): MANY independent single- and double-
// elimination tournaments — separate venues, directors, tables and players — all played to
// completion THROUGH THE REAL WRITE PATH, interleaved op-by-op at random:
//   • TD Auto-Assign / Assign Ready (elim_live_apply 'assign' + start)
//   • server Auto Assign (elim_auto_assign_apply, CAS on updated_at; sometimes stale)
//   • TD results (patch_match completed) — sometimes double-tapped
//   • a SECOND TD device acting on a stale snapshot (old plan → must be refused, never corrupt)
//   • players scoring their own match (submit_match_state, scores only)
//   • hostile/mistaken cross-tournament writes (TD of A → B, player of A → B's match)
// After every write the touched tournament is checked against the server-side state, and every
// tournament is re-checked periodically, for: matchState ids ⊂ own bracket, table ids ⊂ own
// tables, no table double-booked, no player in two live matches, nobody eliminated still
// playing, only real (both-players-known) matches live. At the end every tournament has
// exactly one champion and the right match count (SE N-1, DE 2N-2|2N-1).
//
// Levels: LIGHT 10, MEDIUM 25, HEAVY 50, STRESS 100 tournaments (MTC_LEVELS=10,25 to choose).
// PGlite is ONE connection, so "concurrency" here is every op interleaved across tournaments
// in random order; true parallel writers on one tournament are serialized by the FOR UPDATE
// row lock every writer takes, so serial interleavings are exactly the reachable outcomes.
// Timings are WASM-Postgres in-process — comparative only, not production latency.
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/multi_tournament_concurrency.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { DrawPlayer, recommendedBracketSize, seedPlayers } from "../../src/utils/bracket.utils";
import { resolveBracket, MatchResult } from "../../src/utils/bracket.resolve";
import { buildLiveMatches, computeEliminatedRegIds, LiveMatch } from "../../src/utils/match.utils";
import { planAutoAssignFromState } from "../../src/utils/auto-assign";
import { buildPlayerScorePatch } from "../../src/utils/player-score";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const CAN_MANAGE = cut(read("20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament");
const M1 = read("20260922120000_elim_live_apply.sql");
const M2 = read("20260923120000_elim_assign_notify.sql");
const M3 = read("20260924120000_elim_auto_assign_server.sql").replace(/^create extension if not exists pg_net with schema extensions;$/m, "-- (pg_net stubbed)");
const M4 = read("20260926120000_elim_clear_table.sql");
const SUBMIT = cut(read("20260929120000_check_in_timer.sql"), "create or replace function public.submit_match_state");

const CFG: any = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null };
const MODES = ["balanced", "winnersFirst", "losersFirst", "longestWait", "manual"];
const SIZES = [7, 8, 11, 16, 17, 32, 5, 24];

let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const as = async (uid: string | null) => q("select set_config('test.uid', $1, false)", [uid ?? ""]);
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

interface T {
  id: number;
  dbl: boolean;
  n: number;
  tdUid: string;
  tables: any[];
  bracket: any;
  aa: boolean;
  stale: any | null; // a second TD device's old snapshot of live_settings
  done: boolean;
}

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions; create schema net; create schema vault; create schema cron;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (
      id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'not_started' not null, is_paused boolean default false,
      game_type text default '9-ball', live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int,
      player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int,
      status text default 'available' not null, label text, is_streaming boolean default false);
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.net_calls (id serial primary key, url text, body jsonb, headers jsonb,
      tournament_id bigint, reason text);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
    language plpgsql as $$
    declare v bigint;
    begin
      insert into public.net_calls (url, body, headers, tournament_id, reason)
      values (url, body, headers, (body ->> 'tournament_id')::bigint, body ->> 'reason') returning id into v;
      return v;
    end $$;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as
      $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as
      $$ with d as (delete from cron.job where jobid = id returning 1) select exists (select 1 from d) $$;
  `);
  await db.exec(CAN_MANAGE);
  await db.exec(M1);
  await db.exec(M2);
  await db.exec(M3);
  await db.exec(M4);
  // MTC_GUARDS=1: also load the pending elimination server guards (stale-write, playability, finished).
  if (process.env.MTC_GUARDS) await db.exec(readFileSync(join(ROOT, "supabase/pending/20261017120000_elim_server_guards.sql"), "utf8"));
  await db.exec(SUBMIT);
  await db.exec(`
    insert into vault.decrypted_secrets values
      ('elim_auto_assign_url', 'https://example.test/functions/v1/auto-assign-run'),
      ('elim_auto_assign_secret', 'test-secret-0123456789abcdef0123456789');
  `);
});

// ── server state helpers ──────────────────────────────────────────────────────────────────
const lsOf = async (tid: number) => (await q("select live_settings from public.tournaments where id = $1", [tid]))[0].live_settings;
const liveOf = (t: T, ls: any): LiveMatch[] => buildLiveMatches(t.bracket, ls.matchState ?? {}, t.tables, "9-ball", CFG);
const championOf = (t: T, ls: any) => {
  const results: Record<string, MatchResult> = {};
  for (const [id, st] of Object.entries<any>(ls.matchState ?? {}))
    results[id] = { completed: st.status === "completed", winner: st.winner ?? null, result: st.result ?? null };
  return resolveBracket(t.bracket.graph, t.bracket.seeds, results, CFG).champion;
};

const checkTournament = async (t: T, tableOwner: Map<number, number>) => {
  const ls = await lsOf(t.id);
  const ids = new Set(t.bracket.graph.map((n: any) => n.id));
  const regs = new Set(t.bracket.seeds.filter(Boolean).map((p: any) => p.registrationId));
  const ctx = `T${t.id} (${t.dbl ? "DE" : "SE"} n=${t.n})`;
  for (const [mid, st] of Object.entries<any>(ls.matchState ?? {})) {
    assert.ok(ids.has(mid), `${ctx}: foreign match id ${mid}`);
    if (st.tableId != null) assert.equal(tableOwner.get(Number(st.tableId)), t.id, `${ctx}: table ${st.tableId} belongs to T${tableOwner.get(Number(st.tableId))}`);
  }
  const live = liveOf(t, ls);
  const tableUse = new Map<number, string>();
  const playerUse = new Map<number, string>();
  const elim = new Set(computeEliminatedRegIds(live));
  for (const m of live) {
    for (const r of [m.p1RegId, m.p2RegId]) if (r != null) assert.ok(regs.has(r), `${ctx}: foreign registration ${r} in ${m.id}`);
    if (m.status === "completed" || m.bye || m.empty) continue;
    if (m.tableId != null) {
      assert.ok(!tableUse.has(m.tableId), `${ctx}: table ${m.tableId} double-booked (${tableUse.get(m.tableId)} + ${m.id})`);
      tableUse.set(m.tableId, m.id);
    }
    if (m.status === "in_progress") {
      assert.ok(!m.pending, `${ctx}: ${m.id} live with an unknown player`);
      for (const r of [m.p1RegId!, m.p2RegId!]) {
        assert.ok(!playerUse.has(r), `${ctx}: player ${r} in two live matches (${playerUse.get(r)} + ${m.id})`);
        playerUse.set(r, m.id);
        assert.ok(!elim.has(r), `${ctx}: eliminated player ${r} live in ${m.id}`);
      }
    }
  }
  return { ls, live };
};

interface Stats {
  ops: number;
  okOps: number;
  rejected: Record<string, number>;
  rpcMs: Record<string, number[]>;
  doubleTaps: number;
  doubleTapChanged: number;
  staleAttempts: number;
  staleApplied: number;
  crossTenantBlocked: number;
  aaStale: number;
}

const timed = async <R>(stats: Stats, name: string, fn: () => Promise<R>): Promise<R> => {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    (stats.rpcMs[name] ??= []).push(performance.now() - t0);
  }
};
const reject = (stats: Stats, code: string) => (stats.rejected[code] = (stats.rejected[code] ?? 0) + 1);

const runNight = async (count: number, seed: number) => {
  const rand = rng(seed);
  const realRandom = Math.random;
  Math.random = rng(seed * 3 + 1); // deterministic draws (seedPlayers shuffles)
  const base = count * 1000; // keep ids of each level disjoint
  const ts: T[] = [];
  const tableOwner = new Map<number, number>();
  try {
    for (let i = 0; i < count; i++) {
      const id = base + i;
      const n = SIZES[i % SIZES.length];
      const dbl = i % 3 !== 2; // ~2/3 double elim
      const tdIdAuto = base + 500 + i;
      const tdUid = uuid(tdIdAuto);
      await q("insert into public.profiles (id, id_auto, role) values ($1, $2, 'tournament_director')", [tdUid, tdIdAuto]);
      const players: DrawPlayer[] = Array.from({ length: n }, (_, k) => ({
        registrationId: id * 100 + k,
        name: k % 6 === 0 ? "Alex Smith" : `T${id}P${k}`, // duplicate names across + within events
        fargo: k % 9 === 0 ? 150 : k % 9 === 1 ? 820 : 400 + ((k * 37) % 300), // very low / high Fargo
      })) as DrawPlayer[];
      for (const p of players) {
        await q("insert into public.profiles (id, id_auto) values ($1, $2)", [uuid(p.registrationId), p.registrationId]);
        await q("insert into public.tournament_players (id, tournament_id, player_id) values ($1, $2, $3)", [p.registrationId, id, p.registrationId]);
      }
      const size = recommendedBracketSize(n);
      const bracket = { generatedAt: "2026-09-01T10:00:00.000Z", drawNumber: 1, doubleElim: dbl, graph: buildBracketGraph(size, dbl), seeds: seedPlayers(players, size) };
      const nTables = 1 + (i % 8);
      const tables = Array.from({ length: nTables }, (_, k) => ({
        id: id * 100 + k + 1, tournament_id: id, table_number: k + 1, status: k === 3 ? "unavailable" : "available", is_streaming: k === 0, label: null,
      }));
      for (const tb of tables) {
        await q("insert into public.tournament_tables (id, tournament_id, table_number, status, is_streaming) values ($1, $2, $3, $4, $5)", [tb.id, id, tb.table_number, tb.status, tb.is_streaming]);
        tableOwner.set(tb.id, id);
      }
      const aa = i % 2 === 0;
      await q(
        "insert into public.tournaments (id, venue_id, director_id, tournament_format, live_state, live_settings, updated_at) values ($1, $2, $3, $4, 'in_progress', $5::jsonb, now())",
        [id, 9000 + i, tdIdAuto, dbl ? "double_elimination" : "single_elimination",
         JSON.stringify({ bracket, matchState: {}, raceMode: "fixed", fixedRaceWinners: 5, autoAssignEnabled: aa, autoAssignMode: MODES[i % MODES.length] })],
      );
      ts.push({ id, dbl, n, tdUid, tables, bracket, aa, stale: null, done: false });
    }
  } finally {
    Math.random = realRandom;
  }
  await q("delete from net_calls");

  const stats: Stats = { ops: 0, okOps: 0, rejected: {}, rpcMs: {}, doubleTaps: 0, doubleTapChanged: 0, staleAttempts: 0, staleApplied: 0, crossTenantBlocked: 0, aaStale: 0 };
  const now = Date.parse("2026-09-01T14:00:00.000Z");
  const t0 = performance.now();
  let ticks = 0;
  const applyAsTd = async (t: T, ops: unknown[]) => {
    await as(t.tdUid);
    stats.ops++;
    const r = (await timed(stats, "elim_live_apply", () => q("select public.elim_live_apply($1, $2::jsonb, false) as r", [t.id, JSON.stringify(ops)])))[0].r;
    for (const res of r.results) {
      if (res.ok) stats.okOps++;
      else reject(stats, res.error);
    }
    return r;
  };

  while (ts.some((t) => !t.done)) {
    ticks++;
    assert.ok(ticks < count * 600, "runaway night");
    const open = ts.filter((t) => !t.done);
    const t = open[Math.floor(rand() * open.length)];
    const ls = await lsOf(t.id);
    const live = liveOf(t, ls);
    if (championOf(t, ls)) {
      t.done = true;
      continue;
    }
    if (!t.stale || rand() < 0.1) t.stale = JSON.parse(JSON.stringify(ls)); // second device refreshes now and then
    const inProg = live.filter((m) => m.status === "in_progress");
    const r = rand();

    if (r < 0.06) {
      // Hostile / mistaken cross-tournament write: TD of t → another tournament; player of t → its match.
      const other = ts[Math.floor(rand() * ts.length)];
      if (other.id !== t.id) {
        await as(t.tdUid);
        stats.ops++;
        await assert.rejects(q("select public.elim_live_apply($1, $2::jsonb, false)", [other.id, JSON.stringify([{ op: "set_queue", autoAssignMode: "manual" }])]), /Not allowed to manage/);
        const anyLive = liveOf(other, await lsOf(other.id)).find((m) => m.status === "in_progress");
        if (anyLive) {
          await as(uuid(t.bracket.seeds.find(Boolean).registrationId));
          stats.ops++;
          await assert.rejects(q("select public.submit_match_state($1, $2, $3::jsonb)", [other.id, anyLive.id, JSON.stringify({ p1Score: 1, p2Score: 0 })]), /Not allowed to score/);
        }
        stats.crossTenantBlocked++;
      }
    } else if (r < 0.14 && inProg.length) {
      // Player scores their own live match (scores only — the server contract).
      const m = inProg[Math.floor(rand() * inProg.length)];
      const patch = buildPlayerScorePatch(m, rand() < 0.5 ? 1 : 2, 1);
      if (patch) {
        await as(uuid(m.p1RegId!));
        stats.ops++;
        await timed(stats, "submit_match_state", () => q("select public.submit_match_state($1, $2, $3::jsonb)", [t.id, m.id, JSON.stringify(patch)]));
        stats.okOps++;
      }
    } else if (r < 0.24) {
      // Second TD device acting on its STALE snapshot: assign what IT thinks is Ready.
      const plan = planAutoAssignFromState({ liveSettings: t.stale, tables: t.tables, gameType: "9-ball", now });
      if (plan.length) {
        stats.staleAttempts++;
        const before = JSON.stringify((await lsOf(t.id)).matchState);
        const res = await applyAsTd(t, plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, start: true, ifUnassigned: true })));
        if (JSON.stringify(res.live_settings.matchState) !== before) stats.staleApplied++;
      }
    } else if (r < 0.62 && inProg.length) {
      // TD records a result (10% double-tapped: the identical op sent twice).
      const m = inProg[Math.floor(rand() * inProg.length)];
      const w = rand() < 0.5 ? 1 : 2;
      const op = { op: "patch_match", matchId: m.id, set: { status: "completed", winner: w, p1Score: w === 1 ? 5 : 3, p2Score: w === 2 ? 5 : 3, completedAt: new Date(now).toISOString(), result: "normal" } };
      await applyAsTd(t, [op]);
      if (rand() < 0.1) {
        stats.doubleTaps++;
        const a = JSON.stringify((await lsOf(t.id)).matchState);
        await applyAsTd(t, [op]);
        const b = JSON.stringify((await lsOf(t.id)).matchState);
        if (a !== b) stats.doubleTapChanged++;
      }
    } else {
      // Assign Ready matches: server Auto Assign (system RPC, CAS) when enabled, else the TD.
      const plan = planAutoAssignFromState({ liveSettings: ls, tables: t.tables, gameType: "9-ball", now });
      if (plan.length) {
        if (t.aa && rand() < 0.6) {
          const upd = (await q("select updated_at from public.tournaments where id = $1", [t.id]))[0].updated_at;
          const expected = rand() < 0.15 ? new Date(0).toISOString() : upd; // sometimes a stale run
          stats.ops++;
          const res = (await timed(stats, "elim_auto_assign_apply", () => q("select public.elim_auto_assign_apply($1, $2::jsonb, $3::timestamptz) as r", [t.id, JSON.stringify(plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, ifUnassigned: true }))), expected])))[0].r;
          if (res.status === "stale") stats.aaStale++;
          // Auto Assign never starts a match; the TD presses Start (double-tapped sometimes).
          const after = liveOf(t, await lsOf(t.id)).filter((m) => m.status === "scheduled" && m.tableId != null && !m.pending && !m.bye && !m.empty);
          if (after.length) {
            const ops = after.map((m) => ({ op: "start", matchId: m.id }));
            await applyAsTd(t, ops);
            if (rand() < 0.1) {
              stats.doubleTaps++;
              const a = JSON.stringify((await lsOf(t.id)).matchState);
              await applyAsTd(t, ops); // second Start All → match_in_progress, nothing changes
              if (JSON.stringify((await lsOf(t.id)).matchState) !== a) stats.doubleTapChanged++;
            }
          }
        } else {
          await applyAsTd(t, plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, start: true, ifUnassigned: true })));
        }
      }
    }
    await checkTournament(t, tableOwner);
    if (ticks % 200 === 0) for (const x of ts) await checkTournament(x, tableOwner);
  }
  const wallMs = performance.now() - t0;

  // End state: every tournament has one champion and the right number of played matches.
  let players = 0;
  for (const t of ts) {
    players += t.n;
    const { ls, live } = await checkTournament(t, tableOwner);
    const champ = championOf(t, ls);
    assert.ok(champ, `T${t.id} has no champion`);
    const played = live.filter((m) => m.status === "completed" && m.winner != null && !m.bye).length;
    if (t.dbl) assert.ok(played === 2 * t.n - 2 || played === 2 * t.n - 1, `T${t.id} DE n=${t.n} played ${played}`);
    else assert.equal(played, t.n - 1, `T${t.id} SE n=${t.n} played ${played}`);
    assert.equal(computeEliminatedRegIds(live).length, t.n - 1, `T${t.id} eliminated count`);
  }
  // Auto Assign kicks (pg_net) only ever name Auto-Assign tournaments of THIS night.
  const aaIds = new Set(ts.filter((t) => t.aa).map((t) => t.id));
  const kicks = await q("select tournament_id from net_calls");
  for (const k of kicks) assert.ok(aaIds.has(Number(k.tournament_id)), `kick for non-AA/foreign tournament ${k.tournament_id}`);
  assert.equal(stats.doubleTapChanged, 0, "a double-tapped op changed state");

  const pct = (xs: number[], p: number) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
  const lat = Object.fromEntries(Object.entries(stats.rpcMs).map(([k, v]) => [k, `n=${v.length} p50=${pct(v, 0.5).toFixed(1)}ms p95=${pct(v, 0.95).toFixed(1)}ms max=${pct(v, 1).toFixed(1)}ms`]));
  console.log(`MTC level=${count} tournaments players=${players} ticks=${ticks} ops=${stats.ops} okOps=${stats.okOps} wall=${(wallMs / 1000).toFixed(1)}s kicks=${kicks.length}`);
  console.log(`MTC level=${count} rejected=${JSON.stringify(stats.rejected)} staleAttempts=${stats.staleAttempts} staleApplied=${stats.staleApplied} aaStale=${stats.aaStale} doubleTaps=${stats.doubleTaps} doubleTapChanged=${stats.doubleTapChanged} crossTenantBlocked=${stats.crossTenantBlocked}`);
  console.log(`MTC level=${count} latency=${JSON.stringify(lat)}`);
  return stats;
};

const LEVELS = (process.env.MTC_LEVELS ?? "10,25").split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
for (const level of LEVELS) {
  test(`busy night: ${level} simultaneous elimination tournaments stay isolated, consistent and finish`, async () => {
    const s = await runNight(level, 20261001 + level);
    assert.ok(s.crossTenantBlocked > 0 && s.staleAttempts > 0 && s.doubleTaps > 0, "every hazard was exercised");
  });
}
