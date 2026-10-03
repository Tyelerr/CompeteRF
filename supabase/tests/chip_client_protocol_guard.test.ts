// supabase/tests/chip_client_protocol_guard.test.ts
// Old-native-client Chip overwrite protection — supabase/migrations/20261021150000_chip_client_protocol_guard.sql.
//
// FIDELITY: both app generations run their REAL save code:
//   • OLD = the public iOS build (App Store "1.25" = EAS build 66, commit 7753bf5): its own
//     src/models/services/chip.service.ts `save()` (+ its import closure) checked out from git.
//   • NEW = the current working tree's chip.service.ts `save()` (claim → rows → finalize).
// Only `src/lib/supabase` is swapped for a PostgREST-shaped shim that runs every request as its OWN
// transaction on a real Postgres (PGlite) as the `authenticated` role, with the request headers the
// real client sends (X-Client-Info). The schema is the full prod public schema
// (fixtures/prod_public_schema_20260930.json), Supabase default grants.
//
//   CHIP_GUARD=0 → run WITHOUT the migration (characterizes the bug: the stale old save wins).
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/chip_client_protocol_guard.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const MIG = "supabase/migrations/20261021150000_chip_client_protocol_guard.sql";
const GUARD = process.env.CHIP_GUARD !== "0";
const SCHEMA = JSON.parse(read("supabase/tests/fixtures/prod_public_schema_20260930.json"));
const OLD_REV = "7753bf5"; // public iOS build 66
const NEW_XCI = "compete-chip/2 supabase-js-web";
const OLD_XCI = "supabase-js-react-native/2.90.1"; // what supabase-js sends by default

// ── materialize a service + its relative-import closure into a temp dir (lib/supabase → shim) ──────
const SHIM = `export const supabase: any = new Proxy({}, { get: (_t, k) => (globalThis as any).__chipShim[k] });\n`;
function materialize(rev: string | null, entry: string, out: string) {
  const seen = new Set<string>();
  const src = (p: string): string | null => {
    try {
      return rev ? execSync(`git show ${rev}:${p}`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString() : existsSync(join(ROOT, p)) ? read(p) : null;
    } catch { return null; }
  };
  const visit = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    const dest = join(out, p);
    mkdirSync(dirname(dest), { recursive: true });
    if (p === "src/lib/supabase.ts") { writeFileSync(dest, SHIM); return; }
    const code = src(p);
    if (code == null) throw new Error(`missing ${p}@${rev ?? "worktree"}`);
    writeFileSync(dest, code);
    for (const m of code.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = posix.normalize(posix.join(posix.dirname(p), m[1]));
      const cand = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((c) => src(c) != null || c === "src/lib/supabase.ts");
      if (!cand) throw new Error(`unresolved ${m[1]} from ${p}`);
      visit(cand);
    }
  };
  visit(entry);
}

// ── PostgREST-shaped shim on PGlite: one transaction per request, as the real role + headers ──────
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const TD = "00000000-0000-0000-0000-0000000000d1";
let actor = { uid: TD, xci: NEW_XCI };
const PK: Record<string, string[]> = { chip_config: ["tournament_id"] };
const qi = (c: string) => `"${c.replace(/"/g, "")}"`;
class Req {
  op: "select" | "upsert" | "insert" | "update" | "delete" | null = null;
  payload: any; opts: any = {}; filters: { k: string; c: string; v: any }[] = []; cols: string | null = null; single = false;
  constructor(public table: string) {}
  select(cols = "*") { if (!this.op) this.op = "select"; this.cols = cols; return this; }
  upsert(rows: any, opts: any = {}) { this.op = "upsert"; this.payload = rows; this.opts = opts; return this; }
  insert(rows: any) { this.op = "insert"; this.payload = rows; return this; }
  update(obj: any) { this.op = "update"; this.payload = obj; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { this.filters.push({ k: "eq", c, v }); return this; }
  is(c: string, v: any) { this.filters.push({ k: "is", c, v }); return this; }
  in(c: string, v: any[]) { this.filters.push({ k: "in", c, v }); return this; }
  not(c: string, _op: string, v: string) {
    this.filters.push({ k: "notin", c, v: [...String(v).matchAll(/"([^"]*)"/g)].map((m) => m[1]) }); return this;
  }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  then(res: any, rej: any) { return this.exec().then(res, rej); }
  async exec() {
    const p: unknown[] = [];
    const arg = (v: unknown) => { p.push(v); return `$${p.length}`; };
    const where = this.filters.map((f) =>
      f.k === "eq" ? `${qi(f.c)}::text = ${arg(String(f.v))}`
      : f.k === "is" ? `${qi(f.c)} is ${f.v === null ? "null" : String(f.v)}`
      : f.k === "in" ? `${qi(f.c)}::text = any(${arg(f.v.map(String))}::text[])`
      : `not (${qi(f.c)}::text = any(${arg(f.v)}::text[]))`).join(" and ");
    const W = where ? ` where ${where}` : "";
    const T = `public.${qi(this.table)}`;
    let sql: string;
    if (this.op === "select") sql = `select ${this.cols === "*" ? "*" : this.cols!.split(",").map((c) => qi(c.trim())).join(",")} from ${T}${W}`;
    else if (this.op === "delete") sql = `delete from ${T}${W}`;
    else if (this.op === "update") {
      const cols = Object.keys(this.payload);
      sql = `update ${T} set ${cols.map((c) => `${qi(c)} = r.${qi(c)}`).join(", ")} from jsonb_populate_record(null::${T}, ${arg(JSON.stringify(this.payload))}::jsonb) r${W ? W.replace(/"(\w+)"::text/g, `${T}."$1"::text`) : ""}`
        + (this.cols ? ` returning ${T}.${qi(this.cols)}` : "");
    } else {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const cols = [...new Set(rows.flatMap((r: any) => Object.keys(r)))] as string[];
      const pk = this.opts.onConflict ? String(this.opts.onConflict).split(",") : PK[this.table] ?? ["id"];
      const set = cols.filter((c) => !pk.includes(c));
      sql = `insert into ${T} (${cols.map(qi).join(",")}) select ${cols.map(qi).join(",")} from jsonb_populate_recordset(null::${T}, ${arg(JSON.stringify(rows))}::jsonb)`
        + (this.op === "insert" ? "" : this.opts.ignoreDuplicates || !set.length ? ` on conflict (${pk.map(qi).join(",")}) do nothing`
          : ` on conflict (${pk.map(qi).join(",")}) do update set ${set.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(", ")}`);
    }
    await db.exec("begin");
    try {
      await db.query(`select set_config('role', 'authenticated', true), set_config('test.uid', $1, true), set_config('request.headers', $2, true)`,
        [actor.uid, JSON.stringify({ "x-client-info": actor.xci })]);
      const r = await db.query(sql, p);
      await db.exec("commit");
      const data = this.single ? r.rows[0] ?? null : r.rows;
      return { data, error: null, status: 200 };
    } catch (e: any) {
      await db.exec("rollback");
      if (process.env.CHIP_DEBUG) console.log('REQ FAIL', this.table, this.op, actor.xci, e.message, JSON.stringify(this.filters));
      return { data: null, error: { message: e.message, code: e.code, details: e.detail }, status: 400 };
    }
  }
}
const shim = { from: (t: string) => new Req(t), rpc: async () => ({ data: null, error: { message: "rpc not shimmed" } }) };

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const T = 50;
let oldSvc: any, newSvc: any, engine: any;
const DB_PRELUDE = `
  create role authenticated; create role anon; create role service_role bypassrls;
  create schema auth; create schema extensions;
  create function extensions.uuid_generate_v4() returns uuid language sql volatile as $x$ select gen_random_uuid() $x$;
  create function public.uuid_generate_v4() returns uuid language sql volatile as $x$ select gen_random_uuid() $x$;
  create function extensions.gen_random_bytes(int) returns bytea language sql volatile as $x$ select decode(md5(random()::text), 'hex') $x$;
  create function extensions.digest(text, text) returns bytea language sql immutable as $x$ select sha256(convert_to($1, 'UTF8')) $x$;
  set search_path = public, extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  set check_function_bodies = off;
`;

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(DB_PRELUDE);
  for (const k of ["auth", "seqs", "tables", "fns", "pk_uq_ck", "uidx", "fk", "trg"]) for (const s of SCHEMA[k] ?? []) await db.exec(s);
  // version column (20260910120000) + the rest of chip_config as prod has it today
  await db.exec(`alter table public.chip_config add column if not exists version integer not null default 0`);
  // Supabase privileges as in prod: existing objects granted, AND default privileges for NEW objects —
  // applied BEFORE the migration so its own revoke / grant statements take effect exactly as in prod.
  await db.exec(`grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema public, auth, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  if (GUARD) await db.exec(read(MIG));
  await q(`insert into auth.users (id, email) values ($1, 'td@x.test')`, [TD]);
  await q(`insert into public.profiles (id, email, name, user_name, role, status, home_state) values ($1, 'td@x.test', 'TD', 'td', 'tournament_director', 'active', 'AZ')`, [TD]);
  await q(`insert into public.venues (id, venue) values (1, 'V')`).catch(async () => {
    const cols = await q(`select column_name c, udt_name t from information_schema.columns where table_name = 'venues' and is_nullable = 'NO' and column_default is null`);
    await q(`insert into public.venues (${["id", ...cols.map((c: any) => c.c).filter((c: string) => c !== "id")].join(",")}) values (1${cols.filter((c: any) => c.c !== "id").map(() => ",'x'").join("")})`);
  });
  (globalThis as any).__chipShim = shim;
  const tmp = mkdtempSync(join(tmpdir(), "chip-proto-"));
  materialize(OLD_REV, "src/models/services/chip.service.ts", join(tmp, "old"));
  materialize(null, "src/models/services/chip.service.ts", join(tmp, "new"));
  materialize(null, "src/models/services/chip.engine.ts", join(tmp, "new"));
  oldSvc = (await import(pathToFileURL(join(tmp, "old", "src/models/services/chip.service.ts")).href)).chipService;
  newSvc = (await import(pathToFileURL(join(tmp, "new", "src/models/services/chip.service.ts")).href)).chipService;
  engine = await import(pathToFileURL(join(tmp, "new", "src/models/services/chip.engine.ts")).href);
});


// Insert filling NOT NULL columns without defaults with type-appropriate dummies (prod schema).
const DUMMY: Record<string, string> = { text: "'x'", varchar: "'x'", int2: '1', int4: '1', int8: '1', numeric: '0', float8: '0', bool: 'false',
  date: 'current_date', timestamptz: 'now()', timestamp: 'now()', time: "time '12:00'", jsonb: "'{}'::jsonb", uuid: 'gen_random_uuid()', _text: "'{}'::text[]" };
const ins = async (table: string, row: Record<string, unknown>) => {
  const cols = await q(`select column_name c, udt_name t, is_nullable = 'YES' nul, column_default d, identity_generation idg
    from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]);
  const checks: Record<string, string> = {};
  for (const { d } of await q(`select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
      where c.contype = 'c' and t.relname = $1`, [table])) {
    const m = /\(\(?"?([a-z_0-9]+)"?\)?(?:::text)? = ANY \(\(?ARRAY\['([^']+)'/.exec(d);
    if (m && !(m[1] in checks)) checks[m[1]] = m[2];
  }
  const names: string[] = [], vals: string[] = [], p: unknown[] = [];
  let over = false;
  for (const c of cols) {
    if (c.c in row) { names.push(`"${c.c}"`); p.push(row[c.c]); vals.push(`$${p.length}`); if (c.idg === "ALWAYS") over = true; }
    else if (!c.nul && c.d == null && !c.idg) { names.push(`"${c.c}"`); vals.push(checks[c.c] ? `'${checks[c.c]}'` : DUMMY[c.t] ?? "'x'"); }
  }
  await q(`insert into public.${table} (${names.join(",")}) ${over ? "overriding system value " : ""}values (${vals.join(",")})`, p);
};
const tournament = async (id: number) => {
  await q(`delete from public.chip_events where tournament_id = $1`, [id]);
  await q(`delete from public.chip_matches where tournament_id = $1`, [id]);
  await q(`delete from public.chip_entries where tournament_id = $1`, [id]);
  await q(`delete from public.chip_tables where tournament_id = $1`, [id]);
  await q(`delete from public.chip_results where tournament_id = $1`, [id]);
  await q(`delete from public.chip_config where tournament_id = $1`, [id]);
  await q(`delete from public.tournaments where id = $1`, [id]);
  await ins('tournaments', { id, name: 'Chip', venue_id: 1, director_id: (await q('select id_auto from public.profiles where id = $1', [TD]))[0].id_auto,
    status: 'active', live_state: 'in_progress', tournament_format: 'chip-tournament', game_type: '9-ball' });
};
// A started 8-player board with the CURRENT engine (the same ChipState shape both builds persist).
let boardSeq = 0;
const board = (n = 8, tables = 2) => {
  const tag = `b${++boardSeq}`; // entry ids are globally unique in prod (newId) — keep them unique here too
  const E = engine;
  let s = E.emptyChipState("singles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t1", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: Array.from({ length: n }, (_, i) => ({
    id: `${tag}_e${i}`, p1Name: `P${i}`, p1Fargo: 500, p1Phone: "", p2Name: "", p2Fargo: null, teamFargo: 500, startChips: 0, chips: 0,
    paid: true, checkedIn: true, paidSidePots: [], status: "queued", wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0,
    createdAt: "2026-10-03T10:00:00.000Z",
  })) };
  s = E.addTables(s, tables);
  return E.settleChipState(E.startAllMatches(E.startChipTournament(s)));
};
const recordFirst = (s: any) => {
  const m = s.matches.find((x: any) => x.status === "in_progress");
  return engine.settleChipState(engine.recordWinner(s, m.id, m.aId));
};
const snap = async (id: number) => ({
  config: (await q(`select queue, finished_at, winner_entry_id, version from public.chip_config where tournament_id = $1`, [id]))[0] ?? null,
  entries: await q(`select id, chips, status, table_id, wins, losses from public.chip_entries where tournament_id = $1 order by id`, [id]),
  matches: await q(`select id, status, winner_id from public.chip_matches where tournament_id = $1 order by id`, [id]),
  tables: await q(`select id, holder_id, match_id from public.chip_tables where tournament_id = $1 order by id`, [id]).catch(() => []),
  events: (await q(`select count(*)::int n from public.chip_events where tournament_id = $1`, [id]))[0].n,
  status: (await q(`select status, live_state from public.tournaments where id = $1`, [id]))[0],
});
const asNew = () => { actor = { uid: TD, xci: NEW_XCI }; };
const asOld = () => { actor = { uid: TD, xci: OLD_XCI }; };
const version = async (id: number) => Number((await q(`select version from public.chip_config where tournament_id = $1`, [id]))[0]?.version ?? 0);

// Both devices load the same state (version v); the NEW client then records a result.
const mixedSetup = async (id: number) => {
  await tournament(id);
  const base = board();
  asOld();
  await oldSvc.save(id, base); // the event was created on the old phone (legacy-only so far)
  const v0 = await version(id);
  const loadedByOld = structuredClone(base);
  asNew();
  const after = recordFirst(base);
  const r = await newSvc.save(id, after, { expectedVersion: v0 });
  assert.equal(r.conflict ?? false, false, `new save conflicted: ${JSON.stringify(r)}`);
  return { loadedByOld, newer: await snap(id) };
};

// ── 1. OLD + NEW matrix: the web TD acts, then the old phone saves its STALE board ────────────────
// Mirrors the VM's update(): shared settle, then a restore point for any action that logged events.
const act = (c: any, fn: (s: any) => any) => {
  let next = engine.settleChipState(fn(c));
  if (next === c) return c;
  const added = next.events.length - c.events.length;
  if (added <= 0) return next;
  const ev = next.events.slice(0, added);
  if (added > 1) {
    const tx = engine.newId("tx");
    next = { ...next, events: next.events.map((e: any, i: number) => (i < added ? { ...e, txId: tx } : e)) };
  }
  return engine.withRestorePoint(next, c, ev.map((e: any) => e.id), ev[ev.length - 1].text);
};
const WEB_ACTIONS: [string, (s: any) => any][] = [
  ["result", (s) => act(s, (c) => { const m = c.matches.find((x: any) => x.status === "in_progress"); return engine.recordWinner(c, m.id, m.aId); })],
  ["queue move", (s) => act(s, (c) => engine.moveQueueEntry(c, c.queue[c.queue.length - 1], 0))],
  ["table lock", (s) => act(s, (c) => engine.setTableLocked(c, c.tables[1].id, true))],
  ["chip change", (s) => act(s, (c) => engine.adjustChips(c, c.queue[0], -1, { reason: "Correction" }))],
  ["Undo", (s) => engine.settleChipState(engine.undoLastActions(act(s, (c) => { const m = c.matches.find((x: any) => x.status === "in_progress"); return engine.recordWinner(c, m.id, m.aId); }), 1, { reason: "test" }))],
  ["Restore", (s) => { const a = act(s, (c) => { const m = c.matches.find((x: any) => x.status === "in_progress"); return engine.recordWinner(c, m.id, m.aId); });
    const b = act(a, (c) => engine.moveQueueEntry(c, c.queue[c.queue.length - 1], 0));
    return engine.settleChipState(engine.restoreToPoint(b, b.restorePoints[0].primaryEventId, { reason: "test" })); }],
  ["Finish", (s) => ({ ...s, finishedAt: "2026-10-03T12:00:00.000Z", winnerId: s.entries[0].id })],
];
let nextId = 100;
for (const [label, webAct] of WEB_ACTIONS) {
  test(`1 ${GUARD ? "AFTER" : "BEFORE"} — web ${label}, then the old phone saves its stale board`, async () => {
    const id = nextId++;
    await tournament(id);
    const base = board();
    asOld();
    await oldSvc.save(id, base);                    // event created on the old phone (legacy-only so far)
    const loadedByOld = structuredClone(base);      // the phone keeps this board…
    asNew();
    const web = webAct(structuredClone(base));      // …while the web TD acts and saves (claim protocol)
    const r = await newSvc.save(id, web, { expectedVersion: await version(id) });
    assert.equal(r.conflict ?? false, false, `web save: ${JSON.stringify(r)}`);
    if (label === "Finish") await q(`select set_config('request.headers', $1, false)`, [JSON.stringify({ "x-client-info": NEW_XCI })])
      .then(() => q(`update public.tournaments set status = 'completed', live_state = 'finished' where id = $1`, [id]));
    const authoritative = await snap(id);
    asOld();
    // the phone records its own (different) result on the stale board, then saves the whole blob
    const m = loadedByOld.matches.find((x: any) => x.status === "in_progress");
    const stale = engine.settleChipState(engine.recordWinner(loadedByOld, m.id, m.bId));
    let err: any = null;
    try { await oldSvc.save(id, stale); } catch (e) { err = e; }
    const after = await snap(id);
    if (GUARD) {
      assert.match(String(err?.message ?? err), /chip_client_outdated/, "the old phone's save fails");
      assert.deepEqual(after, authoritative, "ZERO change: config / queue / entries / matches / tables / events / version / status");
    } else {
      assert.notDeepEqual(after, authoritative, `BUG reproduced: the stale old save overwrote the web ${label}`);
    }
  });
}

// ── 2. legacy-only tournament: the old phone alone keeps working ─────────────────────────────────
test("2: an old phone alone can run a tournament (start → results → queue → finish)", async () => {
  await tournament(T + 1);
  asOld();
  let s = board(6, 2);
  await oldSvc.save(T + 1, s);
  for (let i = 0; i < 40; i++) {
    const m = s.matches.find((x: any) => x.status === "in_progress");
    if (!m) { const t = s.tables.find((x: any) => x.pendingChallengerId); if (!t) break; s = engine.settleChipState(engine.startPendingMatch(s, t.id)); continue; }
    s = engine.settleChipState(engine.recordWinner(s, m.id, m.aId));
    await oldSvc.save(T + 1, s);
  }
  const out = await snap(T + 1);
  assert.ok(out.matches.filter((x: any) => x.status === "finished").length > 5, "results persisted");
  assert.equal(out.config.version > 0, true);
  assert.equal((await q(`select min_client_protocol m from public.chip_config where tournament_id = $1`, [T + 1]).catch(() => [{ m: null }]))[0].m ?? null, null, "never stamped");
});

// ── 3/4. new client: current save works; stale save refused (existing claim protocol) ─────────────
test("3+4: new client — current save lands; a stale new save writes nothing", async () => {
  await tournament(T + 2);
  asNew();
  const s0 = board();
  await newSvc.save(T + 2, s0, { expectedVersion: null });
  const v0 = await version(T + 2);
  const a = recordFirst(s0);
  const ra = await newSvc.save(T + 2, a, { expectedVersion: v0 });
  assert.equal(ra.conflict ?? false, false);
  const before = await snap(T + 2);
  const b = recordFirst(structuredClone(s0)); // second device, same base
  const rb = await newSvc.save(T + 2, b, { expectedVersion: v0 });
  assert.equal(rb.conflict, true, "stale new save reports a conflict");
  assert.deepEqual(await snap(T + 2), before, "and writes nothing");
});

// ── 9. the guard refuses each legacy request whole; new clients are untouched ─────────────────────
test("9: every table the old save touches is guarded; server roles and new clients pass", async () => {
  if (!GUARD) return;
  await mixedSetup(T + 5);
  for (const sql of [
    `update public.chip_config set queue = '[]'::jsonb where tournament_id = ${T + 5}`,
    `update public.chip_entries set chips = 99 where tournament_id = ${T + 5}`,
    `delete from public.chip_matches where tournament_id = ${T + 5}`,
    `delete from public.chip_tables where tournament_id = ${T + 5}`,
    `insert into public.chip_events (id, tournament_id, type, text) values ('ev_old', ${T + 5}, 'manual', 'x')`,
    `insert into public.chip_results (tournament_id, entry_id, place) values (${T + 5}, 'e1', 1)`,
  ]) {
    await db.exec("begin");
    try {
      await db.query(`select set_config('role', 'authenticated', true), set_config('test.uid', $1, true), set_config('request.headers', $2, true)`, [TD, JSON.stringify({ "x-client-info": OLD_XCI })]);
      await assert.rejects(db.query(sql), /chip_client_outdated/, sql);
    } finally { await db.exec("rollback"); }
  }
  // service role (Edge Functions) and the owner (definer RPCs) are not subject to it
  await db.exec("begin");
  try {
    await db.query(`set local role service_role`);
    await db.query(`update public.chip_entries set chips = chips where tournament_id = ${T + 5}`);
  } finally { await db.exec("rollback"); }
  // an old client can't clear the stamp
  const m = (await q(`select min_client_protocol m from public.chip_config where tournament_id = $1`, [T + 5]))[0].m;
  assert.equal(m, 2);
});

test("10: the server reads the protocol from X-Client-Info (diagnostic RPC)", async () => {
  if (!GUARD) return;
  for (const [xci, want] of [[NEW_XCI, 2], [OLD_XCI, 1], ["", 1], ["compete-chip/3 x", 3]] as const) {
    await db.exec("begin");
    try {
      await db.query(`select set_config('role', 'authenticated', true), set_config('request.headers', $1, true)`, [JSON.stringify({ "x-client-info": xci })]);
      assert.equal((await db.query(`select public.chip_client_protocol() p`)).rows[0].p, want, xci);
    } finally { await db.exec("rollback"); }
  }
});

// ── NEW + NEW: any two current-client saves from the same base — exactly one lands, unchanged ─────
const NEW_PAIRS: [string, (s: any) => any][] = WEB_ACTIONS.filter(([l]) => l !== "Finish");
test("NEW + NEW: two current clients from the same base — the second always conflicts and writes nothing", async () => {
  for (const [la, fa] of NEW_PAIRS) for (const [lb, fb] of NEW_PAIRS.slice(0, 3)) {
    const id = nextId++;
    await tournament(id);
    asNew();
    const base = board();
    await newSvc.save(id, base, { expectedVersion: null });
    const v = await version(id);
    const ra = await newSvc.save(id, fa(structuredClone(base)), { expectedVersion: v });
    assert.equal(ra.conflict ?? false, false, `${la} first`);
    const won = await snap(id);
    const rb = await newSvc.save(id, fb(structuredClone(base)), { expectedVersion: v });
    assert.equal(rb.conflict, true, `${la} vs ${lb}: second conflicts`);
    assert.deepEqual(await snap(id), won, `${la} vs ${lb}: nothing written by the loser`);
  }
});

// ── OLD + OLD: documented limitation (no freshness signal in the legacy save) ─────────────────────
test("OLD + OLD (limitation, unchanged by design): two old phones on a never-stamped event behave as before", async () => {
  const id = nextId++;
  await tournament(id);
  asOld();
  const base = board();
  await oldSvc.save(id, base);
  const phoneB = structuredClone(base);
  await oldSvc.save(id, act(structuredClone(base), (c) => { const m = c.matches.find((x: any) => x.status === "in_progress"); return engine.recordWinner(c, m.id, m.aId); }));
  const afterA = await snap(id);
  const m = phoneB.matches.find((x: any) => x.status === "in_progress");
  await oldSvc.save(id, engine.settleChipState(engine.recordWinner(phoneB, m.id, m.bId)));
  // The legacy save carries no version or read-marker, so the server cannot tell B is stale: last
  // writer wins, exactly as today. Protection starts the moment ANY current client writes the event.
  assert.notDeepEqual(await snap(id), afterA);
});

// ── FUZZ: mixed actors (web, current native, old native) over many events ────────────────────────
const FUZZ_EVENTS = Number(process.env.CHIP_FUZZ ?? 3);
// PGlite (WASM) leaks stack on every caught exception, so a long fuzz runs as batches of ≤10 events in
// fresh processes: CHIP_FUZZ_OFFSET shifts the event ids and the seed.
const FUZZ_OFFSET = Number(process.env.CHIP_FUZZ_OFFSET ?? 0);
test(`FUZZ ${GUARD ? "AFTER" : "BEFORE"}: ${FUZZ_EVENTS} events — no accepted stale overwrite once a current client wrote`, { timeout: 3_600_000 }, async () => {
  let seed = 4242 + FUZZ_OFFSET;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
  const stats = { events: 0, ops: 0, newSaves: 0, oldSaves: 0, staleOldOnProtected: 0, acceptedStaleOnProtected: 0,
    staleOldOnLegacyOnly: 0, versionRegressions: 0, partialWrites: 0, invariantFailures: 0 };
  const playable = (s: any) => s.matches.some((x: any) => x.status === "in_progress") || s.tables.some((t: any) => t.pendingChallengerId);
  const step = (s: any) => {
    const live = s.matches.filter((x: any) => x.status === "in_progress");
    const r = rnd();
    if (live.length && r < 0.55) { const m: any = pick(live); return act(s, (c) => engine.recordWinner(c, m.id, rnd() < 0.5 ? m.aId : m.bId)); }
    const pend = s.tables.find((t: any) => t.pendingChallengerId && !t.matchId);
    if (pend && r < 0.75) return act(s, (c) => engine.startPendingMatch(c, pend.id));
    if (s.queue.length > 1 && r < 0.85) return act(s, (c) => engine.moveQueueEntry(c, pick(c.queue), 0));
    if (s.queue.length && r < 0.92) return act(s, (c) => engine.adjustChips(c, pick(c.queue), rnd() < 0.5 ? 1 : -1, { reason: "Correction" }));
    if ((s.restorePoints ?? []).length && r < 0.97) return engine.settleChipState(engine.undoLastActions(s, 1, { reason: "fuzz" }));
    return live.length ? act(s, (c) => engine.recordWinner(c, live[0].id, live[0].aId)) : s;
  };
  const invariants = async (id: number) => {
    const ents = await q(`select id, chips, status, table_id from public.chip_entries where tournament_id = $1`, [id]);
    const cfg = (await q(`select queue from public.chip_config where tournament_id = $1`, [id]))[0];
    const tabs = await q(`select holder_id, pending_challenger_id from public.chip_tables where tournament_id = $1`, [id]).catch(() => []);
    const queue: string[] = cfg?.queue ?? [];
    const elim = new Set(ents.filter((e: any) => e.status === "eliminated").map((e: any) => e.id));
    const seated = tabs.flatMap((t: any) => [t.holder_id, t.pending_challenger_id]).filter(Boolean);
    return ents.every((e: any) => e.chips >= 0) && !queue.some((x) => elim.has(x)) && new Set(seated).size === seated.length;
  };
  for (let ev = FUZZ_OFFSET; ev < FUZZ_OFFSET + FUZZ_EVENTS; ev++) {
    stats.events++;
    const id = 900 + ev;
    await tournament(id);
    asOld();
    let truth = board(pick([6, 8, 10]), pick([2, 3]));
    await oldSvc.save(id, truth);
    const history: { s: any; v: number }[] = [{ s: structuredClone(truth), v: await version(id) }];
    let webJoined = false;
    let lastVersion = await version(id);
    for (let i = 0; i < 40 && playable(truth); i++) {
      stats.ops++;
      const who = !webJoined && i < 5 ? "old" : pick(["web", "native", "old", "old"]);
      if (who === "old") {
        // the phone acts on a board it loaded at some earlier point (stale) or just now (fresh)
        const loaded = rnd() < 0.6 ? pick(history) : history[history.length - 1];
        const stale = loaded.v !== await version(id);
        const mine = step(structuredClone(loaded.s));
        const before = await snap(id);
        asOld();
        let ok = true;
        try { await oldSvc.save(id, mine); } catch { ok = false; }
        stats.oldSaves++;
        const after = await snap(id);
        const protectedEvent = webJoined;
        if (stale && protectedEvent) {
          stats.staleOldOnProtected++;
          if (JSON.stringify(after) !== JSON.stringify(before)) stats.acceptedStaleOnProtected++;
        } else if (stale) stats.staleOldOnLegacyOnly++;
        if (protectedEvent && GUARD && JSON.stringify(after) !== JSON.stringify(before)) stats.partialWrites++;
        if (ok && !protectedEvent) { truth = mine; history.push({ s: structuredClone(mine), v: await version(id) }); }
      } else {
        asNew();
        const next = step(structuredClone(truth));
        const r = await newSvc.save(id, next, { expectedVersion: await version(id) });
        stats.newSaves++;
        if (!r.conflict) { truth = next; webJoined = true; history.push({ s: structuredClone(next), v: await version(id) }); }
      }
      const v = await version(id);
      if (v < lastVersion) stats.versionRegressions++;
      lastVersion = v;
      if (!(await invariants(id))) stats.invariantFailures++;
    }
  }
  console.log(JSON.stringify(stats));
  if (GUARD) {
    assert.equal(stats.acceptedStaleOnProtected, 0, "no stale legacy write accepted once a current client wrote the event");
    assert.equal(stats.partialWrites, 0, "every refused legacy save wrote nothing");
  } else {
    assert.ok(stats.acceptedStaleOnProtected > 0, "BEFORE: stale legacy writes are accepted");
  }
  assert.equal(stats.versionRegressions, 0, "version never moves backwards");
});
