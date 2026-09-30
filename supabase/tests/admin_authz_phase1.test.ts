// supabase/tests/admin_authz_phase1.test.ts
// Super-admin architecture Phase 1 — server / authorization safety:
//   supabase/migrations/20261013120000_admin_global_authz_phase1.sql   (or migrations/, once approved)
// PGlite, replaying the EXACT prod policies + RLS flags captured before the change
// (supabase/rollback/20261013110000_admin_authz_phase1_baseline_capture.sql), the verbatim prod
// authz helpers, and the prod delete_user_account (taken from the rollback file). Every hole is
// first shown on the baseline, then shown closed after the migration; legitimate access is kept.
// Requests run as the real PostgREST roles (SET LOCAL ROLE authenticated/anon) with auth.uid()
// stubbed from a GUC, like authz_lockdown.test.ts.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/admin_authz_phase1.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const MIG_FILE = "20261013120000_admin_global_authz_phase1.sql";
const MIGRATION = readFileSync(
  join(ROOT, existsSync(join(ROOT, "supabase/migrations", MIG_FILE)) ? "supabase/migrations" : "supabase/pending", MIG_FILE),
  "utf8",
);
const BASELINE_POLICIES = readFileSync(join(ROOT, "supabase/rollback/20261013110000_admin_authz_phase1_baseline_capture.sql"), "utf8");
const ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20261013120000_admin_global_authz_phase1_rollback.sql"), "utf8");
// The pre-change prod delete_user_account, verbatim (the tail of the rollback file).
const BASELINE_DELETE_FN = ROLLBACK.slice(ROLLBACK.indexOf("CREATE OR REPLACE FUNCTION public.delete_user_account"));
// The authoritative venue-creation RPC (+ its role helper), verbatim from the applied M1 migration.
const M1 = readFileSync(join(ROOT, "supabase/migrations/20260930120000_authz_rpcs.sql"), "utf8");
const fnFrom = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} found in M1`);
  return src.slice(start, src.indexOf("\n$$;", start) + 4);
};
const CREATE_VENUE_FNS = fnFrom(M1, "_recompute_user_role") + "\n" + fnFrom(M1, "create_venue");
// Prod search_users_for_staff before this migration (verbatim, from the rollback file).
const SUF_START = ROLLBACK.indexOf("CREATE OR REPLACE FUNCTION public.search_users_for_staff(p_query text, p_limit integer DEFAULT 20)");
const BASELINE_STAFF_SEARCH = ROLLBACK.slice(SUF_START, ROLLBACK.indexOf("$function$;", SUF_START) + "$function$;".length);

const U = {
  sa: ["00000000-0000-0000-0000-0000000000a1", 1],   // super_admin
  sa2: ["00000000-0000-0000-0000-0000000000a2", 2],  // super_admin (so "last admin" never applies)
  ca: ["00000000-0000-0000-0000-0000000000c1", 3],   // compete_admin
  own: ["00000000-0000-0000-0000-0000000000b1", 10], // active owner of V1
  own2: ["00000000-0000-0000-0000-0000000000b2", 11],// active owner of V2
  exown: ["00000000-0000-0000-0000-0000000000b3", 12],// ARCHIVED (former) owner of V1
  td: ["00000000-0000-0000-0000-0000000000d1", 20],  // TD at V1, directs T1 + template P1
  td2: ["00000000-0000-0000-0000-0000000000d2", 21], // TD at V2, directs T2 + template P2
  bu: ["00000000-0000-0000-0000-0000000000e1", 30],  // basic_user with personal data only
  bu2: ["00000000-0000-0000-0000-0000000000e2", 31], // basic_user
  gcr: ["00000000-0000-0000-0000-0000000000e3", 32], // basic_user that created a giveaway (legacy)
  gdr: ["00000000-0000-0000-0000-0000000000e4", 33], // basic_user recorded as a giveaway drawer
} as const;
type Who = keyof typeof U;
const uid = (w: Who) => U[w][0] as string;
const ida = (w: Who) => U[w][1] as number;
const V1 = 1, V2 = 2;
const T1 = 100, T2 = 200;
const P1 = 10, P2 = 20;
const SUB1 = "11111111-1111-1111-1111-111111111111", SUB2 = "22222222-2222-2222-2222-222222222222";
const TRANSFER_MSG = "This account must be transferred or removed by another administrator.";

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

type Res = { ok: true; rows: any[] } | { ok: false; error: string };
/** Run as a PostgREST user; always rolls back unless commit=true. */
async function as(who: Who | "anon", sql: string, params: unknown[] = [], commit = false): Promise<Res> {
  await q("begin");
  try {
    if (who === "anon") {
      await q("select set_config('test.uid', '', true)");
      await q("set local role anon");
    } else {
      await q("select set_config('test.uid', $1, true)", [uid(who)]);
      await q("set local role authenticated");
    }
    const rows = await q(sql, params);
    await q(commit ? "commit" : "rollback");
    return { ok: true, rows };
  } catch (e: any) {
    await q("rollback");
    return { ok: false, error: String(e?.message ?? e) };
  }
}
const allowed = (r: Res, msg: string) => {
  assert.ok(r.ok, `${msg} — expected success, got: ${(r as any).error}`);
  assert.ok(r.rows.length > 0, `${msg} — expected rows, got none`);
};
/** Denied = raised (RLS / privilege / guard) OR matched no rows. */
const denied = (r: Res, msg: string) =>
  assert.ok(!r.ok || r.rows.length === 0, `${msg} — expected denial, but it succeeded: ${JSON.stringify((r as any).rows)}`);
const rejectedWith = (r: Res, text: string, msg: string) => {
  assert.ok(!r.ok, `${msg} — expected an error, but it succeeded`);
  assert.ok((r as any).error.includes(text), `${msg} — wrong error: ${(r as any).error}`);
};
const count = async (sql: string) => Number((await q(sql))[0].n);

// Row fingerprint of everything a refused deletion must leave untouched.
const fingerprint = async () =>
  JSON.stringify(await q(`select
    (select count(*) from profiles) p, (select count(*) from auth.users) u, (select count(*) from tournaments) t,
    (select count(*) from tournament_templates) tt, (select count(*) from venues) v, (select count(*) from venue_owners) vo,
    (select count(*) from venue_directors) vd, (select count(*) from giveaways) g, (select count(*) from giveaway_entries) ge,
    (select count(*) from giveaway_draws) gd, (select count(*) from giveaway_winner_history) gh, (select count(*) from favorites) f,
    (select count(*) from players where account_status = 'ACTIVE') pa`));

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  const prof = (w: Who, role: string) => `('${uid(w)}', ${ida(w)}, '${w}@x.test', '${w}', '${w}', '${role}')`;
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table auth.users (id uuid primary key, email text);

    -- ── prod table shapes (columns the policies / functions touch) ──
    create table public.profiles (
      id uuid primary key, id_auto bigint generated by default as identity unique, email text, name text, user_name text,
      role text not null default 'basic_user', status text default 'active', is_disabled boolean not null default false,
      deleted_at timestamptz, deleted_by integer, updated_at timestamptz);
    create table public.venues (id serial primary key, venue text not null, address text, city text, state text, zip_code text,
      phone text, google_place_id text, latitude numeric, longitude numeric, status text default 'active', archived_by integer);
    create table public.venue_owners (id serial primary key, venue_id integer not null, owner_id integer not null, assigned_by integer,
      archived_at timestamptz, archived_by integer, is_primary boolean default false);
    create table public.venue_directors (id serial primary key, venue_id integer not null, director_id integer not null, assigned_by integer,
      archived_at timestamptz, archived_by integer, unique (venue_id, director_id));
    create table public.tournament_templates (id serial primary key, venue_id integer, director_id integer not null, name text,
      status text default 'active', archived_by integer);
    create table public.tournaments (id serial primary key, venue_id integer, director_id integer not null, name text,
      status text default 'active', archived_by integer, cancelled_by integer, template_id integer, parent_template_id integer);
    create table public.billing_plans (id uuid primary key default gen_random_uuid(), name text, is_active boolean default true);
    create table public.venue_subscriptions (id uuid primary key default gen_random_uuid(), venue_id integer, plan_id uuid, status text,
      cancel_at_period_end boolean default false, provider_customer_id text, provider_subscription_id text);
    create table public.invoices (id serial primary key, venue_id integer, amount numeric);
    create table public.payment_methods (id serial primary key, venue_id integer, last4 text, is_default boolean default true);
    create table public.giveaways (id serial primary key, created_by integer, winner_id integer, winner_drawn_by integer, status text);
    create table public.giveaway_entries (id serial primary key, giveaway_id integer, user_id integer);
    create table public.giveaway_draws (id serial primary key, giveaway_id integer, winner_id integer not null, drawn_by integer not null, invalidated_by integer);
    create table public.giveaway_winner_history (id serial primary key, giveaway_id integer, user_id integer, drawn_by integer not null, disqualified_by integer);
    create table public.search_alerts (id serial primary key, user_id integer);
    create table public.alert_matches (id serial primary key, alert_id integer, tournament_id integer, template_id integer);
    create table public.saved_searches (id serial primary key, user_id integer);
    create table public.favorites (id serial primary key, user_id integer, tournament_id integer, template_id integer);
    create table public.notifications (id serial primary key, user_id integer);
    create table public.notification_messages (id uuid primary key default gen_random_uuid(), sender_id uuid, tournament_id integer, venue_id integer);
    create table public.notification_message_recipients (id serial primary key, message_id uuid, user_id uuid);
    create table public.notification_preferences (user_id uuid);
    create table public.push_tokens (id serial primary key, user_id uuid);
    create table public.messages (id serial primary key, sender_id integer, tournament_id integer, template_id integer, venue_id integer);
    create table public.message_recipients (id serial primary key, message_id integer, user_id integer);
    create table public.message_rate_limits (sender_id uuid);
    create table public.conversations (id uuid primary key default gen_random_uuid(), created_by uuid, tournament_id integer);
    create table public.conversation_messages (id serial primary key, conversation_id uuid, sender_id uuid);
    create table public.conversation_participants (conversation_id uuid, user_id uuid);
    create table public.support_tickets (id serial primary key, user_id integer, resolved_by integer, assigned_to integer);
    create table public.tournament_templates_user (id serial primary key, user_id integer);
    create table public.featured_players (id serial primary key, user_id integer);
    create table public.audit_log (id serial primary key, user_id integer);
    create table public.bar_requests (id serial primary key, submitted_by uuid, reviewed_by uuid);
    create table public.image_scan_logs (id serial primary key, user_id uuid);
    create table public.venue_audits (id serial primary key, venue_id integer, owner_id integer);
    create table public.venue_tables (id serial primary key, venue_id integer, table_size varchar not null default '9ft',
      brand varchar, quantity integer, custom_size varchar, created_at timestamp);
    create table public.featured_bars (id serial primary key, venue_id integer);
    create table public.tournament_analytics (id serial primary key, tournament_id integer);
    create table public.reassignment_logs (id serial primary key, previous_user_id integer, previous_user_name text,
      new_user_id integer, new_user_name text, reassigned_by integer, reassigned_by_name text);
    create table public.players (id uuid primary key default gen_random_uuid(), profile_id uuid, email text, phone_e164 text,
      account_status text default 'ACTIVE', updated_at timestamptz);
    create table public.player_invitations (id serial primary key, player_id uuid);
    create table public.tournament_players (id serial primary key, tournament_id integer, player_id integer, player_uuid uuid);
    create table public.tournament_teams (id serial primary key, tournament_id integer, captain_id integer, captain_player_id uuid);
    create table public.tournament_team_members (id serial primary key, team_id integer, player_id integer, player_uuid uuid);
    create table public.chip_entries (id text primary key, tournament_id integer, p1_profile_id integer, p2_profile_id integer,
      p1_player_id uuid, p2_player_id uuid, p1_phone text);
    create table public.chip_results (id bigserial primary key, p1_profile_id integer, p2_profile_id integer, p1_player_id uuid, p2_player_id uuid);

    -- prod grants: Supabase defaults (ALL to anon/authenticated)
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;

    -- ── prod authz helpers, verbatim ──
    CREATE OR REPLACE FUNCTION public._authz_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp' AS $f$
      select coalesce((select role from public.profiles where id = auth.uid()) in ('compete_admin', 'super_admin'), false)
    $f$;
    CREATE OR REPLACE FUNCTION public._authz_my_id_auto() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp' AS $f$ select id_auto from public.profiles where id = auth.uid() $f$;
    CREATE OR REPLACE FUNCTION public.is_venue_owner(p_venue_id integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp' AS $f$
      SELECT EXISTS (SELECT 1 FROM public.venue_owners WHERE venue_id = p_venue_id
        AND owner_id = (SELECT id_auto FROM public.profiles WHERE id = auth.uid()) AND archived_at IS NULL);
    $f$;
    CREATE OR REPLACE FUNCTION public._authz_manages_venue(p_venue_id integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp' AS $f$
      select exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.archived_at is null
          and vo.owner_id = (select id_auto from public.profiles where id = auth.uid()))
        or exists (select 1 from public.venue_directors vd where vd.venue_id = p_venue_id and vd.archived_at is null
          and vd.director_id = (select id_auto from public.profiles where id = auth.uid()))
    $f$;
    CREATE OR REPLACE FUNCTION public.tg_guard_venue_director_change() RETURNS trigger LANGUAGE plpgsql
     SET search_path TO 'public', 'pg_temp' AS $f$
    begin
      if current_user not in ('authenticated', 'anon') then return new; end if;
      if new.venue_id is not distinct from old.venue_id and new.director_id is not distinct from old.director_id then return new; end if;
      if public._authz_is_admin() then return new; end if;
      if new.venue_id is distinct from old.venue_id and not public._authz_manages_venue(new.venue_id) then
        raise exception 'Not authorized to move this % to venue %', tg_table_name, new.venue_id using errcode = '42501';
      end if;
      if new.director_id is distinct from old.director_id
         and not (public.is_venue_owner(old.venue_id) and public.is_venue_owner(new.venue_id)) then
        raise exception 'Only the venue owner or an admin can reassign the director of this %', tg_table_name using errcode = '42501';
      end if;
      return new;
    end; $f$;
    create trigger tournament_templates_guard_venue_director before update on public.tournament_templates
      for each row execute function tg_guard_venue_director_change();

    -- ── seed (as the superuser = service role) ──
    insert into profiles (id, id_auto, email, name, user_name, role) values
      ${prof("sa", "super_admin")}, ${prof("sa2", "super_admin")}, ${prof("ca", "compete_admin")},
      ${prof("own", "bar_owner")}, ${prof("own2", "bar_owner")}, ${prof("exown", "basic_user")},
      ${prof("td", "tournament_director")}, ${prof("td2", "tournament_director")},
      ${prof("bu", "basic_user")}, ${prof("bu2", "basic_user")}, ${prof("gcr", "basic_user")}, ${prof("gdr", "basic_user")};
    insert into auth.users (id, email) select id, email from profiles;
    insert into venues (id, venue) values (${V1}, 'Venue One'), (${V2}, 'Venue Two');
    select setval('venues_id_seq', 50);
    insert into venue_tables (id, venue_id, table_size, brand, quantity) values (1, ${V1}, '9ft', 'Diamond', 4), (2, ${V2}, '7ft', 'Valley', 6);
    select setval('venue_tables_id_seq', 50);
    insert into venue_owners (venue_id, owner_id, assigned_by, is_primary, archived_at) values
      (${V1}, ${ida("own")}, ${ida("sa")}, true, null), (${V2}, ${ida("own2")}, ${ida("sa")}, true, null),
      (${V1}, ${ida("exown")}, ${ida("sa")}, false, now());
    insert into venue_directors (venue_id, director_id, assigned_by) values (${V1}, ${ida("td")}, ${ida("own")}), (${V2}, ${ida("td2")}, ${ida("own2")});
    insert into tournament_templates (id, venue_id, director_id, name) values (${P1}, ${V1}, ${ida("td")}, 'P1'), (${P2}, ${V2}, ${ida("td2")}, 'P2');
    insert into tournaments (id, venue_id, director_id, name) values (${T1}, ${V1}, ${ida("td")}, 'T1'), (${T2}, ${V2}, ${ida("td2")}, 'T2');
    insert into billing_plans (id, name, is_active) values
      ('33333333-3333-3333-3333-333333333333', 'Founding', true), ('44444444-4444-4444-4444-444444444444', 'Retired', false);
    insert into venue_subscriptions (id, venue_id, status, provider_customer_id, provider_subscription_id) values
      ('${SUB1}', ${V1}, 'active', 'cus_v1', 'sub_v1'), ('${SUB2}', ${V2}, 'active', 'cus_v2', 'sub_v2');
    insert into invoices (venue_id, amount) values (${V1}, 10), (${V2}, 20);
    insert into payment_methods (venue_id, last4) values (${V1}, '1111'), (${V2}, '2222');
    insert into giveaways (id, created_by, status) values (1, ${ida("gcr")}, 'active'), (2, ${ida("sa")}, 'active');
    insert into giveaway_entries (giveaway_id, user_id) values (1, ${ida("bu2")}), (2, ${ida("bu2")}), (2, ${ida("bu")});
    insert into giveaway_draws (giveaway_id, winner_id, drawn_by) values (2, ${ida("bu2")}, ${ida("gdr")});
    -- bu: personal data + tournament history (must be de-identified, not deleted)
    insert into players (id, profile_id, email, account_status) values ('55555555-5555-5555-5555-555555555555', '${uid("bu")}', 'bu@x.test', 'ACTIVE');
    insert into favorites (user_id, tournament_id) values (${ida("bu")}, ${T1}), (${ida("bu2")}, ${T1});
    insert into push_tokens (user_id) values ('${uid("bu")}');
    insert into tournament_players (tournament_id, player_id, player_uuid) values (${T1}, ${ida("bu")}, '55555555-5555-5555-5555-555555555555');
  `);
  // Replay the EXACT prod policies + RLS flags, and the prod delete_user_account.
  await db.exec(BASELINE_POLICIES);
  await db.exec(BASELINE_DELETE_FN);
  await db.exec(CREATE_VENUE_FNS);
  await db.exec(`create function public._mask_email(e text) returns text language sql immutable as $f$ select 'masked' $f$;`);
  await db.exec(BASELINE_STAFF_SEARCH);
});

// create_venue as a user, inspected inside one transaction and rolled back.
async function createVenueAs(w: Who, args: string, params: unknown[]) {
  await q("begin");
  try {
    await q("select set_config('test.uid', $1, true)", [uid(w)]);
    await q("set local role authenticated");
    const id = (await q(`select public.create_venue(${args}) as id`, params))[0].id;
    await q("reset role");
    const owners = await q(`select owner_id, assigned_by, is_primary from venue_owners where venue_id = $1 and archived_at is null`, [id]);
    const venue = await q(`select count(*)::int n from venues where id = $1`, [id]);
    return { ok: true as const, id, owners, venueExists: venue[0].n === 1 };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message ?? e) };
  } finally {
    await q("rollback");
  }
}
const VENUE_JSON = JSON.stringify({ venue: "New Hall", address: "9 Main", city: "Lansing", state: "MI", zip_code: "48901" });
const staffSearch = async (w: Who, query: string, includeAdmins?: boolean) => {
  const r = includeAdmins === undefined
    ? await as(w, `select role from public.search_users_for_staff($1)`, [query])
    : await as(w, `select role from public.search_users_for_staff($1, 20, $2)`, [query, includeAdmins]);
  assert.ok(r.ok, (r as any).error);
  return r.rows.map((x: any) => x.role as string);
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// BASELINE — the gaps and holes are real on the captured prod definitions (all rolled back)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("BASELINE: admin cannot update a venue it does not own, or a template it does not direct", async () => {
  denied(await as("sa", `update venues set venue = 'x' where id = ${V1} returning id`), "super_admin venue update");
  denied(await as("sa", `update tournament_templates set name = 'x' where id = ${P1} returning id`), "super_admin template update");
});

test("BASELINE: billing tables are world-readable and world-writable (RLS off)", async () => {
  allowed(await as("anon", `select id from venue_subscriptions`), "anon reads subscriptions");
  allowed(await as("anon", `select id from invoices`), "anon reads invoices");
  allowed(await as("anon", `update venue_subscriptions set cancel_at_period_end = true where id = '${SUB1}' returning id`), "anon cancels a subscription");
  allowed(await as("bu", `select id from payment_methods`), "unrelated user reads payment methods");
  allowed(await as("anon", `update billing_plans set name = 'free' returning id`), "anon rewrites plans");
});

test("BASELINE: self-service deletion of a TD wipes the tournaments + templates it directs (no players = unguarded)", async () => {
  // Run inside one transaction, inspect, then roll back (T2 has no registrations — the incident case).
  await q("begin");
  await q("select set_config('test.uid', $1, true)", [uid("td2")]);
  await q("set local role authenticated");
  await q("select public.delete_user_account()");
  await q("reset role");
  const left = await q(`select (select count(*) from tournaments where id = ${T2}) t, (select count(*) from tournament_templates where id = ${P2}) p`);
  await q("rollback");
  assert.equal(Number(left[0].t), 0, "baseline deletes T2");
  assert.equal(Number(left[0].p), 0, "baseline deletes P2");
});

test("BASELINE: deleting the giveaway creator wipes the giveaway and other users' entries", async () => {
  await q("begin");
  await q("select set_config('test.uid', $1, true)", [uid("gcr")]);
  await q("set local role authenticated");
  await q("select public.delete_user_account()");
  await q("reset role");
  const left = await q(`select (select count(*) from giveaways where id = 1) g, (select count(*) from giveaway_entries where giveaway_id = 1) e`);
  await q("rollback");
  assert.equal(Number(left[0].g), 0);
  assert.equal(Number(left[0].e), 0, "another user's entry is deleted too");
});

test("BASELINE: any signed-in user can insert an arbitrary venue directly", async () => {
  allowed(await as("bu", `insert into venues (venue) values ('Spam Hall') returning id`), "basic_user inserts a venue");
});

test("BASELINE: venue_tables is world-writable (RLS off) — anon can add, change and delete any venue's tables", async () => {
  allowed(await as("anon", `insert into venue_tables (venue_id, table_size) values (${V1}, '9ft') returning id`), "anon insert");
  allowed(await as("anon", `update venue_tables set quantity = 99 where id = 1 returning id`), "anon update");
  allowed(await as("anon", `delete from venue_tables where id = 2 returning id`), "anon delete");
  allowed(await as("bu", `update venue_tables set quantity = 0 where venue_id = ${V2} returning id`), "unrelated user update");
});

test("BASELINE: an admin who creates a venue silently becomes its primary owner", async () => {
  const r = await createVenueAs("sa", "$1::jsonb", [VENUE_JSON]);
  assert.ok(r.ok, (r as any).error);
  assert.deepEqual(r.ok && r.owners, [{ owner_id: ida("sa"), assigned_by: ida("sa"), is_primary: true }]);
});

test("BASELINE: staff search offers admin accounts as candidates", async () => {
  assert.ok((await staffSearch("own", "sa")).includes("super_admin"), "owner sees super_admins in staff search");
});

test("migration applies cleanly on the prod baseline", async () => {
  await db.exec(MIGRATION);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. Admin global authorization (additive) — legitimate users keep exactly their scope
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("admin (super + compete) can update a venue without being its owner", async () => {
  allowed(await as("sa", `update venues set venue = 'Fixed by support' where id = ${V1} returning id`), "super_admin");
  allowed(await as("ca", `update venues set venue = 'Fixed by support' where id = ${V2} returning id`), "compete_admin");
});

test("venue owner stays scoped: own venue yes, other venue no; archived (former) owner no", async () => {
  allowed(await as("own", `update venues set venue = 'Mine' where id = ${V1} returning id`), "owner updates own venue");
  denied(await as("own", `update venues set venue = 'Theirs' where id = ${V2} returning id`), "owner updates another venue");
  denied(await as("exown", `update venues set venue = 'Old' where id = ${V1} returning id`), "archived owner");
});

test("unrelated normal users (basic, TD) and anon cannot update venues", async () => {
  denied(await as("bu", `update venues set venue = 'x' where id = ${V1} returning id`), "basic_user");
  denied(await as("td", `update venues set venue = 'x' where id = ${V1} returning id`), "TD (staff, not owner)");
  denied(await as("anon", `update venues set venue = 'x' where id = ${V1} returning id`), "anon");
});

test("admin can update a tournament template without being its director", async () => {
  allowed(await as("sa", `update tournament_templates set name = 'Fixed' where id = ${P1} returning id`), "super_admin");
  allowed(await as("ca", `update tournament_templates set name = 'Fixed' where id = ${P2} returning id`), "compete_admin");
});

test("template director stays scoped; unrelated users cannot update templates", async () => {
  allowed(await as("td", `update tournament_templates set name = 'Mine' where id = ${P1} returning id`), "director updates own");
  denied(await as("td2", `update tournament_templates set name = 'x' where id = ${P1} returning id`), "other TD");
  denied(await as("bu", `update tournament_templates set name = 'x' where id = ${P1} returning id`), "basic_user");
  denied(await as("anon", `update tournament_templates set name = 'x' where id = ${P1} returning id`), "anon");
  denied(await as("td", `update tournament_templates set director_id = ${ida("td2")} where id = ${P1} returning id`),
    "director cannot hand a template to someone else");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Billing tables
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("anon has no access to billing tables (read or write)", async () => {
  for (const t of ["venue_subscriptions", "invoices", "payment_methods", "billing_plans"]) {
    denied(await as("anon", `select 1 from ${t}`), `anon select ${t}`);
    denied(await as("anon", `delete from ${t} returning 1`), `anon delete ${t}`);
  }
  denied(await as("anon", `update venue_subscriptions set cancel_at_period_end = true where id = '${SUB1}' returning id`), "anon cancel");
});

test("venue owner reads ONLY their own venue's billing", async () => {
  const subs = await as("own", `select venue_id from venue_subscriptions`);
  assert.ok(subs.ok);
  assert.deepEqual(subs.rows.map((r: any) => r.venue_id), [V1]);
  const inv = await as("own", `select venue_id from invoices`);
  assert.deepEqual(inv.ok && inv.rows.map((r: any) => r.venue_id), [V1]);
  const pm = await as("own", `select venue_id from payment_methods`);
  assert.deepEqual(pm.ok && pm.rows.map((r: any) => r.venue_id), [V1]);
});

test("unrelated normal users (basic, TD, former owner) read no billing rows", async () => {
  for (const w of ["bu", "td", "exown"] as Who[]) {
    for (const t of ["venue_subscriptions", "invoices", "payment_methods"]) {
      denied(await as(w, `select 1 from ${t}`), `${w} select ${t}`);
    }
  }
});

test("admins can inspect all billing globally", async () => {
  for (const w of ["sa", "ca"] as Who[]) {
    const r = await as(w, `select (select count(*) from venue_subscriptions) s, (select count(*) from invoices) i,
                                  (select count(*) from payment_methods) p, (select count(*) from billing_plans) b`);
    assert.ok(r.ok, (r as any).error);
    assert.deepEqual(r.rows[0], { s: 2, i: 2, p: 2, b: 2 }, `${w} sees every billing row incl. inactive plans`);
  }
});

test("no client role can write billing data — not even the owner or an admin", async () => {
  for (const w of ["own", "sa"] as Who[]) {
    denied(await as(w, `update venue_subscriptions set cancel_at_period_end = true where id = '${SUB1}' returning id`), `${w} update sub`);
    denied(await as(w, `insert into invoices (venue_id, amount) values (${V1}, 1) returning id`), `${w} insert invoice`);
    denied(await as(w, `delete from payment_methods returning id`), `${w} delete payment method`);
    denied(await as(w, `update billing_plans set name = 'free' returning id`), `${w} rewrite plans`);
  }
});

test("billing plans: signed-in users read ACTIVE plans (subscription embed keeps working)", async () => {
  const r = await as("own", `select name from billing_plans order by name`);
  assert.deepEqual(r.ok && r.rows.map((x: any) => x.name), ["Founding"]);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Account deletion hardening
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("super_admin and compete_admin self-delete is rejected (even with other admins present)", async () => {
  const before = await fingerprint();
  rejectedWith(await as("sa", `select public.delete_user_account()`), TRANSFER_MSG, "super_admin");
  rejectedWith(await as("ca", `select public.delete_user_account()`), TRANSFER_MSG, "compete_admin");
  assert.equal(await fingerprint(), before, "nothing changed");
});

test("deletion is refused for accounts that direct / own operational records — and nothing changes", async () => {
  const before = await fingerprint();
  rejectedWith(await as("td", `select public.delete_user_account()`), TRANSFER_MSG, "TD directing T1 + template P1");
  rejectedWith(await as("own", `select public.delete_user_account()`), TRANSFER_MSG, "active venue owner");
  rejectedWith(await as("gcr", `select public.delete_user_account()`), TRANSFER_MSG, "giveaway creator");
  rejectedWith(await as("gdr", `select public.delete_user_account()`), TRANSFER_MSG, "giveaway drawer");
  // a template alone is enough
  await q(`insert into tournament_templates (id, venue_id, director_id, name) values (99, ${V2}, ${ida("bu2")}, 'solo')`);
  rejectedWith(await as("bu2", `select public.delete_user_account()`), TRANSFER_MSG, "template director only");
  await q(`delete from tournament_templates where id = 99`);
  assert.equal(await fingerprint(), before, "T1, P1, venues, giveaways, entries and profiles all untouched");
});

test("an account with only personal data still deletes normally; shared rows are preserved/de-identified", async () => {
  const r = await as("bu", `select public.delete_user_account()`, [], true);
  assert.ok(r.ok, (r as any).error);
  assert.equal(await count(`select count(*) n from profiles where id = '${uid("bu")}'`), 0, "profile gone");
  assert.equal(await count(`select count(*) n from auth.users where id = '${uid("bu")}'`), 0, "auth user gone");
  assert.equal(await count(`select count(*) n from favorites where user_id = ${ida("bu")}`), 0, "own favorites gone");
  assert.equal(await count(`select count(*) n from favorites where user_id = ${ida("bu2")}`), 1, "other user's favorite kept");
  assert.equal(await count(`select count(*) n from tournaments where id = ${T1}`), 1, "tournament kept");
  const tp = await q(`select player_id, player_uuid from tournament_players where tournament_id = ${T1}`);
  assert.deepEqual(tp, [{ player_id: null, player_uuid: "55555555-5555-5555-5555-555555555555" }], "history kept, unlinked");
  const pl = await q(`select profile_id, email, account_status from players where id = '55555555-5555-5555-5555-555555555555'`);
  assert.deepEqual(pl, [{ profile_id: null, email: null, account_status: "DISABLED" }], "player de-identified");
  assert.equal(await count(`select count(*) n from giveaway_entries where giveaway_id = 2`), 1, "giveaway kept; only own entry removed");
});

test("a former (archived) owner can delete; the venue and its current owner are untouched", async () => {
  const r = await as("exown", `select public.delete_user_account()`, [], true);
  assert.ok(r.ok, (r as any).error);
  assert.equal(await count(`select count(*) n from venues where id = ${V1}`), 1);
  assert.equal(await count(`select count(*) n from venue_owners where venue_id = ${V1} and owner_id = ${ida("own")}`), 1);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4. venues INSERT
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("ordinary users (basic, TD, bar owner) and anon cannot insert venues directly", async () => {
  for (const w of ["bu", "td", "own"] as Who[]) {
    denied(await as(w, `insert into venues (venue) values ('Direct') returning id`), `${w} direct insert`);
  }
  denied(await as("anon", `insert into venues (venue) values ('Direct') returning id`), "anon direct insert");
});

test("admins can insert venues directly", async () => {
  allowed(await as("sa", `insert into venues (venue) values ('Admin Venue') returning id`), "super_admin");
  allowed(await as("ca", `insert into venues (venue) values ('Admin Venue') returning id`), "compete_admin");
});

test("the authoritative create_venue RPC still works for bar owners (venue + primary owner), and not for basic users", async () => {
  const payload = JSON.stringify({ venue: "New Hall", address: "9 Main", city: "Lansing", state: "MI", zip_code: "48901" });
  await q("begin");
  await q("select set_config('test.uid', $1, true)", [uid("own2")]);
  await q("set local role authenticated");
  const id = (await q(`select public.create_venue($1::jsonb) as id`, [payload]))[0].id;
  await q("reset role");
  const owner = await q(`select owner_id, is_primary from venue_owners where venue_id = $1`, [id]);
  await q("rollback");
  assert.deepEqual(owner, [{ owner_id: ida("own2"), is_primary: true }]);
  rejectedWith(await as("bu", `select public.create_venue($1::jsonb)`, [payload]), "Only bar owners and admins", "basic_user");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5. venue_tables
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("venue_tables stays publicly readable (anon + signed-in)", async () => {
  allowed(await as("anon", `select id from venue_tables`), "anon read");
  allowed(await as("bu", `select id from venue_tables`), "basic read");
});

test("anon cannot write venue_tables", async () => {
  denied(await as("anon", `insert into venue_tables (venue_id, table_size) values (${V1}, '9ft') returning id`), "anon insert");
  denied(await as("anon", `update venue_tables set quantity = 99 where id = 1 returning id`), "anon update");
  denied(await as("anon", `delete from venue_tables where id = 1 returning id`), "anon delete");
});

test("unrelated signed-in users (basic, TD at the venue, other owner, former owner) cannot write a venue's tables", async () => {
  for (const w of ["bu", "td", "own2", "exown"] as Who[]) {
    denied(await as(w, `insert into venue_tables (venue_id, table_size) values (${V1}, '9ft') returning id`), `${w} insert V1`);
    denied(await as(w, `update venue_tables set quantity = 0 where id = 1 returning id`), `${w} update V1`);
    denied(await as(w, `delete from venue_tables where id = 1 returning id`), `${w} delete V1`);
  }
});

test("the venue owner manages their own venue's tables (create-venue / edit-venue / audit flows)", async () => {
  allowed(await as("own", `insert into venue_tables (venue_id, table_size, brand, quantity) values (${V1}, '8ft', 'Olhausen', 2) returning id`), "insert");
  allowed(await as("own", `update venue_tables set quantity = 5 where id = 1 returning id`), "update");
  allowed(await as("own", `delete from venue_tables where id = 1 returning id`), "delete");
  denied(await as("own", `update venue_tables set quantity = 5 where id = 2 returning id`), "not another venue's table");
  denied(await as("own", `update venue_tables set venue_id = ${V2} where id = 1 returning id`), "cannot move a table to another venue");
});

test("admins manage any venue's tables", async () => {
  for (const w of ["sa", "ca"] as Who[]) {
    allowed(await as(w, `insert into venue_tables (venue_id, table_size) values (${V2}, '9ft') returning id`), `${w} insert`);
    allowed(await as(w, `update venue_tables set quantity = 7 where id = 2 returning id`), `${w} update`);
    allowed(await as(w, `delete from venue_tables where id = 2 returning id`), `${w} delete`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6. create_venue ownership (admin never becomes owner by default)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("admin create_venue with no owner creates the venue and NO ownership row (super + compete)", async () => {
  for (const w of ["sa", "ca"] as Who[]) {
    const r = await createVenueAs(w, "$1::jsonb", [VENUE_JSON]);
    assert.ok(r.ok, (r as any).error);
    assert.ok(r.ok && r.venueExists, `${w}: venue created`);
    assert.deepEqual(r.ok && r.owners, [], `${w}: no owner row (and never the admin)`);
  }
});

test("admin create_venue with an explicit owner assigns that owner (assigned_by = the admin)", async () => {
  const r = await createVenueAs("sa", "$1::jsonb, '{}'::bigint[], $2", [VENUE_JSON, ida("bu2")]);
  assert.ok(r.ok, (r as any).error);
  assert.deepEqual(r.ok && r.owners, [{ owner_id: ida("bu2"), assigned_by: ida("sa"), is_primary: true }]);
  const bad = await createVenueAs("sa", "$1::jsonb, '{}'::bigint[], $2", [VENUE_JSON, 999999]);
  assert.ok(!bad.ok && bad.error.includes("Owner 999999 not found"), "unknown owner rejected");
});

test("bar-owner create_venue is unchanged: the caller becomes primary owner; cannot name someone else", async () => {
  const r = await createVenueAs("own2", "$1::jsonb", [VENUE_JSON]);
  assert.ok(r.ok, (r as any).error);
  assert.deepEqual(r.ok && r.owners, [{ owner_id: ida("own2"), assigned_by: ida("own2"), is_primary: true }]);
  const self = await createVenueAs("own2", "$1::jsonb, '{}'::bigint[], $2", [VENUE_JSON, ida("own2")]);
  assert.ok(self.ok, "naming themselves is fine");
  const other = await createVenueAs("own2", "$1::jsonb, '{}'::bigint[], $2", [VENUE_JSON, ida("bu2")]);
  assert.ok(!other.ok && other.error.includes("only create venues they own"), "owner cannot assign another owner");
});

test("existing 2-argument callers (current app builds) still work; basic users still cannot create venues", async () => {
  const r = await createVenueAs("own", "p_venue => $1::jsonb, p_director_ids => '{}'::bigint[]", [VENUE_JSON]);
  assert.ok(r.ok, (r as any).error);
  const b = await createVenueAs("bu", "$1::jsonb", [VENUE_JSON]);
  assert.ok(!b.ok && b.error.includes("Only bar owners and admins"));
});

test("create_venue is not executable by anon", async () => {
  denied(await as("anon", `select public.create_venue($1::jsonb)`, [VENUE_JSON]), "anon");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7. search_users_for_staff (admins excluded from candidate search by default)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("staff search excludes admin accounts by default — for owners, TDs and admins alike", async () => {
  for (const w of ["own", "td", "sa"] as Who[]) {
    const roles = await staffSearch(w, "sa");
    assert.ok(!roles.includes("super_admin") && !roles.includes("compete_admin"), `${w}: ${roles}`);
  }
  assert.ok((await staffSearch("own", "ow")).includes("bar_owner"), "real staff candidates still found");
});

test("explicit admin self-assignment search works only for an admin caller", async () => {
  assert.ok((await staffSearch("sa", "sa", true)).includes("super_admin"), "admin can explicitly include admins");
  const td = await staffSearch("td", "sa", true);
  assert.ok(!td.includes("super_admin"), "a TD cannot use the flag to list admins");
});

test("staff search is still refused for basic users and anon", async () => {
  const r = await as("bu", `select 1 from public.search_users_for_staff('ow')`);
  assert.ok(!r.ok && r.error.includes("not authorized"));
  denied(await as("anon", `select 1 from public.search_users_for_staff('ow')`), "anon");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Rollback
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("rollback restores the exact baseline (billing re-opened, admin gaps back), then re-apply", async () => {
  await db.exec(ROLLBACK);
  allowed(await as("anon", `select id from venue_subscriptions`), "billing world-readable again");
  denied(await as("sa", `update venues set venue = 'x' where id = ${V2} returning id`), "admin venue gap back");
  allowed(await as("anon", `update venue_tables set quantity = 1 where id = 2 returning id`), "venue_tables open again");
  const oldCv = await createVenueAs("sa", "$1::jsonb", [VENUE_JSON]);
  assert.deepEqual(oldCv.ok && oldCv.owners.map((o: any) => o.owner_id), [ida("sa")], "old create_venue restored");
  assert.ok((await staffSearch("own", "sa")).includes("super_admin"), "old staff search restored");
  allowed(await as("bu", `insert into venues (venue) values ('x') returning id`), "venues insert open again");
  await db.exec(MIGRATION);
  denied(await as("anon", `update venue_tables set quantity = 1 where id = 2 returning id`), "venue_tables closed again");
  denied(await as("bu", `insert into venues (venue) values ('x') returning id`), "venues insert closed again");
  // and the rollback round-trip restored + re-applied the RPCs too
  const cv = await createVenueAs("sa", "$1::jsonb", [VENUE_JSON]);
  assert.deepEqual(cv.ok && cv.owners, [], "admin not auto-owner after re-apply");
  assert.ok(!(await staffSearch("own", "sa")).includes("super_admin"), "admins excluded after re-apply");
  denied(await as("anon", `select id from venue_subscriptions`), "closed again");
  allowed(await as("sa", `update venues set venue = 'x' where id = ${V2} returning id`), "admin access again");
});
