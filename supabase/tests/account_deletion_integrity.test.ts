// supabase/tests/account_deletion_integrity.test.ts
// Account-deletion integrity (post #47 incident):
//   supabase/pending/20261014120000_account_deletion_integrity.sql   (or migrations/, once approved)
// PGlite, replaying the FULL prod public schema captured read-only on 2026-09-30 (every table,
// constraint, FK action, function and trigger — fixtures/prod_public_schema_20260930.json).
// The same disposable scenario is seeded into two databases:
//   base  = prod exactly as it is today (current delete_user_account + current FK actions)
//   fixed = prod + the migration
// and account deletion is exercised as the real PostgREST role (SET LOCAL ROLE authenticated,
// auth.uid() stubbed from a GUC).
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/account_deletion_integrity.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const MIG_FILE = "20261014120000_account_deletion_integrity.sql";
const MIGRATION = readFileSync(
  join(ROOT, existsSync(join(ROOT, "supabase/migrations", MIG_FILE)) ? "supabase/migrations" : "supabase/pending", MIG_FILE),
  "utf8",
);
const ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20261014120000_account_deletion_integrity_rollback.sql"), "utf8");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "supabase/tests/fixtures/prod_public_schema_20260930.json"), "utf8"));
const TRANSFER_MSG = "This account must be transferred or removed by another administrator.";

// Personal/private tables the fixed deletion may shrink (and only by the deleted user's rows).
const PERSONAL_TABLES = new Set([
  "alert_matches", "search_alerts", "saved_searches", "favorites", "notifications", "message_recipients",
  "notification_message_recipients", "notification_preferences", "push_tokens", "message_rate_limits",
  "tournament_templates_user", "tournament_settings_templates", "featured_players", "user_blocks",
  "sms_verification_attempts", "tournament_review_reads", "tournament_review_archives", "image_scan_logs",
  "player_invitations",
]);

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
// Auth-internal rows that must disappear with the auth user (credentials / sign-in methods).
const AUTH_EXTRAS = `
  create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
`;

async function prodDb(): Promise<DB> {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  const db = new mod.PGlite();
  await db.exec(PRELUDE);
  for (const k of ["auth", "seqs", "tables", "fns", "pk_uq_ck", "uidx", "fk", "trg"]) {
    for (const s of SCHEMA[k] ?? []) await db.exec(s);
  }
  await db.exec(AUTH_EXTRAS);
  return db;
}

const q = async (db: DB, sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

// ── generic seeding: fills NOT NULL columns without defaults with type-appropriate dummies ──
const colCache = new Map<string, any[]>();
async function columns(db: DB, schema: string, table: string) {
  const key = schema + "." + table;
  if (!colCache.has(key)) {
    colCache.set(key, await q(db, `select column_name c, udt_name t, is_nullable = 'YES' nul, column_default d,
        is_generated = 'ALWAYS' gen, identity_generation idg
      from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`, [schema, table]));
  }
  return colCache.get(key)!;
}
// First allowed value of each `col = ANY (ARRAY['a', ...])` CHECK, so dummies satisfy enum-like checks.
const checkCache = new Map<string, Record<string, string>>();
async function checkValues(db: DB, schema: string, table: string) {
  const key = schema + "." + table;
  if (!checkCache.has(key)) {
    const out: Record<string, string> = {};
    const defs = await q(db, `select pg_get_constraintdef(c.oid) d from pg_constraint c join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace where c.contype = 'c' and n.nspname = $1 and t.relname = $2`, [schema, table]);
    for (const { d } of defs) {
      const m = /\(\(?"?([a-z_0-9]+)"?\)?(?:::text)? = ANY \(\(?ARRAY\['([^']+)'/.exec(d);
      if (m && !(m[1] in out)) out[m[1]] = m[2];
    }
    checkCache.set(key, out);
  }
  return checkCache.get(key)!;
}
const DUMMY: Record<string, string> = {
  text: "'x'", varchar: "'x'", int2: "1", int4: "1", int8: "1", numeric: "0", float8: "0", bool: "false",
  date: "date '2026-01-01'", timestamptz: "now()", timestamp: "now()", time: "time '12:00'", jsonb: "'{}'::jsonb",
  uuid: "gen_random_uuid()", _text: "'{}'::text[]", tsvector: "''::tsvector",
};
async function ins(db: DB, fq: string, row: Record<string, unknown>) {
  const [schema, table] = fq.includes(".") ? fq.split(".") : ["public", fq];
  const cols = await columns(db, schema, table);
  const names: string[] = [], vals: string[] = [], params: unknown[] = [];
  let overriding = false;
  for (const c of cols) {
    if (c.gen) continue;
    if (c.c in row) {
      names.push(`"${c.c}"`);
      params.push(row[c.c]);
      vals.push(`$${params.length}`);
      if (c.idg === "ALWAYS") overriding = true;
    } else if (!c.nul && c.d == null && !c.idg) {
      if (!(c.t in DUMMY)) throw new Error(`no dummy for ${fq}.${c.c} (${c.t})`);
      names.push(`"${c.c}"`);
      const allowed = (await checkValues(db, schema, table))[c.c];
      vals.push(allowed ? `'${allowed}'` : DUMMY[c.t]);
    }
  }
  const sql = `insert into ${schema}.${table} (${names.join(",")}) ${overriding ? "overriding system value " : ""}values (${vals.join(",")}) returning *`;
  try {
    return (await q(db, sql, params))[0];
  } catch (e: any) {
    throw new Error(`seed ${fq}: ${e.message}`);
  }
}

// ── the disposable scenario ──────────────────────────────────────────────────────────────────
const U = {
  sa: ["00000000-0000-0000-0000-00000000a001", 1, "super_admin"],
  ca: ["00000000-0000-0000-0000-00000000a003", 3, "compete_admin"],
  A: ["00000000-0000-0000-0000-00000000a101", 101, "basic_user"],   // the "#47" account
  B: ["00000000-0000-0000-0000-00000000a102", 102, "basic_user"],
  C: ["00000000-0000-0000-0000-00000000a103", 103, "basic_user"],
  W: ["00000000-0000-0000-0000-00000000a104", 104, "basic_user"],   // plain participant
  D: ["00000000-0000-0000-0000-00000000a201", 201, "tournament_director"], // directs an upcoming tournament
  F: ["00000000-0000-0000-0000-00000000a202", 202, "tournament_director"], // directs an active series
  E: ["00000000-0000-0000-0000-00000000a203", 203, "bar_owner"],           // active venue owner
  P: ["00000000-0000-0000-0000-00000000a204", 204, "tournament_director"], // directed only past events
} as const;
type Who = keyof typeof U;
const uid = (w: Who) => U[w][0] as string;
const ida = (w: Who) => U[w][1] as number;
const IDS = { V1: 1, V2: 2, V3: 3, Told: 10, Tfuture: 11, Tpast: 12, TT: 20, G1: 31, G2: 32, G3: 33, G4: 34, G5: 35, G6: 36 };

async function seed(db: DB) {
  for (const w of Object.keys(U) as Who[]) {
    await ins(db, "auth.users", { id: uid(w), email: `${w}@x.test` });
    await ins(db, "auth.identities", { user_id: uid(w), provider: "email" });
    await ins(db, "auth.sessions", { user_id: uid(w) });
    await ins(db, "profiles", { id: uid(w), id_auto: ida(w), email: `${w}@x.test`, name: `Name ${w}`,
      user_name: `user_${w}`, home_state: "CA", role: U[w][2], first_name: w, last_name: "Surname",
      phone_number: "+15550000000", avatar_url: `https://img/${w}.png`, home_city: "City", zip_code: "90000" });
  }
  const I = IDS;
  for (const v of [I.V1, I.V2, I.V3]) await ins(db, "venues", { id: v, venue: `Venue ${v}`, status: "active" });
  const t = (id: number, director: Who, status: string, date: string, live: string) =>
    ins(db, "tournaments", { id, venue_id: I.V1, director_id: ida(director), name: `T${id}`, game_type: "8-ball",
      tournament_format: "single-elimination", status, tournament_date: date, live_state: live });
  await t(I.Told, "A", "completed", "2026-01-10", "finished");
  await t(I.Tfuture, "D", "active", "2099-01-01", "not_started");
  await t(I.Tpast, "P", "active", "2026-01-12", "finished");
  await ins(db, "tournament_templates", { id: I.TT, venue_id: I.V1, director_id: ida("F"), name: "Weekly", status: "active",
    game_type: "8-ball", tournament_format: "single-elimination" });
  await ins(db, "venue_owners", { venue_id: I.V3, owner_id: ida("E"), assigned_by: ida("sa") });
  await ins(db, "venue_owners", { venue_id: I.V2, owner_id: ida("A"), assigned_by: ida("sa"), archived_at: "2026-02-01", archived_by: ida("sa") });
  await ins(db, "venue_directors", { venue_id: I.V1, director_id: ida("A"), assigned_by: ida("sa") });

  // Giveaways — the #47 pattern: A created them and ran the draws; B/C/W took part; A also won one.
  const g = (id: number, status: string, by: Who, winner: Who | null, drawnBy: Who | null) =>
    ins(db, "giveaways", { id, name: `G${id}`, status, entry_mode: "legacy_single", created_by: ida(by),
      winner_id: winner ? ida(winner) : null, winner_drawn_by: drawnBy ? ida(drawnBy) : null,
      published_at: "2026-03-01", end_type: "date" });
  await g(I.G1, "archived", "A", "B", "A");
  await g(I.G2, "active", "A", null, null);
  await g(I.G3, "archived", "sa", "A", "sa");
  await g(I.G4, "archived", "sa", "W", "sa");
  await g(I.G5, "archived", "sa", null, null);   // archived but never drawn (can be restored + drawn)
  await g(I.G6, "active", "sa", null, null);     // open; A's entry there was already disqualified once
  const e = (id: number, gid: number, who: Who) => ins(db, "giveaway_entries", { id, giveaway_id: gid, user_id: ida(who),
    name_as_on_id: `Legal ${who}`, birthday: "1990-05-05", email: `${who}@x.test`, phone: "5550000", agreed_to_rules: true,
    agreed_to_privacy: true, confirmed_age: true, quantity: 1, opted_in_promotions: true });
  await e(111, I.G1, "B"); await e(112, I.G1, "C");
  await e(121, I.G2, "B"); await e(122, I.G2, "C"); await e(123, I.G2, "A"); await e(124, I.G2, "W");
  await e(131, I.G3, "A"); await e(132, I.G3, "B");
  await e(141, I.G4, "W"); await e(142, I.G4, "C");
  await e(113, I.G1, "A");                                    // A, non-winning, CONCLUDED giveaway
  await e(151, I.G5, "A"); await e(152, I.G5, "B");           // archived-undrawn
  await e(161, I.G6, "A"); await e(162, I.G6, "B");           // open; A's entry referenced by history
  const wh = (id: number, gid: number, who: Who, entry: number, status: string, by: Who, dq: Who | null) =>
    ins(db, "giveaway_winner_history", { id, giveaway_id: gid, user_id: ida(who), entry_id: entry, status,
      drawn_at: "2026-03-05", drawn_by: ida(by), disqualified_by: dq ? ida(dq) : null, disqualified_at: dq ? "2026-03-05" : null });
  await wh(201, I.G1, "C", 112, "disqualified", "A", "A");
  await wh(202, I.G1, "B", 111, "winner", "A", null);
  await wh(203, I.G3, "A", 131, "winner", "sa", null);
  await wh(204, I.G4, "W", 141, "winner", "sa", null);
  await wh(205, I.G6, "A", 161, "disqualified", "sa", "sa");
  await ins(db, "giveaway_wallets", { profile_id: ida("A"), balance: 2 });
  await ins(db, "giveaway_credit_ledger", { profile_id: ida("A"), delta: 2, balance_after: 2, reason: "admin_grant", created_by: ida("sa") });

  // Tournament participation + a team (A captain, B partner).
  await ins(db, "tournament_players", { tournament_id: I.Told, player_id: ida("A") });
  await ins(db, "tournament_players", { tournament_id: I.Told, player_id: ida("B") });
  const team = await ins(db, "tournament_teams", { tournament_id: I.Told, captain_id: ida("A"), name: "Team A" });
  await ins(db, "tournament_team_members", { team_id: team.id, tournament_id: I.Told, player_id: ida("B") });

  // Conversations (A and W each start one with B; B replies), notification + TD messages.
  for (const [cid, who] of [["00000000-0000-0000-0000-0000000c0001", "A"], ["00000000-0000-0000-0000-0000000c0002", "W"]] as const) {
    await ins(db, "conversations", { id: cid, created_by: uid(who) });
    await ins(db, "conversation_participants", { conversation_id: cid, user_id: uid(who) });
    await ins(db, "conversation_participants", { conversation_id: cid, user_id: uid("B") });
    await ins(db, "conversation_messages", { conversation_id: cid, sender_id: uid(who), body: "hi" });
    await ins(db, "conversation_messages", { conversation_id: cid, sender_id: uid("B"), body: "reply from B" });
  }
  const nm = await ins(db, "notification_messages", { sender_id: uid("A"), sender_role: "tournament_director", subject: "s", body: "b" });
  await ins(db, "notification_message_recipients", { message_id: nm.id, user_id: uid("B") });
  const nm2 = await ins(db, "notification_messages", { sender_id: uid("sa"), sender_role: "super_admin", subject: "s", body: "b" });
  await ins(db, "notification_message_recipients", { message_id: nm2.id, user_id: uid("A") });
  const m1 = await ins(db, "messages", { sender_id: ida("A"), sender_role: "tournament_director", subject: "s", body: "b", message_type: "general" });
  await ins(db, "message_recipients", { message_id: m1.id, user_id: ida("B") });
  const m2 = await ins(db, "messages", { sender_id: ida("sa"), sender_role: "super_admin", subject: "s", body: "b", message_type: "general" });
  await ins(db, "message_recipients", { message_id: m2.id, user_id: ida("A") });
  for (const w of ["A", "B"] as Who[]) await ins(db, "notifications", { user_id: ida(w), title: "t", body: "m" });

  // Reviews (auth.users-linked), reports, referrals, consent, support, audit.
  const rA = await ins(db, "tournament_reviews", { tournament_id: I.Told, reviewer_id: uid("A"), rating: 5, comment: "great" });
  const rW = await ins(db, "tournament_reviews", { tournament_id: I.Told, reviewer_id: uid("W"), rating: 4, comment: "ok" });
  const rB = await ins(db, "tournament_reviews", { tournament_id: I.Told, reviewer_id: uid("B"), rating: 3 });
  await ins(db, "tournament_review_reads", { review_id: rB.id, viewer_id: uid("A") });
  await ins(db, "tournament_review_reads", { review_id: rA.id, viewer_id: uid("B") });
  void rW;
  await ins(db, "reports", { reporter_id: uid("A"), reported_user_id: uid("B"), content_type: "user", content_id: "1", reason: "spam" });
  await ins(db, "reports", { reporter_id: uid("W"), reported_user_id: uid("B"), content_type: "user", content_id: "2", reason: "spam" });
  await ins(db, "reports", { reporter_id: uid("B"), reported_user_id: uid("A"), content_type: "user", content_id: "3", reason: "spam" });
  const codeOf = async (w: Who) => (await q(db, "select id from referral_codes where profile_id = $1 and disabled_at is null", [ida(w)]))[0]?.id
    ?? (await ins(db, "referral_codes", { profile_id: ida(w), code: `CODE${ida(w)}` })).id;
  await ins(db, "referrals", { referred_profile_id: ida("C"), referrer_profile_id: ida("A"), referral_code_id: await codeOf("A"), source: "link" });
  await ins(db, "referrals", { referred_profile_id: ida("A"), referrer_profile_id: ida("B"), referral_code_id: await codeOf("B"), source: "link" });
  await ins(db, "referrals", { referred_profile_id: ida("W"), referrer_profile_id: ida("B"), referral_code_id: await codeOf("B"), source: "link" });
  await ins(db, "sms_consent_events", { user_id: uid("A"), phone_number: "+15550000000", action: "opted_in" });
  await ins(db, "sms_verification_attempts", { user_id: uid("A") });
  await ins(db, "support_tickets", { user_id: ida("A"), subject: "s", description: "d", assigned_to: ida("sa") });
  await ins(db, "audit_log", { user_id: ida("A"), action: "x", entity_type: "x" });

  // A's purely personal data.
  await ins(db, "favorites", { user_id: ida("A"), tournament_id: I.Told });
  const sa = await ins(db, "search_alerts", { user_id: ida("A") });
  await ins(db, "alert_matches", { alert_id: sa.id, tournament_id: I.Told });
  await ins(db, "saved_searches", { user_id: ida("A") });
  await ins(db, "push_tokens", { user_id: uid("A"), token: "tokA", is_active: false });
  await ins(db, "user_blocks", { blocker_id: uid("A"), blocked_id: uid("C") });
  await ins(db, "featured_players", { user_id: ida("A"), name: "A" });
  await ins(db, "tournament_templates_user", { user_id: ida("A") });
  await ins(db, "tournament_settings_templates", { user_id: ida("A") });
  await ins(db, "message_rate_limits", { sender_id: uid("A") });
  await ins(db, "image_scan_logs", { user_id: uid("A") });
  await ins(db, "app_events", { user_id: uid("A"), event_type: "x" });

  // Chip history with A and B (entries, completed matches, results, payouts).
  const pl = async (w: Who) => (await one(db, "select id from players where profile_id = $1", [uid(w)])).id;
  await ins(db, "chip_entries", { id: "ce-A", tournament_id: I.Told, p1_profile_id: ida("A"), p1_player_id: await pl("A"), p1_phone: "+15550000000" });
  await ins(db, "chip_entries", { id: "ce-BA", tournament_id: I.Told, p1_profile_id: ida("B"), p1_player_id: await pl("B"), p2_profile_id: ida("A"), p2_player_id: await pl("A"), p1_phone: "+15551111111" });
  await ins(db, "chip_entries", { id: "ce-C", tournament_id: I.Told, p1_profile_id: ida("C"), p1_player_id: await pl("C") });
  await ins(db, "chip_matches", { tournament_id: I.Told, winner_id: "ce-A" });
  await ins(db, "chip_results", { tournament_id: I.Told, entry_id: "ce-A", p1_profile_id: ida("A"), p1_player_id: await pl("A") });
  await ins(db, "chip_results", { tournament_id: I.Told, entry_id: "ce-BA", p1_profile_id: ida("B"), p1_player_id: await pl("B") });
  await ins(db, "chip_payouts_paid", { tournament_id: I.Told, paid_by: ida("sa") });
  await ins(db, "reassignment_logs", { previous_user_id: ida("A"), previous_user_name: "Name A", new_user_id: ida("B"), new_user_name: "Name B", reassigned_by: ida("sa"), reassigned_by_name: "Admin" });
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────
type Res = { ok: true; rows: any[] } | { ok: false; error: string; detail?: string };
async function as(db: DB, who: Who | "anon" | "nobody", sql: string, commit = true): Promise<Res> {
  await q(db, "begin");
  try {
    if (who === "anon") {
      await q(db, "select set_config('test.uid', '', true)");
      await q(db, "set local role anon");
    } else {
      await q(db, "select set_config('test.uid', $1, true)", [who === "nobody" ? "" : uid(who)]);
      await q(db, "set local role authenticated");
    }
    const rows = await q(db, sql);
    await q(db, commit ? "commit" : "rollback");
    return { ok: true, rows };
  } catch (e: any) {
    await q(db, "rollback");
    return { ok: false, error: String(e?.message ?? e), detail: e?.detail };
  }
}
const del = (db: DB, who: Who | "anon" | "nobody") => as(db, who, "select public.delete_user_account()");

async function tableCounts(db: DB): Promise<Record<string, number>> {
  const tabs = await q(db, "select tablename from pg_tables where schemaname = 'public' order by 1");
  const out: Record<string, number> = {};
  for (const { tablename } of tabs) out[tablename] = Number((await q(db, `select count(*) n from public."${tablename}"`))[0].n);
  out["auth.users"] = Number((await q(db, "select count(*) n from auth.users"))[0].n);
  out["auth.identities"] = Number((await q(db, "select count(*) n from auth.identities"))[0].n);
  out["auth.sessions"] = Number((await q(db, "select count(*) n from auth.sessions"))[0].n);
  return out;
}
const snapshot = async (db: DB) => JSON.stringify(await q(db, `select
  (select json_agg(g order by id) from giveaways g) g, (select json_agg(e order by id) from giveaway_entries e) e,
  (select json_agg(w order by id) from giveaway_winner_history w) w, (select json_agg(t order by id) from tournaments t) t,
  (select json_agg(p order by id_auto) from profiles p) p`));
const one = async (db: DB, sql: string, p: unknown[] = []) => (await q(db, sql, p))[0];
const n = async (db: DB, sql: string, p: unknown[] = []) => Number((await q(db, sql, p))[0].n);

let base: DB, fixed: DB;
before(async () => {
  base = await prodDb();
  await seed(base);
  fixed = await prodDb();
  await fixed.exec(MIGRATION);
  await seed(fixed);
});

// ── 1. The baseline really loses shared history (documents the bug being fixed) ────────────────
test("baseline (prod today): deleting a plain participant destroys shared history", async () => {
  const before = await tableCounts(base);
  const r = await del(base, "W");
  assert.ok(r.ok, `baseline delete W: ${(r as any).error}`);
  const after = await tableCounts(base);
  // W's winning entry + winner-history row in G4 vanish -> G4 shows a winner with no record.
  assert.equal(await n(base, "select count(*) n from giveaway_winner_history where giveaway_id = $1", [IDS.G4]), 0);
  assert.equal(await n(base, "select count(*) n from giveaway_entries where giveaway_id = $1", [IDS.G4]), 1);
  // The conversation W started is deleted INCLUDING B's reply.
  assert.equal(await n(base, "select count(*) n from conversation_messages where body = 'reply from B'"), 1);
  // W's review disappears (auth.users CASCADE) and W's report on B too.
  assert.equal(after.tournament_reviews, before.tournament_reviews - 1);
  assert.equal(after.reports, before.reports - 1);
  // The referral record crediting B for W disappears.
  assert.equal(after.referrals, before.referrals - 1);
});

test("baseline (prod today): a raw auth delete of a user with a profile is blocked by the FK", async () => {
  await assert.rejects(q(base, `delete from auth.users where id = $1`, [uid("C")]));
});

// ── 2. #47 pattern on the fixed schema ───────────────────────────────────────────────────────────
test("fixed: #47 pattern — creator/drawer/winner/entrant A deleted; everything shared survives", async () => {
  const beforeCounts = await tableCounts(fixed);
  const aOwned: Record<string, number> = {};
  const own = async (t: string, where: string) => (aOwned[t] = await n(fixed, `select count(*) n from ${t} where ${where}`));
  await own("alert_matches", `alert_id in (select id from search_alerts where user_id = ${ida("A")})`);
  await own("search_alerts", `user_id = ${ida("A")}`);
  await own("saved_searches", `user_id = ${ida("A")}`);
  await own("favorites", `user_id = ${ida("A")}`);
  await own("notifications", `user_id = ${ida("A")}`);
  await own("message_recipients", `user_id = ${ida("A")}`);
  await own("notification_message_recipients", `user_id = '${uid("A")}'`);
  await own("notification_preferences", `user_id = '${uid("A")}'`);
  await own("push_tokens", `user_id = '${uid("A")}'`);
  await own("message_rate_limits", `sender_id = '${uid("A")}'`);
  await own("tournament_templates_user", `user_id = ${ida("A")}`);
  await own("tournament_settings_templates", `user_id = ${ida("A")}`);
  await own("featured_players", `user_id = ${ida("A")}`);
  await own("user_blocks", `blocker_id = '${uid("A")}' or blocked_id = '${uid("A")}'`);
  await own("sms_verification_attempts", `user_id = '${uid("A")}'`);
  await own("tournament_review_reads", `viewer_id = '${uid("A")}'`);
  await own("tournament_review_archives", `viewer_id = '${uid("A")}'`);
  await own("image_scan_logs", `user_id = '${uid("A")}'`);
  await own("player_invitations", `player_id in (select id from players where profile_id = '${uid("A")}')`);
  const g1Before = await one(fixed, "select * from giveaways where id = $1", [IDS.G1]);
  const othersEntriesBefore = JSON.stringify(await q(fixed, "select * from giveaway_entries where user_id <> $1 order by id", [ida("A")]));
  const whBefore = JSON.stringify(await q(fixed, "select * from giveaway_winner_history order by id"));

  const r = await del(fixed, "A");
  assert.ok(r.ok, `fixed delete A: ${(r as any).error}`);
  const after = await tableCounts(fixed);

  // No unrelated row count decreases; personal tables shrink by exactly A's rows.
  for (const [t, c] of Object.entries(beforeCounts)) {
    if (t === "auth.users" || t === "auth.identities" || t === "auth.sessions") {
      assert.equal(after[t], c - 1, `${t} loses exactly A's row`);
    } else if (PERSONAL_TABLES.has(t)) {
      assert.equal(after[t], c - (aOwned[t] ?? 0), `${t} shrinks only by A's personal rows`);
    } else if (t === "giveaway_entries") {
      assert.equal(after[t], c - 2, "only A's 2 entries in undrawn giveaways (123 in G2, 151 in G5) are withdrawn");
    } else {
      assert.equal(after[t], c, `${t} must keep every row (before ${c}, after ${after[t]})`);
    }
  }

  // Giveaways A created / drew: intact, attribution still points at A's (tombstoned) profile id.
  const g1 = await one(fixed, "select * from giveaways where id = $1", [IDS.G1]);
  assert.deepEqual({ ...g1, updated_at: null }, { ...g1Before, updated_at: null });
  assert.equal(g1.created_by, ida("A"));
  assert.equal(g1.winner_drawn_by, ida("A"));
  assert.equal(await n(fixed, "select count(*) n from giveaways"), 6);
  // Other users' entries and ALL winner history: byte-identical.
  assert.equal(JSON.stringify(await q(fixed, "select * from giveaway_entries where user_id <> $1 order by id", [ida("A")])), othersEntriesBefore);
  assert.equal(JSON.stringify(await q(fixed, "select * from giveaway_winner_history order by id")), whBefore);
  assert.equal(await n(fixed, "select count(*) n from giveaway_winner_history where id in (201, 202, 204)"), 3);
  assert.equal((await one(fixed, "select drawn_by, disqualified_by from giveaway_winner_history where id = 201")).drawn_by, ida("A"));
  // A's own participation is kept: the winning entry unchanged (prize record), the other redacted.
  const win = await one(fixed, "select * from giveaway_entries where id = 131");
  assert.equal(win.name_as_on_id, "Legal A");
  assert.equal((await one(fixed, "select status from giveaway_winner_history where id = 203")).status, "winner");
  // Undrawn giveaways (open G2, archived-undrawn G5): A's entries withdrawn -> can never win.
  assert.equal(await n(fixed, "select count(*) n from giveaway_entries where id in (123, 151)"), 0);
  // Kept entries (concluded G1; G6 entry referenced by history): PII NULL, never fabricated.
  for (const id of [113, 161]) {
    const kept = await one(fixed, "select * from giveaway_entries where id = $1", [id]);
    for (const c of ["name_as_on_id", "birthday", "email", "phone"]) assert.equal(kept[c], null, `entry ${id} ${c} is NULL, not fabricated`);
    assert.equal(kept.opted_in_promotions, false);
    assert.equal(kept.quantity, 1);
    assert.ok(kept.created_at);
  }

  // Conversations, B's reply, messages A sent, reports, reviews, referrals, credits: all kept.
  assert.equal(await n(fixed, "select count(*) n from conversation_messages where body = 'reply from B'"), 2);
  assert.equal(await n(fixed, "select count(*) n from tournament_reviews where reviewer_id = $1", [uid("A")]), 1);
  assert.equal(await n(fixed, "select count(*) n from giveaway_credit_ledger where profile_id = $1", [ida("A")]), 1);
  assert.equal(await n(fixed, "select count(*) n from referrals where referrer_profile_id = $1 or referred_profile_id = $1", [ida("A")]), 2);
  assert.equal(await n(fixed, "select count(*) n from referral_codes where profile_id = $1 and disabled_at is null", [ida("A")]), 0);
  // Tournament history + team stay; the team keeps its partner.
  assert.equal(await n(fixed, "select count(*) n from tournament_teams"), 1);
  assert.equal(await n(fixed, "select count(*) n from tournament_team_members"), 1);
  assert.equal((await one(fixed, "select director_id from tournaments where id = $1", [IDS.Told])).director_id, ida("A"));
  // Active director assignment ended, row kept; archived ownership history kept.
  assert.ok((await one(fixed, "select archived_at from venue_directors where director_id = $1", [ida("A")])).archived_at);
  assert.equal(await n(fixed, "select count(*) n from venue_owners where owner_id = $1", [ida("A")]), 1);
});

test("fixed: A's profile is a tombstone — no personal data, no sign-in, email/username reusable", async () => {
  const p = await one(fixed, "select * from profiles where id_auto = $1", [ida("A")]);
  assert.equal(p.name, "Deleted User");
  assert.equal(p.email, `deleted+${ida("A")}@deleted.invalid`);
  assert.equal(p.user_name, `deleted:${ida("A")}`);
  for (const c of ["first_name", "last_name", "avatar_url", "home_city", "zip_code", "phone_number", "fargo", "last_login_at"]) {
    assert.equal(p[c], null, `profiles.${c} cleared`);
  }
  assert.equal(p.status, "deleted");
  assert.equal(p.is_disabled, true);
  assert.equal(p.role, "basic_user");
  assert.ok(p.deleted_at);
  assert.equal(await n(fixed, "select count(*) n from auth.users where id = $1", [uid("A")]), 0);
  assert.equal(await n(fixed, "select count(*) n from auth.identities where user_id = $1", [uid("A")]), 0);
  const pl = await one(fixed, "select * from players where id in (select player_uuid from tournament_players where tournament_id = $1 and player_id is null)", [IDS.Told]);
  assert.equal(pl.email, null);
  assert.equal(pl.profile_id, null);
  assert.equal(pl.account_status, "DISABLED");
  // The same email and username sign up fresh.
  const fresh = "00000000-0000-0000-0000-00000000f101";
  await ins(fixed, "auth.users", { id: fresh, email: "A@x.test" });
  await ins(fixed, "profiles", { id: fresh, id_auto: 901, email: "A@x.test", name: "New A", user_name: "user_A", home_state: "CA" });
  assert.equal(await n(fixed, "select count(*) n from profiles where email = 'A@x.test' and status = 'active'"), 1);
});

test("fixed: plain participant W — history that the baseline destroyed now survives", async () => {
  const beforeCounts = await tableCounts(fixed);
  const r = await del(fixed, "W");
  assert.ok(r.ok, `fixed delete W: ${(r as any).error}`);
  const after = await tableCounts(fixed);
  assert.equal(await n(fixed, "select count(*) n from giveaway_winner_history where giveaway_id = $1", [IDS.G4]), 1);
  assert.equal(await n(fixed, "select count(*) n from giveaway_entries where giveaway_id = $1", [IDS.G4]), 2);
  assert.equal(await n(fixed, "select count(*) n from conversation_messages where body = 'reply from B'"), 2);
  assert.equal(after.giveaway_entries, beforeCounts.giveaway_entries - 1, "only W's entry in open G2 is withdrawn");
  assert.equal(await n(fixed, "select count(*) n from giveaway_entries where id = 124"), 0);
  for (const t of ["tournament_reviews", "reports", "referrals", "giveaway_winner_history",
    "conversations", "conversation_messages", "conversation_participants", "giveaways", "tournaments"]) {
    assert.equal(after[t], beforeCounts[t], `${t} unchanged`);
  }
});

// ── 3. Active ownership: structured refusal, nothing touched ─────────────────────────────────────
for (const [who, code, ids] of [["D", "active_tournaments_directed", [IDS.Tfuture]], ["F", "active_templates_directed", [IDS.TT]],
  ["E", "active_venue_ownership", [IDS.V3]]] as const) {
  test(`fixed: ${who} is refused with blocker ${code}; no data changes`, async () => {
    const before = await snapshot(fixed);
    const counts = await tableCounts(fixed);
    const r = await del(fixed, who);
    assert.ok(!r.ok, "must be refused");
    assert.ok((r as any).error.includes(TRANSFER_MSG), (r as any).error);
    const detail = JSON.parse((r as any).detail);
    assert.equal(detail.code, "owns_active_records");
    const b = detail.blockers.find((x: any) => x.code === code);
    assert.ok(b, JSON.stringify(detail));
    assert.deepEqual(b.ids, ids);
    assert.equal(await snapshot(fixed), before);
    assert.deepEqual(await tableCounts(fixed), counts);
    const pre = await as(fixed, who, "select public.get_my_account_deletion_blockers() b");
    assert.ok(pre.ok && (pre as any).rows[0].b.some((x: any) => x.code === code));
  });
}

test("fixed: past-only director P can delete; the finished tournament keeps its director", async () => {
  const r = await del(fixed, "P");
  assert.ok(r.ok, (r as any).error);
  assert.equal((await one(fixed, "select director_id from tournaments where id = $1", [IDS.Tpast])).director_id, ida("P"));
});

test("fixed: admins are refused (admin_account); anon cannot execute; no session is refused", async () => {
  for (const w of ["sa", "ca"] as Who[]) {
    const r = await del(fixed, w);
    assert.ok(!r.ok && (r as any).error.includes(TRANSFER_MSG));
    assert.equal(JSON.parse((r as any).detail).code, "admin_account");
  }
  const anon = await del(fixed, "anon");
  assert.ok(!anon.ok && /permission denied/i.test((anon as any).error), (anon as any).error);
  const nobody = await del(fixed, "nobody");
  assert.ok(!nobody.ok && /Not signed in/.test((nobody as any).error), (nobody as any).error);
  assert.equal(await n(fixed, "select count(*) n from profiles where role in ('super_admin','compete_admin') and deleted_at is null"), 2);
});

// ── 4. Raw deletes can no longer cascade into shared data ────────────────────────────────────────
test("fixed: raw deletes are blocked instead of cascading", async () => {
  // Dashboard/API deletion of an auth user whose profile is live: refused (use delete_user_account).
  await assert.rejects(q(fixed, "delete from auth.users where id = $1", [uid("B")]), /only through delete_user_account/);
  // Raw profile delete of someone with shared history: blocked by RESTRICT / NO ACTION, not cascaded.
  await assert.rejects(q(fixed, "delete from profiles where id = $1", [uid("B")]));
  // A profile must still belong to a real auth user.
  await assert.rejects(q(fixed, "insert into profiles (id, email, name, user_name, home_state) values (gen_random_uuid(), 'z@x', 'z', 'z', 'CA')"), /no auth user/);
  assert.equal(await n(fixed, "select count(*) n from conversation_messages where body = 'reply from B'"), 2);
});

// ── 4b. Row-by-row: nothing belonging to anyone else is deleted OR altered ───────────────────────
async function allRows(db: DB): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  const tabs = await q(db, "select tablename from pg_tables where schemaname = 'public' order by 1");
  for (const { tablename } of tabs) out[tablename] = (await q(db, `select to_jsonb(t) r from public."${tablename}" t`)).map((x: any) => x.r);
  return out;
}
test("fixed: deleting A deletes/alters no row that belongs to another user (entries, participation, threads, winners, chip matches/results, payouts, venue/tournament history)", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  const aUid = uid("A"), a = ida("A");
  const aPlayer = (await one(db, "select id from players where profile_id = $1", [aUid])).id;
  // Rows A's deletion is ALLOWED to touch (A's own rows / A's own column on a shared row).
  const mine: Record<string, (r: any) => boolean> = {
    profiles: (r) => r.id === aUid,
    players: (r) => r.id === aPlayer,
    giveaway_entries: (r) => r.user_id === a,
    tournament_players: (r) => r.player_id === a,
    tournament_team_members: (r) => r.player_id === a,
    tournament_teams: (r) => r.captain_id === a,
    chip_entries: (r) => r.p1_profile_id === a || r.p2_profile_id === a || r.p1_player_id === aPlayer,
    chip_results: (r) => r.p1_profile_id === a || r.p2_profile_id === a,
    venue_directors: (r) => r.director_id === a,
    referral_codes: (r) => r.profile_id === a,
    reassignment_logs: (r) => [r.previous_user_id, r.new_user_id, r.reassigned_by].includes(a),
    // auth.users FKs that were already ON DELETE SET NULL: A's own analytics/log rows are de-identified.
    app_events: (r) => r.user_id === aUid,
    sms_messages: (r) => r.user_id === aUid,
    tournament_analytics: (r) => r.user_id === aUid,
    bar_requests: (r) => r.submitted_by === aUid || r.reviewed_by === aUid,
  };
  const before = await allRows(db);
  assert.ok((await del(db, "A")).ok);
  const after = await allRows(db);
  for (const [t, rows] of Object.entries(before)) {
    if (PERSONAL_TABLES.has(t)) continue; // checked by the count test: shrink only by A's rows
    const afterSet = new Set(after[t].map((r) => JSON.stringify(r)));
    const others = rows.filter((r) => !(mine[t]?.(r)));
    for (const r of others) assert.ok(afterSet.has(JSON.stringify(r)), `${t}: another user's row was deleted or altered: ${JSON.stringify(r)}`);
    const aRows = rows.filter((r) => mine[t]?.(r)).length;
    assert.ok(after[t].length <= rows.length && rows.length - after[t].length <= aRows, `${t}: row count changed beyond A's own rows`);
  }
  // Specifically: B's chip entry keeps B's phone and B's link; only A's p2 slot was unlinked.
  const ba = await one(db, "select * from chip_entries where id = 'ce-BA'");
  assert.equal(ba.p1_profile_id, ida("B"));
  assert.equal(ba.p1_phone, "+15551111111");
  assert.equal(ba.p2_profile_id, null);
  assert.equal(ba.p2_player_id, aPlayer);
  assert.equal(await n(db, "select count(*) n from chip_matches where winner_id = 'ce-A'"), 1);
  // Historical player name is kept on results (only contact data and the account link go).
  const p = await one(db, "select * from players where id = $1", [aPlayer]);
  assert.equal(p.account_status, "DISABLED");
  assert.equal(p.email, null);
  assert.ok(p.display_name || p.first_name, "historical player name retained");
});

// ── 4b2. Draw eligibility (option a) ───────────────────────────────────────────────────────────────
test("fixed: a deleted user can never become a future winner; concluded history intact", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  const a = ida("A");
  const othersBefore = JSON.stringify(await q(db, "select * from giveaway_entries where user_id <> $1 order by id", [a]));
  const whBefore = JSON.stringify(await q(db, "select * from giveaway_winner_history order by id"));
  assert.ok((await del(db, "A")).ok);
  // Open (G2) and archived-undrawn (G5) giveaways: A's entries withdrawn; everyone else's untouched.
  assert.equal(await n(db, "select count(*) n from giveaway_entries where user_id = $1 and giveaway_id in ($2, $3)", [a, IDS.G2, IDS.G5]), 0);
  assert.equal(JSON.stringify(await q(db, "select * from giveaway_entries where user_id <> $1 order by id", [a])), othersBefore);
  // Concluded: A's win on G3 and ALL winner history preserved byte-for-byte.
  assert.equal((await one(db, "select winner_id from giveaways where id = $1", [IDS.G3])).winner_id, a);
  assert.equal(JSON.stringify(await q(db, "select * from giveaway_winner_history order by id")), whBefore);
  // Any attempt to record A as a NEW winner is refused (legacy client re-draw / wallet draw writes).
  await assert.rejects(q(db, "update giveaways set winner_id = $1 where id = $2", [a, IDS.G6]), /has been deleted/);
  await assert.rejects(q(db, "update giveaways set winner_id = $1 where id = $2", [a, IDS.G1]), /has been deleted/);
  await assert.rejects(q(db, `insert into giveaway_winner_history (giveaway_id, user_id, entry_id, status, drawn_at, drawn_by)
    values ($1, $2, 113, 'winner', now(), $3)`, [IDS.G1, a, ida("sa")]), /has been deleted/);
  await assert.rejects(q(db, `insert into giveaway_draws (giveaway_id, drawn_by, winner_id, draw_number, entry_id)
    values ($1, $2, $3, 1, 161)`, [IDS.G6, ida("sa"), a]), /has been deleted/);
  // The app's re-draw pool (all entries minus disqualified) can still contain A's kept entry —
  // the write above is what stops it. A live entrant still wins normally.
  const pool = await q(db, `select user_id from giveaway_entries where giveaway_id = $1
     and user_id not in (select user_id from giveaway_winner_history where giveaway_id = $1 and status = 'disqualified')`, [IDS.G1]);
  assert.ok(pool.some((r: any) => r.user_id === a), "A's redacted entry is still in the client pool");
  await q(db, "update giveaways set winner_id = $1 where id = $2", [ida("C"), IDS.G6]);
  // History that already names A stays editable; only NEW winner references are blocked.
  await q(db, "update giveaway_winner_history set disqualified_reason = 'x' where id = 203");
});

// ── 4c. C/B/D: a deleted profile is inert, its identifiers are reserved, auth deletes are gated ──
test("fixed: a deleted profile cannot sign in, be found, assigned, registered, messaged or notified", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  assert.ok((await del(db, "A")).ok);
  const a = ida("A"), aUid = uid("A");
  // Login: no auth user; username->email resolution returns nothing.
  assert.equal(await n(db, "select count(*) n from auth.users where id = $1", [aUid]), 0);
  assert.equal((await one(db, "select public._login_email_for_username($1) e", [`deleted:${a}`])).e ?? null, null);
  // Staff/director search (as an admin) and player registration search.
  const staff = await as(db, "sa", "select * from public.search_users_for_staff('Deleted', 50, true)", false);
  assert.ok(staff.ok && (staff as any).rows.length === 0, JSON.stringify(staff));
  const reg = await as(db, "sa", `select * from public.search_players_for_registration(${IDS.Told}, 'Name A', 50)`, false);
  assert.ok(reg.ok, JSON.stringify(reg));
  assert.ok(!(reg as any).rows.some((r: any) => r.id_auto === a), JSON.stringify(reg));
  // Referral code no longer resolves.
  const code = (await one(db, "select code from referral_codes where profile_id = $1", [a])).code;
  const ref = await as(db, "anon", `select public.resolve_referral_code('${code}') r`, false);
  assert.ok(ref.ok, JSON.stringify(ref));
  assert.equal((ref as any).rows[0].r.valid, false);
  // New relationships are refused.
  const refused = [
    `insert into venue_owners (venue_id, owner_id) values (${IDS.V1}, ${a})`,
    `insert into venue_directors (venue_id, director_id) values (${IDS.V2}, ${a})`,
    `update tournaments set director_id = ${a} where id = ${IDS.Tfuture}`,
    `update tournament_templates set director_id = ${a} where id = ${IDS.TT}`,
    `insert into tournament_players (tournament_id, player_id) values (${IDS.Tfuture}, ${a})`,
    `insert into conversation_participants (conversation_id, user_id) values ('00000000-0000-0000-0000-0000000c0002', '${aUid}')`,
    `insert into giveaway_credit_ledger (profile_id, delta, balance_after, reason) values (${a}, 1, 1, 'admin_grant')`,
  ];
  for (const sql of refused) await assert.rejects(q(db, sql), /has been deleted/, sql);
  await assert.rejects(q(db, `insert into giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone, agreed_to_rules, agreed_to_privacy, confirmed_age, quantity) values (${IDS.G2}, ${a}, 'x', '1990-01-01', 'x@y', '1', true, true, true, 1)`));
  // Notifications / messages to the deleted profile are silently skipped; others still delivered.
  await q(db, `insert into notifications (user_id, title, body) values (${a}, 't', 'm'), (${ida("B")}, 't', 'm')`);
  assert.equal(await n(db, "select count(*) n from notifications where user_id = $1", [a]), 0);
  const m = await one(db, "select id from messages order by id limit 1");
  await q(db, `insert into message_recipients (message_id, user_id) values (${m.id}, ${a}), (${m.id}, ${ida("C")})`);
  assert.equal(await n(db, "select count(*) n from message_recipients where user_id = $1", [a]), 0);
  assert.equal(await n(db, "select count(*) n from message_recipients where user_id = $1", [ida("C")]), 1);
  const nm = await one(db, "select id from notification_messages order by created_at limit 1");
  await q(db, `insert into notification_message_recipients (message_id, user_id) values ('${nm.id}', '${aUid}')`);
  assert.equal(await n(db, "select count(*) n from notification_message_recipients where user_id = $1", [aUid]), 0);
  // Historical rows that already point at A are still editable for other fields.
  await q(db, `update tournaments set name = 'renamed' where id = ${IDS.Told}`);
});

test("fixed: tombstone identifiers are reserved; live profiles cannot take them", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  await assert.rejects(q(db, `update profiles set user_name = 'Deleted:999' where id = $1`, [uid("B")]), /tombstone_identifiers_reserved/);
  await assert.rejects(q(db, `update profiles set email = 'x@DELETED.invalid' where id = $1`, [uid("B")]), /tombstone_identifiers_reserved/);
  const nu = "00000000-0000-0000-0000-00000000f777";
  await ins(db, "auth.users", { id: nu, email: "new@x.test" });
  await assert.rejects(ins(db, "profiles", { id: nu, id_auto: 777, email: "new@x.test", name: "N", user_name: "deleted:101", home_state: "CA" }), /tombstone_identifiers_reserved/);
  // Deleting A can never collide: its tombstone values are derived from its unique id_auto.
  assert.ok((await del(db, "A")).ok);
  assert.ok((await del(db, "W")).ok);
  assert.equal(await n(db, "select count(distinct user_name) n from profiles where status = 'deleted'"), 2);
});

test("fixed: auth.users delete is refused outside delete_user_account (live, soft-deleted, or flag without tombstone)", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  // Live profile.
  await assert.rejects(q(db, "delete from auth.users where id = $1", [uid("C")]), /only through delete_user_account/);
  // Admin soft-deleted profile (status deleted, PII still present).
  await q(db, "update profiles set status = 'deleted', deleted_at = now() where id = $1", [uid("C")]);
  await assert.rejects(q(db, "delete from auth.users where id = $1", [uid("C")]), /only through delete_user_account/);
  // The flow's transaction flag alone is not enough without a real tombstone.
  await q(db, "begin");
  await q(db, "select set_config('compete.account_deletion_uid', $1, true)", [uid("C")]);
  await assert.rejects(q(db, "delete from auth.users where id = $1", [uid("C")]), /only through delete_user_account/);
  await q(db, "rollback");
  // The soft-deleted user can still complete their own deletion (they can still sign in).
  assert.ok((await del(db, "C")).ok);
  assert.equal(await n(db, "select count(*) n from auth.users where id = $1", [uid("C")]), 0);
  // An abandoned sign-up (auth user, no profile) deletes as before.
  const orphan = "00000000-0000-0000-0000-00000000f888";
  await ins(db, "auth.users", { id: orphan, email: "orphan@x.test" });
  await q(db, "delete from auth.users where id = $1", [orphan]);
});

test("§0: a live entry must carry all PII; a partially-null entry is rejected", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  await assert.rejects(q(db, "update giveaway_entries set birthday = null where id = 111"), /pii_complete_or_redacted/);
  await q(db, "update giveaway_entries set name_as_on_id = null, birthday = null, email = null, phone = null where id = 111");
});

// ── 5. FK actions are exactly as proposed, and the rollback restores prod exactly ──────────────────
const FK_SQL = `select conname, pg_get_constraintdef(oid) def from pg_constraint where contype = 'f' order by conname`;
test("rollback restores the exact prod FK definitions, function body and grants", async () => {
  const fresh = await prodDb();
  const prodFks = await q(fresh, FK_SQL);
  const SHAPE_SQL = `select (select json_agg(x order by x) from (select conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) x
      from pg_constraint where connamespace = 'public'::regnamespace) c) cons,
    (select json_agg(x order by x) from (select attrelid::regclass || '.' || attname || ':' || attnotnull x from pg_attribute
      where attrelid in ('public.giveaway_entries'::regclass, 'public.profiles'::regclass) and attnum > 0 and not attisdropped) a) cols,
    (select json_agg(x order by x) from (select tgrelid::regclass || ' ' || tgname x from pg_trigger where not tgisinternal) t) trg,
    (select json_agg(x order by x) from (select p.oid::regprocedure::text x from pg_proc p where p.pronamespace = 'public'::regnamespace) f) fns`;
  const prodShape = await one(fresh, SHAPE_SQL);
  const prodFn = (await one(fresh, "select pg_get_functiondef('public.delete_user_account()'::regprocedure) d")).d;
  await fresh.exec(MIGRATION);
  const migFks = await q(fresh, FK_SQL);
  assert.notDeepEqual(migFks, prodFks);
  await fresh.exec(ROLLBACK);
  const rbFks = await q(fresh, FK_SQL);
  assert.deepEqual(rbFks, prodFks);
  // Every constraint, column nullability, trigger and function signature is back to prod.
  assert.deepEqual(await one(fresh, SHAPE_SQL), prodShape);
  assert.equal((await one(fresh, "select pg_get_functiondef('public.delete_user_account()'::regprocedure) d")).d, prodFn);
  assert.equal(await n(fresh, "select count(*) n from pg_proc where proname in ('_account_deletion_blockers','get_my_account_deletion_blockers','tg_profiles_require_auth_user','tg_auth_users_block_live_profile_delete')"), 0);
  assert.equal(await n(fresh, "select count(*) n from pg_trigger where tgname in ('profiles_require_auth_user','auth_users_block_live_profile_delete')"), 0);
  // Grants back to prod: anon + PUBLIC may execute again (the migration had revoked them).
  const acl = async (d: DB) => (await one(d, "select proacl::text a from pg_proc where oid = 'public.delete_user_account()'::regprocedure")).a;
  const probe = await prodDb();
  const prodAcl = await acl(probe);
  await probe.exec(MIGRATION);
  assert.ok(!(await acl(probe)).includes("anon="), "migration revokes anon");
  assert.equal(await n(fresh, "select count(*) n from pg_proc where oid = 'public.delete_user_account()'::regprocedure and has_function_privilege('anon', oid, 'execute')"), 1);
  void prodAcl;
});

test("rollback after real deletions: succeeds, keeps tombstones + history, auth keys stay NOT VALID", async () => {
  const db = await prodDb();
  await db.exec(MIGRATION);
  await seed(db);
  assert.ok((await del(db, "W")).ok);
  const counts = await tableCounts(db);
  await db.exec(ROLLBACK);
  assert.deepEqual(await tableCounts(db), counts);
  const defs = new Map((await q(db, FK_SQL)).map((r: any) => [r.conname, r.def]));
  assert.equal(defs.get("profiles_id_fkey"), "FOREIGN KEY (id) REFERENCES auth.users(id) NOT VALID");
  assert.equal(defs.get("conversations_created_by_fkey"), "FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE");
  // Old function is back: it refuses a giveaway creator exactly as prod does today.
  const r = await del(db, "A");
  assert.ok(!r.ok && (r as any).error.includes(TRANSFER_MSG));
});

test("migration changes exactly the listed FKs (and nothing else)", async () => {
  const fresh = await prodDb();
  const before = new Map((await q(fresh, FK_SQL)).map((r: any) => [r.conname, r.def]));
  await fresh.exec(MIGRATION);
  const after = new Map((await q(fresh, FK_SQL)).map((r: any) => [r.conname, r.def]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
  assert.deepEqual(changed, [
    "conversation_messages_sender_id_fkey", "conversation_participants_user_id_fkey", "conversations_created_by_fkey",
    "giveaway_credit_ledger_profile_id_fkey", "giveaway_draws_invalidated_by_fkey", "giveaway_wallets_profile_id_fkey",
    "giveaway_winner_history_disqualified_by_fkey", "giveaways_winner_drawn_by_fkey", "notification_messages_sender_id_fkey",
    "profiles_id_fkey", "referral_codes_profile_id_fkey", "referrals_referred_profile_id_fkey", "reports_reporter_id_fkey",
    "sms_consent_events_user_id_fkey", "support_tickets_assigned_to_fkey", "support_tickets_resolved_by_fkey",
    "tournament_reviews_reviewer_id_fkey", "tournament_teams_captain_id_fkey", "tournament_templates_archived_by_fkey",
    "tournaments_archived_by_fkey", "tournaments_cancelled_by_fkey", "venue_directors_archived_by_fkey",
    "venue_directors_assigned_by_fkey", "venue_owners_archived_by_fkey", "venue_owners_assigned_by_fkey", "venues_archived_by_fkey",
  ]);
  // No CASCADE from a user/profile into a shared table remains (auth internals + approved personal tables only).
  const cascades = (await q(fresh, `select conrelid::regclass::text t, confrelid::regclass::text p from pg_constraint
     where contype = 'f' and confdeltype = 'c' and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)`))
    .map((r: any) => r.t).sort();
  for (const t of cascades) {
    assert.ok(t.startsWith("auth.") || PERSONAL_TABLES.has(t.replace(/^public\./, "")), `unexpected cascade into ${t}`);
  }
});
