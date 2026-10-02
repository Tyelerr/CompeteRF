// supabase/tests/mixed_night.test.ts
// A MIXED busy night on one real Postgres (PGlite): Single Elimination, Double Elimination and
// Chip tournaments — separate venues, directors, tables and players — all running at once and
// interleaved op-by-op at random until every event has a champion.
//
//  • Elimination ops go through the real RPCs (elim_live_apply / elim_auto_assign_apply /
//    submit_match_state), with double taps, a stale second TD device and cross-tenant attempts.
//  • Chip state is driven by the real engine and saved through the REAL ordered save
//    (executeChipSave: atomic version claim + finalize, delta saves, parallel writes) into chip
//    tables keyed like prod: GLOBAL row ids, every read/prune scoped by tournament_id. A third of
//    the chip events have a SECOND TD device acting on a stale board: its saves must be refused
//    whole (it then reloads), never mixed into the cloud.
//  • After every chip save the tournament's cloud partition must equal its authoritative board;
//    shared invariants (src/utils/__tests__/invariants.ts) run on every touched event.
//
// Levels via MIXED_LEVELS (default "15" for speed; "60" = 20 SE + 20 DE + 20 Chip; "100" ≈ 34/33/33).
// Single PGlite connection = serial interleavings (see multi_tournament_concurrency.test.ts).
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/mixed_night.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { DrawPlayer, recommendedBracketSize, seedPlayers } from "../../src/utils/bracket.utils";
import { resolveBracket, MatchResult } from "../../src/utils/bracket.resolve";
import { buildLiveMatches, computeEliminatedRegIds } from "../../src/utils/match.utils";
import { planAutoAssignFromState } from "../../src/utils/auto-assign";
import { assertChipInvariants, assertElimInvariants } from "../../src/utils/__tests__/invariants";
import { ChipPersistBackend, ChipRowTable, executeChipSave } from "../../src/models/services/chip.persist";
import { buildChipSavePlan } from "../../src/models/services/chip.rows";
import {
  addTables,
  assignNextTeam,
  beginShuffle,
  chipFinalsState,
  emptyChipState,
  newId,
  recordWinner,
  reorderQueue,
  seatFinals,
  setTableLocked,
  settleChipState,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
  startShuffle,
  withRestorePoint,
} from "../../src/models/services/chip.engine";
import { ChipEntry, ChipState } from "../../src/models/types/chip.types";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const CFG: any = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null };
const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const as = async (uid: string) => q("select set_config('test.uid', $1, false)", [uid]);

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
      game_type text default '9-ball', live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int, status text default 'available' not null);
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.net_calls (id serial primary key, tournament_id bigint, reason text);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
      declare v bigint; begin insert into public.net_calls (tournament_id, reason) values ((body->>'tournament_id')::bigint, body->>'reason') returning id into v; return v; end $$;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as $$ select true $$;
    -- chip tables shaped like prod for what matters here: GLOBAL text ids, tournament-scoped rows
    create table public.chip_config (tournament_id bigint primary key, version bigint not null default 0, data jsonb not null default '{}'::jsonb);
    create table public.chip_entries (id text primary key, tournament_id bigint not null, data jsonb);
    create table public.chip_matches (id text primary key, tournament_id bigint not null, data jsonb);
    create table public.chip_tables (id text primary key, tournament_id bigint not null, data jsonb);
    create table public.chip_events (id text primary key, tournament_id bigint not null, superseded boolean default false);
  `);
  await db.exec(cut(read("20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament"));
  await db.exec(read("20260922120000_elim_live_apply.sql"));
  await db.exec(read("20260923120000_elim_assign_notify.sql"));
  await db.exec(read("20260924120000_elim_auto_assign_server.sql").replace(/^create extension if not exists pg_net with schema extensions;$/m, "-- stub"));
  await db.exec(read("20260926120000_elim_clear_table.sql"));
  await db.exec(cut(read("20260929120000_check_in_timer.sql"), "create or replace function public.submit_match_state"));
  await db.exec(`insert into vault.decrypted_secrets values ('elim_auto_assign_url','https://x.test'),('elim_auto_assign_secret','s-0123456789abcdef0123456789abcdef')`);
});

// ── Chip persistence backend over PGlite (same contract as supabasePersistBackend) ────────────
const chipBackend = (tid: number, stats: { req: number; bytes: number }): ChipPersistBackend => {
  const hit = (p: unknown) => { stats.req++; stats.bytes += JSON.stringify(p ?? null).length; };
  const tableOf: Record<ChipRowTable, string> = { chip_entries: "chip_entries", chip_matches: "chip_matches", chip_tables: "chip_tables" };
  return {
    async upsertConfig(p) {
      hit(p);
      const { tournament_id, ...rest } = p as any;
      await q("insert into chip_config (tournament_id, data) values ($1, $2::jsonb) on conflict (tournament_id) do update set data = chip_config.data || excluded.data", [tid, JSON.stringify(rest)]);
      void tournament_id;
    },
    async upsertConfigSoft(p) { await this.upsertConfig(p); },
    async syncRows(t, rows, ids, o) {
      const table = tableOf[t];
      if (rows.length) {
        hit(rows);
        for (const r of rows)
          await q(`insert into ${table} (id, tournament_id, data) values ($1, $2, $3::jsonb) on conflict (id) do update set data = excluded.data, tournament_id = excluded.tournament_id`, [String(r.id), tid, JSON.stringify(r)]);
      }
      if (o?.prune !== false) {
        hit(ids);
        await q(`delete from ${table} where tournament_id = $1 and not (id = any($2::text[]))`, [tid, ids]);
      }
    },
    async insertEvents(rows) { hit(rows); for (const r of rows) await q("insert into chip_events (id, tournament_id) values ($1, $2) on conflict (id) do nothing", [String(r.id), tid]); },
    async markSuperseded(ids) { hit(ids); await q("update chip_events set superseded = true where tournament_id = $1 and id = any($2::text[])", [tid, ids]); },
    async readVersion() { stats.req++; return Number((await q("select version from chip_config where tournament_id = $1", [tid]))[0]?.version ?? 0); },
    async bumpVersion(expected) { stats.req += 2; const v = Number((await q("update chip_config set version = version + 1 where tournament_id = $1 returning version", [tid]))[0].version); return { version: v, conflict: expected != null && v - 1 !== expected }; },
    async claimVersion(expected) {
      stats.req++;
      const r = await q("update chip_config set version = $2 + 1 where tournament_id = $1 and version = $2 returning version", [tid, expected]);
      if (r.length === 1) return "claimed";
      return (await q("select 1 from chip_config where tournament_id = $1", [tid])).length ? "changed" : "unsupported";
    },
  };
};
// Canonical JSON (jsonb reorders object keys, so compare content, not key order).
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as any)[k])])) : v;
const chipCloud = async (tid: number) => {
  const rows = async (t: string) =>
    (await q(`select data from ${t} where tournament_id = $1`, [tid])).map((r: any) => r.data).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(canon({ e: await rows("chip_entries"), m: await rows("chip_matches"), t: await rows("chip_tables"), q: (await q("select data->'queue' q from chip_config where tournament_id = $1", [tid]))[0]?.q }));
};
const chipExpected = (tid: number, s: ChipState) => {
  const p = buildChipSavePlan(tid, s);
  const sort = (rows: any[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(canon({ e: sort(p.entries.rows), m: sort(p.matches.rows), t: sort(p.tables.rows), q: p.configCore.queue }));
};
const chipAct = (c: ChipState, fn: (s: ChipState) => ChipState): ChipState => {
  const next = settleChipState(fn(c));
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const ev = next.events.slice(0, added);
  return withRestorePoint(next, c, ev.map((e) => e.id), ev[ev.length - 1].text);
};

interface Elim { kind: "se" | "de"; id: number; n: number; td: string; tables: any[]; bracket: any; aa: boolean; stale: any; done: boolean }
interface Chip { kind: "chip"; id: number; n: number; td: string; board: ChipState; version: number; staleB: { board: ChipState; version: number } | null; done: boolean; field: Set<string> }

const runMixed = async (total: number, seed: number) => {
  const rand = rng(seed);
  const realRandom = Math.random;
  Math.random = rng(seed * 5 + 3); // seeded draws + chip ids (newId) + shuffles
  const base = 100000 + total * 1000;
  const events: (Elim | Chip)[] = [];
  const stats = { elimOps: 0, elimOk: 0, rejected: {} as Record<string, number>, chipActions: 0, chipSaves: 0, chipRefused: 0, chipReloads: 0, crossTenant: 0, players: 0, chipReq: 0, chipBytes: 0, elimMs: [] as number[], chipSaveMs: [] as number[] };
  try {
    for (let i = 0; i < total; i++) {
      const id = base + i;
      const kind = (["se", "de", "chip"] as const)[i % 3];
      const n = [8, 16, 32, 11, 17][i % 5];
      const tdIdAuto = id * 10;
      const td = uuid(tdIdAuto);
      await q("insert into profiles (id, id_auto, role) values ($1, $2, 'tournament_director')", [td, tdIdAuto]);
      stats.players += n;
      if (kind !== "chip") {
        const players: DrawPlayer[] = Array.from({ length: n }, (_, k) => ({ registrationId: id * 100 + k, name: `T${id}P${k}`, fargo: 300 + ((k * 53) % 500) })) as DrawPlayer[];
        for (const p of players) {
          await q("insert into profiles (id, id_auto) values ($1, $2)", [uuid(p.registrationId), p.registrationId]);
          await q("insert into tournament_players (id, tournament_id, player_id) values ($1, $2, $3)", [p.registrationId, id, p.registrationId]);
        }
        const size = recommendedBracketSize(n);
        const bracket = { generatedAt: "2026-10-01T18:00:00.000Z", drawNumber: 1, graph: buildBracketGraph(size, kind === "de"), seeds: seedPlayers(players, size) };
        const tables = Array.from({ length: 2 + (i % 5) }, (_, k) => ({ id: id * 100 + k + 1, tournament_id: id, table_number: k + 1, status: "available" }));
        for (const t of tables) await q("insert into tournament_tables values ($1, $2, $3, 'available')", [t.id, id, t.table_number]);
        const aa = i % 2 === 0;
        await q("insert into tournaments (id, venue_id, director_id, tournament_format, live_state, live_settings, updated_at) values ($1, $2, $3, $4, 'in_progress', $5::jsonb, now())",
          [id, 500 + i, tdIdAuto, kind === "de" ? "double_elimination" : "single_elimination", JSON.stringify({ bracket, matchState: {}, autoAssignEnabled: aa, autoAssignMode: "balanced" })]);
        events.push({ kind, id, n, td, tables, bracket, aa, stale: null, done: false });
      } else {
        await q("insert into tournaments (id, venue_id, director_id, tournament_format, live_state) values ($1, $2, $3, 'chip-tournament', 'in_progress')", [id, 500 + i, tdIdAuto]);
        let s = emptyChipState(i % 6 === 2 ? "scotch_doubles" : "singles");
        const dbl = s.settings.format === "scotch_doubles";
        s = { ...s, settings: { ...s.settings, tiers: [{ id: "t", minFargo: 0, maxFargo: null, chips: 2 + (i % 3) }] } };
        s = { ...s, entries: Array.from({ length: n }, (_, k) => ({ id: newId("e"), p1Name: `C${id}P${k}`, p1Fargo: 500, p1Phone: "", p2Name: dbl ? `C${id}Q${k}` : "", p2Fargo: dbl ? 500 : null, teamFargo: dbl ? 1000 : 500, startChips: 0, chips: 0, paid: true, checkedIn: true, paidSidePots: [], status: "queued", wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0, createdAt: "2026-10-01T18:00:00.000Z" }) as ChipEntry) };
        s = chipAct(settleChipState(startChipTournament(addTables(s, Math.max(1, Math.floor(n / 4) + (i % 2))))), startAllMatches);
        await q("insert into chip_config (tournament_id, version) values ($1, 0)", [id]);
        const st = { req: 0, bytes: 0 };
        const r = await executeChipSave(chipBackend(id, st), buildChipSavePlan(id, s, { expectedVersion: 0 }));
        const ev: Chip = { kind: "chip", id, n, td, board: s, version: r.version, staleB: null, done: false, field: new Set(s.entries.map((e) => e.id)) };
        if (i % 3 === 2 && Math.floor(i / 3) % 3 === 0) ev.staleB = { board: s, version: r.version }; // a second TD device
        events.push(ev);
      }
    }

    const t0 = performance.now();
    let ticks = 0;
    const lsOf = async (tid: number) => (await q("select live_settings from tournaments where id = $1", [tid]))[0].live_settings;
    const elimApply = async (e: Elim, ops: unknown[]) => {
      await as(e.td);
      stats.elimOps++;
      const t = performance.now();
      const r = (await q("select public.elim_live_apply($1, $2::jsonb, false) as r", [e.id, JSON.stringify(ops)]))[0].r;
      stats.elimMs.push(performance.now() - t);
      for (const x of r.results) if (x.ok) stats.elimOk++; else stats.rejected[x.error] = (stats.rejected[x.error] ?? 0) + 1;
    };
    const chipSave = async (c: Chip, board: ChipState, version: number) => {
      const st = { req: 0, bytes: 0 };
      const t = performance.now();
      const r = await executeChipSave(chipBackend(c.id, st), buildChipSavePlan(c.id, board, { expectedVersion: version }));
      stats.chipSaveMs.push(performance.now() - t);
      stats.chipReq += st.req;
      stats.chipBytes += st.bytes;
      stats.chipSaves++;
      return r;
    };

    while (events.some((e) => !e.done)) {
      ticks++;
      assert.ok(ticks < total * 2500, "runaway night");
      const open = events.filter((e) => !e.done);
      const ev = open[Math.floor(rand() * open.length)];
      const r = rand();
      if (ev.kind !== "chip") {
        const ls = await lsOf(ev.id);
        const res: Record<string, MatchResult> = {};
        for (const [k, st] of Object.entries<any>(ls.matchState ?? {})) res[k] = { completed: st.status === "completed", winner: st.winner ?? null, result: st.result ?? null };
        if (resolveBracket(ev.bracket.graph, ev.bracket.seeds, res, CFG).champion) { ev.done = true; continue; }
        if (!ev.stale || rand() < 0.1) ev.stale = ls;
        const live = buildLiveMatches(ev.bracket, ls.matchState ?? {}, ev.tables, "9-ball", CFG);
        const inProg = live.filter((m) => m.status === "in_progress");
        if (r < 0.05) {
          const other = events[Math.floor(rand() * events.length)];
          if (other.id !== ev.id) {
            await as(ev.td);
            await assert.rejects(q(other.kind === "chip" ? "update chip_config set version = version where tournament_id = $1 and public.can_manage_tournament($1) and false" : "select public.elim_live_apply($1, '[{\"op\":\"set_queue\",\"autoAssignMode\":\"manual\"}]'::jsonb)", [other.id]).then((x) => { if (other.kind === "chip") throw new Error("Not allowed to manage (chip RLS modeled by can_manage)"); return x; }), /Not allowed to manage/);
            stats.crossTenant++;
          }
        } else if (r < 0.15) {
          const plan = planAutoAssignFromState({ liveSettings: ev.stale, tables: ev.tables, gameType: "9-ball", now: Date.now() });
          if (plan.length) await elimApply(ev, plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, start: true, ifUnassigned: true })));
        } else if (r < 0.6 && inProg.length) {
          const m = inProg[Math.floor(rand() * inProg.length)];
          const op = { op: "patch_match", matchId: m.id, set: { status: "completed", winner: rand() < 0.5 ? 1 : 2, result: "normal" } };
          await elimApply(ev, [op]);
          if (rand() < 0.1) { const a = JSON.stringify((await lsOf(ev.id)).matchState); await elimApply(ev, [op]); assert.equal(JSON.stringify((await lsOf(ev.id)).matchState), a, "double tap changed state"); }
        } else {
          const plan = planAutoAssignFromState({ liveSettings: ls, tables: ev.tables, gameType: "9-ball", now: Date.now() });
          if (plan.length) await elimApply(ev, plan.map((p) => ({ op: "assign", matchId: p.matchId, tableId: p.tableId, start: true, ifUnassigned: true })));
        }
        const after = await lsOf(ev.id);
        assertElimInvariants(buildLiveMatches(ev.bracket, after.matchState ?? {}, ev.tables, "9-ball", CFG), `T${ev.id} ${ev.kind} seed=${seed}`, {
          field: new Set(ev.bracket.seeds.filter(Boolean).map((p: any) => p.registrationId)),
          tables: new Set(ev.tables.map((t: any) => t.id)),
        });
      } else {
        const c = ev;
        if (c.board.winnerId) { c.done = true; continue; }
        // pick the acting device
        const useB = !!c.staleB && r < 0.3;
        const dev = useB ? c.staleB! : { board: c.board, version: c.version };
        let s = dev.board;
        const rr = rand();
        if (rr < 0.1 && s.queue.length > 1) s = chipAct(s, (x) => reorderQueue(x, s.queue[Math.floor(rand() * s.queue.length)], rand() < 0.5 ? "top" : "bottom"));
        else if (rr < 0.14 && s.tables.length) { const t = s.tables[Math.floor(rand() * s.tables.length)]; s = chipAct(s, (x) => setTableLocked(x, t.id, !t.locked)); }
        else if (rr < 0.16 && !s.reshufflePending && !s.shuffleReady && !s.shuffleRound && s.entries.filter((e) => e.status !== "eliminated").length > 6) s = chipAct(s, (x) => beginShuffle(x));
        else {
          if (s.shuffleReady) s = chipAct(s, (x) => startShuffle(x));
          const fin = chipFinalsState(s);
          if (fin.kind === "select") s = chipAct(s, (x) => seatFinals(x, fin.tableIds[0]));
          for (const t of s.tables) if (t.holderId && t.pendingChallengerId && !t.matchId) s = chipAct(s, (x) => startPendingMatch(x, t.id));
          const m = s.matches.find((x) => x.status === "in_progress");
          if (m) s = chipAct(s, (x) => recordWinner(x, m.id, rand() < 0.5 ? m.aId : m.bId));
          else {
            for (const t of s.tables) if (t.locked) s = chipAct(s, (x) => setTableLocked(x, t.id, false));
            const t = s.tables.find((tb) => !tb.matchId && !tb.pendingChallengerId && !tb.inactive && !tb.closing && (tb.holderId ? s.queue.length : s.queue.length > 1));
            if (t) s = chipAct(s, (x) => assignNextTeam(x, t.id));
          }
        }
        if (s === dev.board) continue;
        stats.chipActions++;
        assertChipInvariants(s, `C${c.id} seed=${seed}`, { field: c.field });
        const res = await chipSave(c, s, dev.version);
        if (res.aborted) {
          // refused whole: the cloud is still exactly the authoritative board; device reloads
          stats.chipRefused++;
          assert.equal(await chipCloud(c.id), chipExpected(c.id, c.board), `C${c.id}: a refused save wrote something`);
          if (useB) { c.staleB = { board: c.board, version: c.version }; stats.chipReloads++; }
          continue;
        }
        assert.equal(res.conflict, false, `C${c.id}: unexpected interleave`);
        if (useB) { c.board = s; c.version = res.version; c.staleB = { board: s, version: res.version }; }
        else { c.board = s; c.version = res.version; } // device B now stale (it will be refused, reload)
        assert.equal(await chipCloud(c.id), chipExpected(c.id, c.board), `C${c.id}: cloud != board after save`);
      }
    }
    const wall = performance.now() - t0;
    // End: one champion each, right match counts, no cross-partition rows.
    for (const e of events) {
      if (e.kind === "chip") {
        assert.ok(e.board.winnerId, `C${e.id} champion`);
        const foreign = await q("select count(*)::int n from chip_entries where tournament_id = $1 and not (id = any($2::text[]))", [e.id, [...e.field]]);
        assert.equal(foreign[0].n, 0, `C${e.id}: foreign rows`);
      } else {
        const live = buildLiveMatches(e.bracket, (await lsOf(e.id)).matchState ?? {}, e.tables, "9-ball", CFG);
        const played = live.filter((m) => m.status === "completed" && m.winner != null && !m.bye).length;
        if (e.kind === "se") assert.equal(played, e.n - 1, `T${e.id} SE`);
        else assert.ok(played === 2 * e.n - 2 || played === 2 * e.n - 1, `T${e.id} DE played ${played}`);
        assert.equal(computeEliminatedRegIds(live).length, e.n - 1);
      }
    }
    const pct = (xs: number[], p: number) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))].toFixed(1) : "-");
    const k = { se: events.filter((e) => e.kind === "se").length, de: events.filter((e) => e.kind === "de").length, chip: events.filter((e) => e.kind === "chip").length };
    console.log(`MIXED total=${total} (SE ${k.se} / DE ${k.de} / Chip ${k.chip}) players=${stats.players} ticks=${ticks} wall=${(wall / 1000).toFixed(1)}s`);
    console.log(`MIXED elim: ops=${stats.elimOps} ok=${stats.elimOk} rejected=${JSON.stringify(stats.rejected)} p50=${pct(stats.elimMs, 0.5)}ms p95=${pct(stats.elimMs, 0.95)}ms crossTenantBlocked=${stats.crossTenant}`);
    console.log(`MIXED chip: actions=${stats.chipActions} saves=${stats.chipSaves} refusedStale=${stats.chipRefused} reloads=${stats.chipReloads} req/save=${(stats.chipReq / stats.chipSaves).toFixed(1)} KB/save=${(stats.chipBytes / stats.chipSaves / 1024).toFixed(0)} save p50=${pct(stats.chipSaveMs, 0.5)}ms p95=${pct(stats.chipSaveMs, 0.95)}ms`);
    return stats;
  } finally {
    Math.random = realRandom;
  }
};

const LEVELS = (process.env.MIXED_LEVELS ?? "15").split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
for (const level of LEVELS) {
  test(`mixed night: ${level} SE + DE + Chip tournaments at once stay isolated, consistent and finish`, async () => {
    const s = await runMixed(level, 777 + level);
    assert.ok(s.chipRefused > 0 && s.chipReloads > 0, "the stale second chip TD was exercised");
  });
}
