// supabase/tests/security_cleanup.test.ts
// Real-policy tests for supabase/migrations/20261021140000_security_cleanup.sql (2026-10-03):
// admin push-token / sign-in helpers, notification forgery, report → admin alert (server-side),
// phone-verified profile INSERT.
// PGlite replays the FULL prod public schema (fixtures/prod_public_schema_20260930.json) + the
// CURRENT prod policies / function bodies / triggers of the affected tables, captured read-only on
// 2026-10-03 (fixtures/security_cleanup_prod_20261003.json), with Supabase's default grants.
// Probes run as the real PostgREST roles (SET LOCAL ROLE anon | authenticated | service_role,
// auth.uid() from a GUC) inside rolled-back transactions. pg_net is stubbed (records calls).
//   base   = prod as captured → the exploits WORK
//   fixed  = + migration      → refused; legitimate flows still work
//   undone = + rollback       → previous behavior back
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/security_cleanup.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const MIGRATION = read("supabase/migrations/20261021140000_security_cleanup.sql");
const ROLLBACK = read("supabase/rollback/20261021140000_security_cleanup_rollback.sql");
const SCHEMA = JSON.parse(read("supabase/tests/fixtures/prod_public_schema_20260930.json"));
const PROD = JSON.parse(read("supabase/tests/fixtures/security_cleanup_prod_20261003.json"));

type DB = any;
const PRELUDE = `
  create role authenticated; create role anon; create role service_role bypassrls; -- as in Supabase
  create schema auth; create schema extensions; create schema net;
  create function extensions.uuid_generate_v4() returns uuid language sql volatile as $x$ select gen_random_uuid() $x$;
  create function public.uuid_generate_v4() returns uuid language sql volatile as $x$ select gen_random_uuid() $x$;
  create function extensions.gen_random_bytes(int) returns bytea language sql volatile as $x$ select decode(md5(random()::text), 'hex') $x$;
  create function extensions.digest(text, text) returns bytea language sql immutable as $x$ select sha256(convert_to($1, 'UTF8')) $x$;
  set search_path = public, extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create table net.calls (id serial primary key, url text, body jsonb);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
  language sql security definer as $$ insert into net.calls (url, body) values (url, body) returning id::bigint $$;
  set check_function_bodies = off;
`;
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
const NOPROF = "00000000-0000-0000-0000-00000000a009";

async function buildDb(): Promise<DB> {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  const db = new mod.PGlite();
  await db.exec(PRELUDE);
  for (const k of ["auth", "seqs", "tables", "fns", "pk_uq_ck", "uidx", "fk", "trg"]) {
    for (const s of SCHEMA[k] ?? []) await db.exec(s);
  }
  for (const f of PROD.fns) await db.exec(f);
  for (const t of PROD.triggers) {
    const name = /CREATE TRIGGER (\S+) .* ON (\S+) /.exec(t)!;
    await db.exec(`drop trigger if exists ${name[1]} on ${name[2]}; ${t};`);
  }
  for (const t of PROD.rls) await db.exec(`alter table public.${t} enable row level security`);
  for (const t of PROD.rls) for (const p of (await q(db, `select polname from pg_policy where polrelid = 'public.${t}'::regclass`))) await db.exec(`drop policy "${p.polname}" on public.${t}`);
  for (const p of PROD.policies) await db.exec(p);
  await db.exec(SUPABASE_GRANTS);
  await seed(db);
  return db;
}
const q = async (db: DB, sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

async function seed(db: DB) {
  await q(db, `select setval(pg_get_serial_sequence('public.profiles', 'id_auto'), 1000)`);
  const users: [string, number, string][] = [[SA, 1, "super_admin"], [TD, 2, "tournament_director"], [BASIC, 3, "basic_user"], [OTHER, 4, "basic_user"]];
  for (const [id, n, role] of users) {
    await q(db, `insert into auth.users (id, email, last_sign_in_at) values ($1, $2, now() - interval '1 day')`, [id, `u${n}@x.test`]);
    await q(db, `insert into public.profiles (id, id_auto, email, name, user_name, role, status, home_state) overriding system value values ($1, $2, $3, $4, $5, $6, 'active', 'AZ')`,
      [id, n, `u${n}@x.test`, `User ${n}`, `user${n}`, role]);
  }
  await q(db, `insert into auth.users (id, email) values ($1, 'new@x.test')`, [NOPROF]);
  await q(db, `insert into public.push_tokens (user_id, token, is_active) values ($1, 'ExponentPushToken[admin]', true), ($2, 'ExponentPushToken[basic]', true)`, [SA, BASIC]);
}

type Res = { ok: boolean; n?: number; rows?: any[]; code?: string; msg?: string };
const ROLE: Record<string, string> = { anon: "anon", service: "service_role" };
async function as(db: DB, who: string | null, ...stmts: string[]): Promise<Res[]> {
  const out: Res[] = [];
  await db.exec("begin");
  try {
    if (who === null) await db.exec(`set local role anon; select set_config('test.uid', '', true);`);
    else if (who === "service") await db.exec(`set local role service_role; select set_config('test.uid', '', true);`);
    else await db.exec(`set local role authenticated; select set_config('test.uid', '${who}', true);`);
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
void ROLE;
const one = async (db: DB, who: string | null, s: string) => (await as(db, who, s))[0];
const denied = (r: Res, label: string) => assert.ok(!r.ok && (r.code === "42501" || r.code === "P0001"), `${label}: expected refusal, got ${JSON.stringify(r)}`);
const ok = (r: Res, label: string) => assert.ok(r.ok, `${label}: ${JSON.stringify(r)}`);

let base: DB, fixed: DB, undone: DB;
before(async () => {
  [base, fixed, undone] = await Promise.all([buildDb(), buildDb(), buildDb()]);
  await fixed.exec(MIGRATION);
  await undone.exec(MIGRATION);
  await undone.exec(ROLLBACK);
});

const EXPLOITS: [string, string | null, string][] = [
  ["A1 anon admin push tokens", null, `select * from public.get_admin_push_tokens()`],
  ["A2 basic admin push tokens", BASIC, `select * from public.get_admin_push_tokens()`],
  ["A4 anon last sign-in", null, `select public.get_user_last_sign_in('${SA}') t`],
  ["A4b basic last sign-in", BASIC, `select public.get_user_last_sign_in('${SA}') t`],
  ["B1 basic forges a notification for another user", BASIC,
    `insert into public.notifications (user_id, title, body, category, data) values (4, 'Security alert', 'Verify', 'admin_alert', '{"deep_link":"https://evil.example"}')`],
  ["B2 basic inserts a notification for self", BASIC,
    `insert into public.notifications (user_id, title, body, category, data) values (3, 'x', 'x', 'tournament_update', '{}')`],
  ["C1 signup insert with a verified phone", NOPROF,
    `insert into public.profiles (id, email, name, user_name, home_state, phone_number, phone_verified_at) values ('${NOPROF}', 'new@x.test', 'New', 'newuser', 'AZ', '+15555550123', now()) returning id`],
  ["C2 signup insert with only a verified timestamp", NOPROF,
    `insert into public.profiles (id, email, name, user_name, home_state, phone_verified_at) values ('${NOPROF}', 'new@x.test', 'New', 'newuser', 'AZ', now()) returning id`],
];

test("BEFORE: every exploit works on prod as captured", async () => {
  for (const [label, who, sql] of EXPLOITS) {
    const r = await one(base, who, sql);
    assert.ok(r.ok && (r.n ?? 0) >= 1, `${label} should succeed before the fix: ${JSON.stringify(r)}`);
  }
});

test("AFTER: every exploit is refused (A1, A2, A4, B1, B2, C1, C2)", async () => {
  for (const [label, who, sql] of EXPLOITS) denied(await one(fixed, who, sql), label);
});

test("ROLLBACK: the previous behavior is back exactly", async () => {
  for (const [label, who, sql] of EXPLOITS) {
    const r = await one(undone, who, sql);
    assert.ok(r.ok && (r.n ?? 0) >= 1, `${label} should succeed after rollback: ${JSON.stringify(r)}`);
  }
  const acl = await q(undone, `select has_function_privilege('anon', 'public.get_admin_push_tokens()', 'execute') a`);
  assert.equal(acl[0].a, true);
  const trg = await q(undone, `select tgname from pg_trigger where tgname in ('notifications_guard', 'reports_notify_admins')`);
  assert.equal(trg.length, 0);
  const ph = await q(undone, `select pg_get_triggerdef(oid) d from pg_trigger where tgname = 'profiles_guard_phone'`);
  assert.match(ph[0].d, /BEFORE UPDATE ON public\.profiles/);
});

test("A3: the server path keeps the admin helpers; admins keep last sign-in", async () => {
  const r = await one(fixed, "service", `select * from public.get_admin_push_tokens()`);
  ok(r, "service role admin tokens");
  assert.equal(r.n, 1);
  ok(await one(fixed, "service", `select * from public.get_admin_id_autos()`), "service role admin ids");
  const s = await one(fixed, SA, `select public.get_user_last_sign_in('${BASIC}') t`);
  ok(s, "admin last sign-in");
  assert.ok(s.rows![0].t != null);
  denied(await one(fixed, TD, `select public.get_user_last_sign_in('${BASIC}') t`), "TD last sign-in");
});

test("B3/B4/B5/B6: own notifications readable + markable; nothing else editable", async () => {
  await q(fixed, `insert into public.notifications (id, user_id, title, body, category, data) values
    (9001, 3, 'Real', 'Real', 'tournament_update', '{"deep_link":"/tournament-detail?id=1"}'),
    (9002, 4, 'Other', 'Other', 'tournament_update', '{}')`);
  const r = await as(fixed, BASIC,
    `select * from public.notifications where user_id = 3`,
    `update public.notifications set read_at = now() where id = 9001`,
    `update public.notifications set read_at = now() where user_id = 3 and read_at is null`,
  );
  assert.deepEqual(r.map((x) => x.ok), [true, true, true], JSON.stringify(r));
  assert.equal(r[0].n, 1, "B3 reads own");
  assert.equal(r[1].n, 1, "B4 marks own read");
  assert.equal((await one(fixed, BASIC, `update public.notifications set read_at = now() where id = 9002`)).n, 0, "B5 other user's row invisible");
  for (const [label, set] of [
    ["recipient", "user_id = 4"], ["title", "title = 'Fake'"], ["body", "body = 'Fake'"],
    ["link", `data = '{"deep_link":"https://evil.example"}'`], ["category", "category = 'admin_alert'"], ["status", "status = 'x'"],
  ] as const) denied(await one(fixed, BASIC, `update public.notifications set ${set} where id = 9001`), `B6 change ${label}`);
  denied(await one(fixed, null, `insert into public.notifications (user_id, title, body, category) values (3, 'x', 'x', 'tournament_update')`), "anon insert");
  await q(fixed, `delete from public.notifications where id in (9001, 9002)`);
});

test("B7: legitimate creators — staff app flows with internal links, server roles, unchanged", async () => {
  const r = await as(fixed, TD,
    `insert into public.notifications (user_id, title, body, category, data, status, sent_at) values
      (3, 'Tournament Updated', 'x', 'tournament_update', '{"tournament_id":1,"deep_link":"/tournament-detail?id=1"}', 'sent', now()),
      (3, 'Tournament Cancelled', 'x', 'tournament_update', '{"tournament_id":1,"deep_link":"competerf:///tournament-detail?id=1"}', 'sent', now()),
      (3, 'New match', 'x', 'search_alert_match', '{"deep_link":"/tournament-detail?id=1","type":"search_alert_match"}', 'sent', now()),
      (3, 'Promo', 'x', 'venue_promotion', '{}', 'sent', now())`);
  ok(r[0], "TD legit inserts");
  ok((await as(fixed, SA, `insert into public.notifications (user_id, title, body, category, data) values
      (3, 'New Giveaway!', 'x', 'giveaway_update', '{"giveaway_id":1,"deep_link":"/(tabs)/shop","type":"new_giveaway"}'),
      (3, 'News', 'x', 'app_announcement', '{"deep_link":"/notifications"}')`))[0], "admin legit inserts");
  ok(await one(fixed, "service", `insert into public.notifications (user_id, title, body, category, data) values (3, 'Table assigned', 'x', 'tournament_update', '{"deep_link":"/(tabs)/profile"}')`), "server creator");
  ok(await one(fixed, "service", `insert into public.notifications (user_id, title, body, category) values (3, 'Ops', 'x', 'admin_alert')`), "server admin_alert");
  // staff can't forge admin alerts or external / host-relative links
  for (const [label, cat, link] of [
    ["admin_alert from a TD", "admin_alert", "/admin/report-management"],
    ["giveaway_update from a TD", "giveaway_update", "/(tabs)/shop"],
    ["https link", "tournament_update", "https://evil.example"],
    ["host-relative //", "tournament_update", "//evil.example/x"],
    ["javascript:", "tournament_update", "javascript:alert(1)"],
    ["no category", null, "/notifications"],
  ] as const) {
    const sql = `insert into public.notifications (user_id, title, body, category, data) values (3, 'x', 'x', ${cat ? `'${cat}'` : "null"}, '${JSON.stringify({ deep_link: link })}')`;
    denied(await one(fixed, TD, sql), `TD: ${label}`);
  }
  denied(await one(fixed, SA, `insert into public.notifications (user_id, title, body, category, data) values (3, 'x', 'x', 'admin_alert', '{}')`), "admin_alert is server-only even for admins");
});

test("report → admin alert happens on the server: admin rows + ONE queued Expo push; never blocks the report", async () => {
  const r = await as(fixed, BASIC,
    `insert into public.reports (reporter_id, content_type, content_id, reason) values ('${BASIC}', 'tournament', '7', 'spam') returning id`,
  );
  ok(r[0], "report filed");
  // inspect inside a transaction we keep open long enough to read the side effects
  await fixed.exec("begin");
  try {
    await fixed.exec(`set local role authenticated; select set_config('test.uid', '${BASIC}', true);`);
    await fixed.query(`insert into public.reports (reporter_id, content_type, content_id, reason) values ('${BASIC}', 'tournament', '8', 'inappropriate')`);
    await fixed.exec(`reset role;`);
    const rows = await q(fixed, `select user_id, title, body, category, data from public.notifications where category = 'admin_alert'`);
    assert.equal(rows.length, 1, "one row per active admin (1)");
    assert.equal(rows[0].user_id, 1);
    assert.equal(rows[0].title, "🚩 New Report Submitted");
    assert.equal(rows[0].body, "A tournament has been reported for: inappropriate");
    assert.equal(rows[0].data.deep_link, "/admin/report-management");
    const calls = await q(fixed, `select url, body from net.calls`);
    assert.equal(calls.length, 1, "one push request");
    assert.equal(calls[0].url, "https://exp.host/--/api/v2/push/send");
    assert.deepEqual(calls[0].body.map((m: any) => m.to), ["ExponentPushToken[admin]"], "only the active admin token — never the reporter's");
  } finally {
    await fixed.exec("rollback");
  }
  // a failing alert never blocks the report
  await fixed.exec("begin");
  try {
    await fixed.exec(`alter function net.http_post(text, jsonb, jsonb, jsonb, int) rename to http_post_off`);
    await fixed.exec(`set local role authenticated; select set_config('test.uid', '${BASIC}', true);`);
    const ins = await fixed.query(`insert into public.reports (reporter_id, content_type, content_id, reason) values ('${BASIC}', 'tournament', '9', 'spam') returning id`);
    assert.equal(ins.rows.length, 1, "report still filed");
  } finally {
    await fixed.exec("rollback");
  }
});

test("C3/C4: normal sign-up still works (every build's payload); the trusted verify path still works", async () => {
  ok(await one(fixed, NOPROF, `insert into public.profiles (id, email, name, first_name, last_name, user_name, home_state, preferred_game, favorite_player, status)
      values ('${NOPROF}', 'new@x.test', 'New User', 'New', 'User', 'newuser', 'AZ', '9-ball', 'Efren', 'active')`), "C3 sign-up");
  // trusted path: definer RPCs run as their owner → the guard lets them through
  await fixed.exec("begin");
  try {
    await fixed.exec(`update public.profiles set phone_number = '+15555550123', phone_verified_at = now() where id = '${BASIC}'`); // as owner
    const r = await q(fixed, `select phone_verified_at from public.profiles where id = '${BASIC}'`);
    assert.ok(r[0].phone_verified_at != null, "C4 server-side verification writes");
  } finally {
    await fixed.exec("rollback");
  }
  denied(await one(fixed, BASIC, `update public.profiles set phone_verified_at = now() where id = '${BASIC}'`), "update guard unchanged");
});
