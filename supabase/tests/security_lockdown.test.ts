// supabase/tests/security_lockdown.test.ts
// Real-policy tests for supabase/migrations/20261021120000_security_lockdown.sql (2026-10-03).
// PGlite replays the FULL prod public schema (fixtures/prod_public_schema_20260930.json) plus the
// prod RLS policies, views and current function bodies of the affected tables, captured read-only
// on 2026-10-03 (fixtures/security_lockdown_prod_20261003.json). Supabase's default grants are
// reproduced (anon / authenticated get ALL on public tables + views — the root cause of hole A).
// Every probe runs as the real PostgREST role (SET LOCAL ROLE anon | authenticated, auth.uid()
// stubbed from a GUC) inside a transaction that is rolled back.
//   base   = prod as captured → the exploits WORK (characterizes the holes)
//   fixed  = base + migration → exploits refused, legitimate flows still work
//   undone = fixed + rollback → exploits work again (rollback is complete)
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/security_lockdown.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const MIGRATION = read("supabase/migrations/20261021120000_security_lockdown.sql");
const ROLLBACK = read("supabase/rollback/20261021120000_security_lockdown_rollback.sql");
const SCHEMA = JSON.parse(read("supabase/tests/fixtures/prod_public_schema_20260930.json"));
const PROD = JSON.parse(read("supabase/tests/fixtures/security_lockdown_prod_20261003.json"));

type DB = any;
const PRELUDE = `
  create role authenticated; create role anon; create role service_role;
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
// Supabase's default privileges: anon/authenticated get everything; RLS is the gate.
const SUPABASE_GRANTS = `
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public, auth, extensions to anon, authenticated, service_role;
`;

const SA = "00000000-0000-0000-0000-00000000a001";
const TD = "00000000-0000-0000-0000-00000000a002";
const BASIC = "00000000-0000-0000-0000-00000000a003";
const OTHER = "00000000-0000-0000-0000-00000000a004";
const T_OPEN = 10, T_CLOSED = 11, REG_OTHER = 500;
const CONV = "00000000-0000-0000-0000-0000000c0001";

async function buildDb(): Promise<DB> {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  const db = new mod.PGlite();
  await db.exec(PRELUDE);
  for (const k of ["auth", "seqs", "tables", "fns", "pk_uq_ck", "uidx", "fk", "trg"]) {
    for (const s of SCHEMA[k] ?? []) await db.exec(s);
  }
  for (const f of PROD.fns) await db.exec(f); // current prod bodies of the functions in play
  for (const v of PROD.views) await db.exec(v);
  for (const t of PROD.rls) await db.exec(`alter table public.${t} enable row level security`);
  for (const p of PROD.policies) await db.exec(p);
  await db.exec(SUPABASE_GRANTS);
  await seed(db);
  return db;
}

const q = async (db: DB, sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

// Generic seeding: fills NOT NULL columns without defaults with type-appropriate dummies.
const DUMMY: Record<string, string> = {
  text: "'x'", varchar: "'x'", int2: "1", int4: "1", int8: "1", numeric: "0", float8: "0", bool: "false",
  date: "date '2026-01-01'", timestamptz: "now()", timestamp: "now()", time: "time '12:00'", jsonb: "'{}'::jsonb",
  uuid: "gen_random_uuid()", _text: "'{}'::text[]", tsvector: "''::tsvector",
};
async function ins(db: DB, fq: string, row: Record<string, unknown>) {
  const [schema, table] = fq.includes(".") ? fq.split(".") : ["public", fq];
  const cols = await q(db, `select column_name c, udt_name t, is_nullable = 'YES' nul, column_default d, is_generated = 'ALWAYS' gen,
      identity_generation idg from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`, [schema, table]);
  const checks: Record<string, string> = {};
  for (const { d } of await q(db, `select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace where c.contype = 'c' and n.nspname = $1 and t.relname = $2`, [schema, table])) {
    const m = /\(\(?"?([a-z_0-9]+)"?\)?(?:::text)? = ANY \(\(?ARRAY\['([^']+)'/.exec(d);
    if (m && !(m[1] in checks)) checks[m[1]] = m[2];
  }
  const names: string[] = [], vals: string[] = [], params: unknown[] = [];
  let overriding = false;
  for (const c of cols) {
    if (c.gen) continue;
    if (c.c in row) {
      names.push(`"${c.c}"`); params.push(row[c.c]); vals.push(`$${params.length}`);
      if (c.idg === "ALWAYS") overriding = true;
    } else if (!c.nul && c.d == null && !c.idg) {
      if (!(c.t in DUMMY)) throw new Error(`no dummy for ${fq}.${c.c} (${c.t})`);
      names.push(`"${c.c}"`); vals.push(checks[c.c] ? `'${checks[c.c]}'` : DUMMY[c.t]);
    }
  }
  try {
    return (await q(db, `insert into ${schema}.${table} (${names.join(",")}) ${overriding ? "overriding system value " : ""}values (${vals.join(",")}) returning *`, params))[0];
  } catch (e: any) {
    throw new Error(`seed ${fq}: ${e.message}`);
  }
}

async function seed(db: DB) {
  const users: [string, number, string][] = [[SA, 1, "super_admin"], [TD, 2, "tournament_director"], [BASIC, 3, "basic_user"], [OTHER, 4, "basic_user"]];
  for (const [id, n, role] of users) {
    await ins(db, "auth.users", { id, email: `u${n}@x.test` });
    await ins(db, "profiles", { id, id_auto: n, email: `u${n}@x.test`, name: `User ${n}`, user_name: `user${n}`, role, status: "active" });
  }
  // Seeded rows use explicit id_auto 1–4; move the generator past them so a sign-up insert works.
  await q(db, `select setval(pg_get_serial_sequence('public.profiles', 'id_auto'), 1000)`);
  await ins(db, "venues", { id: 1, venue: "Test Venue" });
  await ins(db, "tournaments", { id: T_OPEN, name: "Open", venue_id: 1, director_id: 2, status: "active", live_state: "registration_open" });
  await ins(db, "tournaments", { id: T_CLOSED, name: "Closed", venue_id: 1, director_id: 2, status: "active", live_state: "registration_closed" });
  await ins(db, "tournament_players", { id: REG_OTHER, tournament_id: T_OPEN, player_id: 4, status: "preregistered" });
  await ins(db, "chip_config", { tournament_id: T_OPEN });
  await ins(db, "chip_events", { id: "ev1", tournament_id: T_OPEN, type: "match_result", text: "A beat B" });
  await ins(db, "conversations", { id: CONV, created_by: OTHER });
  await ins(db, "conversation_participants", { conversation_id: CONV, user_id: OTHER });
  await ins(db, "conversation_participants", { conversation_id: CONV, user_id: SA });
  await ins(db, "conversation_messages", { conversation_id: CONV, sender_id: OTHER, content: "private" });
}

type Res = { ok: boolean; n?: number; rows?: any[]; code?: string; msg?: string };
// Run statements as `who` (null = anon) in ONE transaction, then roll back. Stops at the first error.
async function as(db: DB, who: string | null, ...stmts: string[]): Promise<Res[]> {
  const out: Res[] = [];
  await db.exec("begin");
  try {
    await db.exec(who ? `set local role authenticated; select set_config('test.uid', '${who}', true);`
                      : `set local role anon; select set_config('test.uid', '', true);`);
    for (const s of stmts) {
      try {
        const r = await db.query(s);
        out.push({ ok: true, n: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0), rows: r.rows });
      } catch (e: any) {
        out.push({ ok: false, code: e.code, msg: e.message });
        break;
      }
    }
  } finally {
    await db.exec("rollback");
  }
  return out;
}
const one = async (db: DB, who: string | null, s: string) => (await as(db, who, s))[0];
const denied = (r: Res, label: string) => assert.ok(!r.ok && r.code === "42501", `${label}: expected 42501, got ${JSON.stringify(r)}`);
const okRows = (r: Res, n: number, label: string) => assert.ok(r.ok && r.n === n, `${label}: expected ok ${n}, got ${JSON.stringify(r)}`);

let base: DB, fixed: DB, undone: DB;
before(async () => {
  [base, fixed, undone] = await Promise.all([buildDb(), buildDb(), buildDb()]);
  await fixed.exec(MIGRATION);
  await undone.exec(MIGRATION);
  await undone.exec(ROLLBACK);
});

// ── the exploits, before / after / after rollback ───────────────────────────────────────────
const EXPLOITS: [string, string | null, string][] = [
  ["anon UPDATE profiles_public", null, `update public.profiles_public set name = 'hacked' where id_auto = 3`],
  ["anon UPDATE chip_config_public", null, `update public.chip_config_public set finished_at = now() where tournament_id = ${T_OPEN}`],
  ["anon DELETE chip_config_public", null, `delete from public.chip_config_public where tournament_id = ${T_OPEN}`],
  ["anon DELETE chip_events_public", null, `delete from public.chip_events_public where tournament_id = ${T_OPEN}`],
  ["anon hide RPC", null, `select 1 from (select public.hide_tournament_and_resolve_report(${T_OPEN}, null, '${SA}')) x`],
  ["user UPDATE profiles_public (other user)", BASIC, `update public.profiles_public set name = 'hacked' where id_auto = 4`],
  ["user hide RPC", BASIC, `select 1 from (select public.hide_tournament_and_resolve_report(${T_OPEN}, null, '${SA}')) x`],
  ["user self-verify Fargo", BASIC, `update public.profiles set fargo = 799, fargo_status = 'verified' where id = '${BASIC}'`],
  ["user self-award winnings", BASIC, `update public.profiles set total_winnings = 99999 where id = '${BASIC}'`],
  ["user registers into CLOSED event as checked_in+paid", BASIC,
    `insert into public.tournament_players (tournament_id, player_id, status, paid_entry, checked_in_at, seed) values (${T_CLOSED}, 3, 'checked_in', true, now(), 1)`],
  ["user registers into open event as checked_in+paid", BASIC,
    `insert into public.tournament_players (tournament_id, player_id, status, paid_entry) values (${T_OPEN}, 3, 'checked_in', true)`],
  ["user joins a stranger's conversation", BASIC, `insert into public.conversation_participants (conversation_id, user_id) values ('${CONV}', '${BASIC}')`],
];

test("BEFORE: every exploit works on prod as captured (characterization)", async () => {
  for (const [label, who, sql] of EXPLOITS) {
    const r = await one(base, who, sql);
    assert.ok(r.ok && (r.n ?? 0) >= 1, `${label} should succeed on the unfixed schema: ${JSON.stringify(r)}`);
  }
});

test("AFTER: every exploit is refused with 42501 and changes nothing", async () => {
  for (const [label, who, sql] of EXPLOITS) denied(await one(fixed, who, sql), label);
  // nothing persisted (each probe rolled back, and the refusals happened before any write)
  const [t] = await q(fixed, `select is_hidden from public.tournaments where id = ${T_OPEN}`);
  assert.equal(t.is_hidden, false);
});

test("ROLLBACK: restores the previous behavior exactly (exploits work again)", async () => {
  for (const [label, who, sql] of EXPLOITS) {
    const r = await one(undone, who, sql);
    assert.ok(r.ok && (r.n ?? 0) >= 1, `${label} should succeed again after rollback: ${JSON.stringify(r)}`);
  }
  const pol = await q(undone, `select polname, pg_get_expr(polqual, polrelid) qq, pg_get_expr(polwithcheck, polrelid) cc
    from pg_policy where polrelid = 'public.conversation_participants'::regclass and polname in ('participants_insert','participants_update') order by 1`);
  const polBase = await q(base, `select polname, pg_get_expr(polqual, polrelid) qq, pg_get_expr(polwithcheck, polrelid) cc
    from pg_policy where polrelid = 'public.conversation_participants'::regclass and polname in ('participants_insert','participants_update') order by 1`);
  assert.deepEqual(pol, polBase, "participant policies restored verbatim");
  const trg = await q(undone, `select tgname from pg_trigger where tgname in ('profiles_guard_fargo','tournament_players_guard_self','conversation_participants_guard')`);
  assert.equal(trg.length, 0);
});

test("AFTER: moving / editing participant rows and other users' rows is refused", async () => {
  // move own row to another conversation
  const other = "00000000-0000-0000-0000-0000000c0002";
  await q(fixed, `insert into public.conversations (id, created_by) values ('${other}', '${SA}') on conflict do nothing`);
  denied((await as(fixed, OTHER, `update public.conversation_participants set conversation_id = '${other}' where user_id = '${OTHER}'`))[0], "move own row");
  // someone else's participant row: RLS hides it (0 rows), never an update
  okRows(await one(fixed, BASIC, `update public.conversation_participants set last_read_at = now() where conversation_id = '${CONV}'`), 0, "other participant");
  okRows(await one(fixed, BASIC, `select * from public.conversation_messages where conversation_id = '${CONV}'`), 0, "stranger messages");
  // someone else's registration: 0 rows
  okRows(await one(fixed, BASIC, `update public.tournament_players set paid_entry = true where id = ${REG_OTHER}`), 0, "other registration");
});

test("AFTER: a player cannot self-promote their own registration", async () => {
  const mk = `insert into public.tournament_players (tournament_id, player_id, status) values (${T_OPEN}, 3, 'preregistered') returning id`;
  const own = `(select id from public.tournament_players where tournament_id = ${T_OPEN} and player_id = 3)`;
  for (const [label, set] of [
    ["paid", `paid_entry = true`],
    ["side pot", `paid_side_pots = '["Mini"]'::jsonb`],
    ["check in", `status = 'checked_in', checked_in_at = now()`],
    ["approved", `status = 'approved'`],
    ["seed", `seed = 1`],
    ["move tournament", `tournament_id = ${T_CLOSED}`],
  ] as const) {
    const r = await as(fixed, BASIC, mk, `update public.tournament_players set ${set} where id = ${own}`);
    assert.ok(r[0].ok, `prereg insert: ${JSON.stringify(r[0])}`);
    denied(r[1], `self ${label}`);
  }
  // no_show → active without the TD
  const r = await as(fixed, BASIC, mk, `update public.tournament_players set status = 'cancelled' where id = ${own}`);
  assert.ok(r[1].ok);
  await q(fixed, `insert into public.tournament_players (tournament_id, player_id, status) values (${T_CLOSED}, 3, 'no_show')`);
  denied(await one(fixed, BASIC, `update public.tournament_players set status = 'preregistered' where tournament_id = ${T_CLOSED} and player_id = 3`), "no_show → active");
  await q(fixed, `delete from public.tournament_players where tournament_id = ${T_CLOSED} and player_id = 3`);
});

// ── legitimate flows keep working ────────────────────────────────────────────────────────────
test("AFTER: public / anon reads are unchanged", async () => {
  for (const sql of [
    `select * from public.profiles_public`,
    `select * from public.chip_config_public where tournament_id = ${T_OPEN}`,
    `select * from public.chip_events_public where tournament_id = ${T_OPEN}`,
    `select * from public.tournament_players where tournament_id = ${T_OPEN}`,
    `select id, name from public.tournaments where status = 'active'`,
  ]) {
    const [b, f] = [await one(base, null, sql), await one(fixed, null, sql)];
    assert.ok(f.ok, `${sql}: ${JSON.stringify(f)}`);
    assert.equal(f.n, b.n, `${sql}: same rows as before`);
    assert.ok((f.n ?? 0) > 0, `${sql}: non-empty`);
  }
});

test("AFTER: player self-service registration (preregister, edit suggested Fargo, cancel, re-register)", async () => {
  const own = `(select id from public.tournament_players where tournament_id = ${T_OPEN} and player_id = 3)`;
  const r = await as(fixed, BASIC,
    `insert into public.tournament_players (tournament_id, player_id, status, fargo_rating) values (${T_OPEN}, 3, 'preregistered', 520)`,
    `update public.tournament_players set fargo_rating = 530 where id = ${own}`,
    `update public.tournament_players set status = 'cancelled' where id = ${own}`,
    `update public.tournament_players set status = 'preregistered' where id = ${own}`,
    `update public.tournament_players set fargo_rating = 540 where id = ${own}`,
  );
  assert.deepEqual(r.map((x) => [x.ok, x.n]), [[true, 1], [true, 1], [true, 1], [true, 1], [true, 1]], JSON.stringify(r));
  // closed event: no self-registration (the app's own rule — Register shows only while open)
  denied(await one(fixed, BASIC, `insert into public.tournament_players (tournament_id, player_id, status) values (${T_CLOSED}, 3, 'preregistered')`), "self-register closed");
});

test("AFTER: profile self-edit of allowed fields still works; sign-up insert still works", async () => {
  okRows(await one(fixed, BASIC, `update public.profiles set home_state = 'AZ', favorite_player = 'x', name = 'New Name' where id = '${BASIC}'`), 1, "self edit");
  const nu = "00000000-0000-0000-0000-00000000a009";
  await q(fixed, `insert into auth.users (id, email) values ('${nu}', 'new@x.test')`);
  const r = await one(fixed, nu, `insert into public.profiles (id, email, name, user_name, home_state) values ('${nu}', 'new@x.test', 'New', 'newuser', 'AZ')`);
  assert.ok(r.ok, `sign-up insert: ${JSON.stringify(r)}`);
  denied(await one(fixed, nu, `insert into public.profiles (id, email, name, user_name, fargo, fargo_status) values ('${nu}', 'new@x.test', 'New', 'newuser2', 700, 'verified')`), "sign-up with verified Fargo");
});

test("AFTER: conversation participant can read, mark read, archive / unarchive", async () => {
  const r = await as(fixed, OTHER,
    `select * from public.conversation_messages where conversation_id = '${CONV}'`,
    `update public.conversation_participants set last_read_at = now() where conversation_id = '${CONV}' and user_id = '${OTHER}'`,
    `update public.conversation_participants set archived_at = now() where conversation_id = '${CONV}' and user_id = '${OTHER}'`,
    `update public.conversation_participants set archived_at = null where conversation_id = '${CONV}' and user_id = '${OTHER}'`,
  );
  assert.deepEqual(r.map((x) => [x.ok, x.n]), [[true, 1], [true, 1], [true, 1], [true, 1]], JSON.stringify(r));
  // the SECURITY DEFINER creation path still adds participants
  const created = await q(fixed, `select count(*)::int n from pg_proc where proname = 'create_conversation_with_participants' and prosecdef`);
  assert.equal(created[0].n, 1, "participant inserts go through the definer RPC (runs as owner, bypasses the admin-only insert policy)");
});

test("AFTER: TD flows — add / check in / paid / side pots / no-show / reactivate / approve with Fargo", async () => {
  const reg = `(select id from public.tournament_players where tournament_id = ${T_CLOSED} and player_id = 3)`;
  const r = await as(fixed, TD,
    `insert into public.tournament_players (tournament_id, player_id, status, paid_entry, checked_in_at) values (${T_CLOSED}, 3, 'checked_in', true, now())`,
    `update public.tournament_players set paid_side_pots = '["Mini"]'::jsonb, seed = 3, fargo_rating = 610, race_override = 5 where id = ${reg}`,
    `update public.tournament_players set status = 'no_show' where id = ${reg}`,
    `update public.tournament_players set status = 'checked_in' where id = ${reg}`,
    `update public.tournament_players set paid_entry = false where id = ${REG_OTHER}`,
  );
  assert.deepEqual(r.map((x) => [x.ok, x.n]), [[true, 1], [true, 1], [true, 1], [true, 1], [true, 1]], JSON.stringify(r));
  // Fargo verification through the SECURITY DEFINER RPC still writes the verified profile Fargo
  const v = await as(fixed, TD,
    `select public.approve_registration_with_fargo(${REG_OTHER}, 555)`,
    `select fargo, fargo_status from public.profiles where id_auto = 4`,
  );
  assert.ok(v[0].ok, `approve_registration_with_fargo: ${JSON.stringify(v[0])}`);
  assert.equal(Number(v[1].rows![0].fargo), 555);
  assert.equal(v[1].rows![0].fargo_status, "verified");
});

test("AFTER: admin flows — hide via the app path, award winnings, read all profiles", async () => {
  const r = await as(fixed, SA,
    `update public.tournaments set is_hidden = true, updated_at = now() where id = ${T_OPEN}`,
    `update public.profiles set total_winnings = coalesce(total_winnings, 0) + 25 where id_auto = 3`,
    `select email from public.profiles`,
    `insert into public.tournament_players (tournament_id, player_id, status, paid_entry) values (${T_CLOSED}, 3, 'checked_in', true)`,
  );
  assert.deepEqual(r.map((x) => x.ok), [true, true, true, true], JSON.stringify(r));
  assert.equal(r[0].n, 1); assert.equal(r[1].n, 1); assert.ok((r[2].n ?? 0) >= 4, "admin reads every profile");
});

test("AFTER: hide RPC authorizes on auth.uid(), never on the supplied admin id", async () => {
  // server-side call (definer path, e.g. service role): caller identity decides
  const call = async (uid: string, admin: string) => {
    await fixed.exec("begin");
    try {
      await fixed.exec(`select set_config('test.uid', '${uid}', true)`);
      await fixed.query(`select public.hide_tournament_and_resolve_report(${T_OPEN}, null, '${admin}')`);
      return (await q(fixed, `select is_hidden from public.tournaments where id = ${T_OPEN}`))[0].is_hidden;
    } catch (e: any) {
      return e.code;
    } finally {
      await fixed.exec("rollback");
    }
  };
  assert.equal(await call(BASIC, SA), "42501", "basic user passing an admin id is refused");
  assert.equal(await call(SA, BASIC), "42501", "admin id must be the caller");
  assert.equal(await call(SA, SA), true, "a signed-in admin can still use it");
  const acl = await q(fixed, `select has_function_privilege('anon', 'public.hide_tournament_and_resolve_report(bigint,uuid,uuid)', 'execute') a,
    has_function_privilege('authenticated', 'public.hide_tournament_and_resolve_report(bigint,uuid,uuid)', 'execute') u,
    has_function_privilege('service_role', 'public.hide_tournament_and_resolve_report(bigint,uuid,uuid)', 'execute') s`);
  assert.deepEqual(acl[0], { a: false, u: false, s: true });
});
