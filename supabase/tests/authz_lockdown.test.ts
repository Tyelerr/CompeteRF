// supabase/tests/authz_lockdown.test.ts
// Adversarial + regression tests for the Phase 1 authorization hardening:
//   supabase/migrations/20260930120000_authz_rpcs.sql        (M1, additive RPCs)
//   supabase/migrations/20260930130000_authz_write_lockdown.sql (M2, lockdown)
// PGlite, with the EXACT prod policies/functions replayed from the M0 capture
// (supabase/rollback/20260930110000_authz_baseline_capture.sql), not local assumptions.
// Every attack is first shown to SUCCEED on the baseline, then shown to FAIL after M1+M2.
// Requests run as the real PostgREST roles (SET LOCAL ROLE authenticated/anon) with auth.uid()
// stubbed from a GUC, like the other suites.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/authz_lockdown.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const BASELINE = readFileSync(join(ROOT, "supabase/rollback/20260930110000_authz_baseline_capture.sql"), "utf8");
const M1 = readFileSync(join(ROOT, "supabase/migrations/20260930120000_authz_rpcs.sql"), "utf8");
// M2 is parked in supabase/pending/ until approved; read it from wherever it currently lives.
const M2_FILE = "20260930130000_authz_write_lockdown.sql";
const M2 = readFileSync(join(ROOT, existsSync(join(ROOT, "supabase/migrations", M2_FILE)) ? "supabase/migrations" : "supabase/pending", M2_FILE), "utf8");
const M2_ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20260930130000_authz_write_lockdown_rollback.sql"), "utf8");

// ── identities (uuid, id_auto) ─────────────────────────────────────────────────────────────────
const U = {
  sa: ["00000000-0000-0000-0000-0000000000a1", 1],      // super_admin
  sa2: ["00000000-0000-0000-0000-0000000000a2", 2],     // super_admin
  ca: ["00000000-0000-0000-0000-0000000000c1", 3],      // compete_admin
  own: ["00000000-0000-0000-0000-0000000000b1", 10],    // bar_owner of V1
  own2: ["00000000-0000-0000-0000-0000000000b2", 11],   // bar_owner of V2
  td: ["00000000-0000-0000-0000-0000000000d1", 20],     // TD at V1, directs T1
  td2: ["00000000-0000-0000-0000-0000000000d2", 21],    // TD at V2, directs T2
  bu: ["00000000-0000-0000-0000-0000000000e1", 30],     // basic_user
  bu2: ["00000000-0000-0000-0000-0000000000e2", 31],    // basic_user
  manual: ["00000000-0000-0000-0000-0000000000f1", 40], // tournament_director with no ties (manual grant)
  fresh: ["00000000-0000-0000-0000-0000000000f9", 0],   // signs up during the tests (no profile yet)
} as const;
type Who = keyof typeof U;
const uid = (w: Who) => U[w][0] as string;
const ida = (w: Who) => U[w][1] as number;
const V1 = 1, V2 = 2, V3 = 3; // V3 has NO owner (like most prod venues)
const T1 = 100, T2 = 200;

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

type Res = { ok: true; rows: any[] } | { ok: false; error: string };
/** Run statements as a PostgREST user. Commits on success when commit=true, else always rolls back. */
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
const allowed = (r: Res, msg: string) => assert.ok(r.ok, `${msg} — expected success, got: ${(r as any).error}`);
/** Denied = raised (RLS / guard / RPC authz / privilege) OR matched no rows (RLS USING). AUTHZ_DEBUG=1 prints why. */
const denied = (r: Res, msg: string) => {
  if (process.env.AUTHZ_DEBUG) console.log("DENIED", msg, "=>", r.ok ? "0 rows" : r.error);
  assert.ok(!r.ok || r.rows.length === 0, `${msg} — expected denial, but it succeeded: ${JSON.stringify((r as any).rows)}`);
};
const roleOf = async (w: Who) => (await q("select role from profiles where id = $1", [uid(w)]))[0]?.role;

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  const prof = (w: Who, role: string, name: string) =>
    `('${uid(w)}', ${ida(w)}, '${w}@x.test', '${name}', '${w}', 'MI', '${role}')`;
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

    -- ── prod table shapes (columns the policies/functions/app touch) ──
    create table public.profiles (
      id uuid primary key, id_auto bigint generated by default as identity unique,
      email text not null, name text not null, user_name text not null, home_state text not null,
      first_name text, last_name text, avatar_url text, preferred_game text, favorite_player text,
      role text not null default 'basic_user'
        check (role = any (array['basic_user','tournament_director','bar_owner','compete_admin','super_admin'])),
      status text default 'active' check (status = any (array['active','suspended','banned','deleted'])),
      is_disabled boolean not null default false,
      deleted_at timestamptz, deleted_by integer,
      fargo integer, fargo_status text not null default 'unverified',
      last_active_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.venues (
      id serial primary key, venue text not null, address text not null, city text not null, state text not null,
      zip_code text not null, phone text, latitude numeric, longitude numeric, google_place_id text,
      status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.venue_owners (
      id serial primary key, venue_id integer not null references venues(id), owner_id integer not null references profiles(id_auto),
      assigned_by integer references profiles(id_auto), assigned_at timestamptz default now(),
      archived_at timestamptz, archived_by integer references profiles(id_auto), is_primary boolean default false,
      unique (venue_id, owner_id));
    create table public.venue_directors (
      id serial primary key, venue_id integer not null references venues(id), director_id integer not null references profiles(id_auto),
      assigned_by integer references profiles(id_auto), assigned_at timestamptz default now(),
      archived_at timestamptz, archived_by integer references profiles(id_auto),
      unique (venue_id, director_id));
    create table public.tournament_templates (
      id serial primary key, venue_id integer, director_id integer not null, name text, description text, description_es text,
      game_type text, tournament_format text, game_spot text, race text, table_size text, equipment text, number_of_tables integer,
      start_time text, entry_fee numeric, added_money numeric, side_pots jsonb, max_fargo integer, required_fargo_games integer,
      reports_to_fargo boolean, open_tournament boolean, phone_number text, thumbnail text, chip_ranges jsonb, calcutta boolean,
      status text default 'active', recurrence_type text, recurrence_day text, recurrence_week integer, horizon_days integer default 30,
      series_start_date date, series_end_date date, archived_at timestamptz);
    create table public.tournaments (
      id serial primary key, venue_id integer, director_id integer not null, template_id integer, parent_template_id integer,
      name text, description text, description_es text, game_type text, tournament_format text, game_spot text, race text,
      table_size text, equipment text, number_of_tables integer, tournament_date date, start_time text, timezone text,
      entry_fee numeric, added_money numeric, side_pots jsonb, max_fargo integer, required_fargo_games integer,
      reports_to_fargo boolean, open_tournament boolean, phone_number text, thumbnail text, is_recurring boolean,
      status text default 'active', chip_ranges jsonb, calcutta boolean, live_state text, live_settings jsonb);
    create table public.conversations (
      id uuid primary key default gen_random_uuid(), created_by uuid not null, subject text, category text,
      tournament_id integer, is_support boolean default false, created_at timestamptz default now());
    create table public.conversation_participants (
      conversation_id uuid not null references conversations(id), user_id uuid not null, last_read_at timestamptz,
      primary key (conversation_id, user_id));
    create table public.conversation_messages (
      id serial primary key, conversation_id uuid not null references conversations(id), sender_id uuid not null, body text);

    -- prod grants: Supabase defaults (ALL to anon/authenticated) + RLS enabled, not forced
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    alter table public.profiles enable row level security;
    alter table public.venue_owners enable row level security;
    alter table public.venue_directors enable row level security;
    alter table public.tournaments enable row level security;
    alter table public.tournament_templates enable row level security;

    -- is_venue_owner must exist before the baseline's policies reference it (replaced verbatim below)
    create function public.is_venue_owner(p_venue_id integer) returns boolean language sql stable security definer
      as $$ select false $$;

    -- ── seed (runs as the superuser = service role, like the real data) ──
    insert into profiles (id, id_auto, email, name, user_name, home_state, role) values
      ${prof("sa", "super_admin", "Super")}, ${prof("sa2", "super_admin", "Super Two")}, ${prof("ca", "compete_admin", "Compete Admin")},
      ${prof("own", "bar_owner", "Owner One")}, ${prof("own2", "bar_owner", "Owner Two")},
      ${prof("td", "tournament_director", "TD One")}, ${prof("td2", "tournament_director", "TD Two")},
      ${prof("bu", "basic_user", "Basic One")}, ${prof("bu2", "basic_user", "Basic Two")},
      ${prof("manual", "tournament_director", "Manual TD")};
    insert into venues (id, venue, address, city, state, zip_code) values
      (${V1}, 'Venue One', '1 A St', 'Lansing', 'MI', '48901'),
      (${V2}, 'Venue Two', '2 B St', 'Lansing', 'MI', '48901'),
      (${V3}, 'Unowned Venue', '3 C St', 'Lansing', 'MI', '48901');
    select setval('venues_id_seq', 10);
    insert into venue_owners (venue_id, owner_id, assigned_by, is_primary) values
      (${V1}, ${ida("own")}, ${ida("sa")}, true), (${V2}, ${ida("own2")}, ${ida("sa")}, true);
    insert into venue_directors (venue_id, director_id, assigned_by) values
      (${V1}, ${ida("td")}, ${ida("own")}), (${V2}, ${ida("td2")}, ${ida("own2")});
    insert into tournaments (id, venue_id, director_id, name, status) values
      (${T1}, ${V1}, ${ida("td")}, 'T1', 'active'), (${T2}, ${V2}, ${ida("td2")}, 'T2', 'active');
    select setval('tournaments_id_seq', 1000);
  `);
  // Replay the EXACT prod policies + functions (M0 capture).
  await db.exec(BASELINE);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// BASELINE — prove each hole is real on the captured prod definitions (all rolled back)
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("BASELINE: basic_user can promote self to super_admin", async () => {
  allowed(await as("bu", "update profiles set role = 'super_admin' where id = $1 returning id", [uid("bu")]), "self-promote");
});
test("BASELINE: bar_owner can edit an unrelated profile's role", async () => {
  const r = await as("own", "update profiles set role = 'super_admin' where id = $1 returning id", [uid("bu2")]);
  assert.ok(r.ok && r.rows.length === 1, "bar owner wrote another user's role");
});
test("BASELINE: any user can claim ownership of an unowned venue / direct any venue", async () => {
  allowed(await as("bu", "insert into venue_owners (venue_id, owner_id) values ($1, $2) returning id", [V3, ida("bu")]), "claim owner");
  allowed(await as("bu", "insert into venue_directors (venue_id, director_id) values ($1, $2) returning id", [V2, ida("bu")]), "claim director");
});
test("BASELINE: TD can create a tournament at an unrelated venue and move theirs anywhere", async () => {
  allowed(await as("td", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V2, ida("td")]), "foreign insert");
  const r = await as("td", "update tournaments set venue_id = $1 where id = $2 returning id", [V3, T1]);
  assert.ok(r.ok && r.rows.length === 1, "moved tournament");
});
test("BASELINE: template bypass + generator callable by anon; conversation creator spoofable", async () => {
  allowed(await as("bu", "insert into tournament_templates (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V3, ida("bu")]), "template");
  allowed(await as("anon", "select has_function_privilege('anon', 'public.generate_recurring_tournaments()', 'execute') ok"), "probe");
  assert.equal((await q("select has_function_privilege('anon', 'public.generate_recurring_tournaments()', 'execute') ok"))[0].ok, true);
  allowed(await as("bu", "select public.create_conversation_with_participants($1, 's', 'general', null, false, $2, 'hi') id", [uid("bu2"), uid("td")]), "spoof");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Apply M1 + M2
// ════════════════════════════════════════════════════════════════════════════════════════════════

test("M1 then M2 apply cleanly on the prod baseline", async () => {
  await db.exec(M1);
  await db.exec(M2);
});

// ── 1. profiles self-escalation ─────────────────────────────────────────────────────────────────
test("#1 basic_user cannot promote self (any privileged role)", async () => {
  for (const r of ["super_admin", "compete_admin", "bar_owner", "tournament_director"])
    denied(await as("bu", "update profiles set role = $2 where id = $1 returning id", [uid("bu"), r]), `self → ${r}`);
  assert.equal(await roleOf("bu"), "basic_user");
});
test("#2 basic_user cannot change own status / is_disabled / deleted_*", async () => {
  await q("update profiles set status = 'suspended', is_disabled = true where id = $1", [uid("bu2")]); // admin-applied sanction
  denied(await as("bu2", "update profiles set status = 'active' where id = $1 returning id", [uid("bu2")]), "unsuspend self");
  denied(await as("bu2", "update profiles set is_disabled = false where id = $1 returning id", [uid("bu2")]), "undisable self");
  denied(await as("bu", "update profiles set deleted_at = now() where id = $1 returning id", [uid("bu")]), "deleted_at");
  await q("update profiles set status = 'active', is_disabled = false where id = $1", [uid("bu2")]);
});
test("#3 new profile cannot be inserted with a privileged role/status; the normal sign-up insert works", async () => {
  const cols = "id, email, name, user_name, home_state";
  const vals = `'${uid("fresh")}', 'f@x.test', 'Fresh', 'fresh', 'MI'`;
  // `as` needs the uid to be "fresh"
  const run = async (sql: string) => {
    await q("begin");
    try {
      await q("select set_config('test.uid', $1, true)", [uid("fresh")]);
      await q("set local role authenticated");
      const rows = await q(sql);
      await q("rollback");
      return { ok: true, rows } as Res;
    } catch (e: any) { await q("rollback"); return { ok: false, error: String(e.message) } as Res; }
  };
  denied(await run(`insert into profiles (${cols}, role) values (${vals}, 'super_admin') returning id`), "insert as super_admin");
  denied(await run(`insert into profiles (${cols}, is_disabled) values (${vals}, true) returning id`), "insert disabled");
  denied(await run(`insert into profiles (${cols}, status) values (${vals}, 'banned') returning id`), "insert banned");
  allowed(await run(`insert into profiles (${cols}, first_name, status) values (${vals}, 'Fresh', 'active') returning id`), "register.screen insert");
  allowed(await run(`insert into profiles (${cols}) values (${vals}) returning id`), "complete-profile insert");
});
test("#4 basic_user can still edit allowed own fields (useEditProfile / pingLastActive)", async () => {
  allowed(await as("bu", `update profiles set name = 'Basic Renamed', first_name = 'B', last_name = 'R', home_state = 'OH',
    favorite_player = 'Efren', preferred_game = '9-ball', avatar_url = 'x.png', updated_at = now(), last_active_at = now()
    where id = $1 returning id`, [uid("bu")], true), "own edit");
  allowed(await as("bu", "update profiles set role = role, name = name where id = $1 returning id", [uid("bu")]), "unchanged role is fine");
});
test("#5 anon cannot write profiles at all", async () => {
  denied(await as("anon", "update profiles set role = 'super_admin' returning id"), "anon update");
  denied(await as("anon", `insert into profiles (id, email, name, user_name, home_state) values (gen_random_uuid(), 'a', 'a', 'a', 'MI') returning id`), "anon insert");
});

// ── 2. bar-owner profile writes ─────────────────────────────────────────────────────────────────
test("#6 bar_owner cannot edit an unrelated profile (name or role)", async () => {
  denied(await as("own", "update profiles set role = 'super_admin' where id = $1 returning id", [uid("bu2")]), "role");
  denied(await as("own", "update profiles set name = 'pwned' where id = $1 returning id", [uid("bu2")]), "name");
});
test("#7 bar_owner adds a basic user as director of OWN venue → recompute promotes to TD", async () => {
  allowed(await as("own", "insert into venue_directors (venue_id, director_id, assigned_by) values ($1, $2, $3) returning id",
    [V1, ida("bu"), ida("own")], true), "link");
  const r = await as("own", "select public.recompute_user_role($1) role", [ida("bu")], true);
  allowed(r, "recompute");
  assert.equal(await roleOf("bu"), "tournament_director");
});
test("#8 bar_owner adds a co-owner to OWN venue → recompute gives bar_owner; adding a bar_owner as director no longer demotes", async () => {
  allowed(await as("own", "insert into venue_owners (venue_id, owner_id, assigned_by) values ($1, $2, $3) returning id",
    [V1, ida("bu2"), ida("own")], true), "co-owner link");
  allowed(await as("own", "select public.recompute_user_role($1)", [ida("bu2")], true), "recompute");
  assert.equal(await roleOf("bu2"), "bar_owner");
  // old client bug: promoteRole(…, 'tournament_director') demoted an existing bar_owner added as director
  allowed(await as("own", "insert into venue_directors (venue_id, director_id, assigned_by) values ($1, $2, $3) returning id",
    [V1, ida("own2"), ida("own")], true), "bar owner as director");
  allowed(await as("own", "select public.recompute_user_role($1)", [ida("own2")], true), "recompute");
  assert.equal(await roleOf("own2"), "bar_owner");
});
test("#9 bar_owner cannot recompute (e.g. demote) a user with no tie to their venues", async () => {
  denied(await as("own", "select public.recompute_user_role($1)", [ida("manual")]), "unrelated recompute");
  assert.equal(await roleOf("manual"), "tournament_director");
  denied(await as("bu", "select public.recompute_user_role($1)", [ida("td2")]), "basic user recompute of other");
  denied(await as("anon", "select public.recompute_user_role($1)", [ida("td2")]), "anon");
});

// ── 3. venue_owners / venue_directors ───────────────────────────────────────────────────────────
test("#10 user cannot insert themselves as owner of any venue (owned, unowned, or via another owner)", async () => {
  for (const v of [V1, V2, V3])
    denied(await as("bu", "insert into venue_owners (venue_id, owner_id) values ($1, $2) returning id", [v, ida("bu")]), `owner of ${v}`);
  denied(await as("td", "insert into venue_owners (venue_id, owner_id) values ($1, $2) returning id", [V1, ida("td")]), "TD self-owner at own venue");
  denied(await as("own2", "insert into venue_owners (venue_id, owner_id) values ($1, $2) returning id", [V1, ida("own2")]), "owner of V2 → V1");
});
test("#11 user cannot insert/update/reactivate themselves as director of an unrelated venue", async () => {
  denied(await as("td2", "insert into venue_directors (venue_id, director_id) values ($1, $2) returning id", [V3, ida("td2")]), "insert V3");
  denied(await as("td2", "insert into venue_directors (venue_id, director_id) values ($1, $2) returning id", [V1, ida("td2")]), "insert V1");
  await q("update venue_directors set archived_at = now() where venue_id = $1 and director_id = $2", [V2, ida("td2")]);
  denied(await as("td2", "update venue_directors set archived_at = null where venue_id = $1 and director_id = $2 returning id", [V2, ida("td2")]), "self-reactivate");
  denied(await as("td2", `insert into venue_directors (venue_id, director_id) values ($1, $2)
    on conflict (venue_id, director_id) do update set archived_at = null returning id`, [V2, ida("td2")]), "upsert reactivate");
  await q("update venue_directors set archived_at = null where venue_id = $1 and director_id = $2", [V2, ida("td2")]);
});
test("#12 owner cannot move a venue_directors row onto a venue they don't own", async () => {
  denied(await as("own", "update venue_directors set venue_id = $1 where venue_id = $2 and director_id = $3 returning id",
    [V2, V1, ida("td")]), "move row V1→V2");
});
test("#13 owner manages own venue team: archive, restore, reactivate-upsert, hard delete via RPC", async () => {
  allowed(await as("own", "update venue_directors set archived_at = now(), archived_by = $3 where venue_id = $1 and director_id = $2 returning id",
    [V1, ida("td"), ida("own")], true), "archive (useEditVenue/useMyDirectors/director.service)");
  allowed(await as("own", "update venue_directors set archived_at = null, archived_by = null where venue_id = $1 and director_id = $2 returning id",
    [V1, ida("td")], true), "restore");
  allowed(await as("own", `insert into venue_directors (venue_id, director_id, assigned_by) values ($1, $2, $3)
    on conflict (venue_id, director_id) do update set assigned_by = excluded.assigned_by returning id`, [V1, ida("td"), ida("own")], true), "upsert (useVenueTeam/reassign)");
  // hard delete of the co-owner added in #8 → re-derived to basic_user
  const row = (await q("select id from venue_owners where venue_id = $1 and owner_id = $2", [V1, ida("bu2")]))[0].id;
  const r = await as("own", "select public.remove_venue_team_member('owner', $1) role", [row], true);
  allowed(r, "remove co-owner");
  assert.equal(await roleOf("bu2"), "basic_user");
  // primary owner protected; another venue's owner can't use it; basic user can't
  const primary = (await q("select id from venue_owners where venue_id = $1 and is_primary", [V1]))[0].id;
  denied(await as("own", "select public.remove_venue_team_member('owner', $1)", [primary]), "primary owner");
  const tdRow = (await q("select id from venue_directors where venue_id = $1 and director_id = $2", [V1, ida("td")]))[0].id;
  denied(await as("own2", "select public.remove_venue_team_member('director', $1)", [tdRow]), "other venue's owner");
  denied(await as("bu", "select public.remove_venue_team_member('director', $1)", [tdRow]), "basic user");
});

// ── 4. tournaments / templates ──────────────────────────────────────────────────────────────────
test("#14 unrelated TD cannot create a tournament at another venue", async () => {
  denied(await as("td", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V2, ida("td")]), "V2");
  denied(await as("td", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V3, ida("td")]), "unowned V3");
  denied(await as("bu", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V1, ida("bu2")]), "basic user");
});
test("#15 authorized TD / owner can create at their venue as themselves (submit + drafts)", async () => {
  allowed(await as("td", "insert into tournaments (venue_id, director_id, name, status) values ($1, $2, 'TD submit', 'active') returning id", [V1, ida("td")]), "TD @ V1");
  allowed(await as("own", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'Owner draft') returning id", [V1, ida("own")]), "owner @ V1");
});
test("#16 TD cannot create at their venue on someone else's behalf", async () => {
  denied(await as("td", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V1, ida("bu2")]), "other director");
  denied(await as("own", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V1, ida("td")]), "owner as TD (old owner branch)");
});
test("#17 TD cannot move own tournament to an unrelated venue; can move to another venue they manage", async () => {
  denied(await as("td", "update tournaments set venue_id = $1 where id = $2 returning id", [V2, T1]), "→ V2");
  denied(await as("td", "update tournaments set venue_id = $1 where id = $2 returning id", [V3, T1]), "→ V3");
  await q("insert into venue_directors (venue_id, director_id, assigned_by) values ($1, $2, $3)", [V3, ida("td"), ida("sa")]);
  allowed(await as("td", "update tournaments set venue_id = $1 where id = $2 returning id", [V3, T1]), "→ V3 once assigned there");
  await q("delete from venue_directors where venue_id = $1 and director_id = $2", [V3, ida("td")]);
});
test("#18 TD removed from the venue can still save live state on their own event", async () => {
  await q("update venue_directors set archived_at = now() where venue_id = $1 and director_id = $2", [V1, ida("td")]);
  allowed(await as("td", `update tournaments set live_state = 'in_progress', live_settings = '{"x":1}', name = 'T1 renamed'
    where id = $1 returning id`, [T1]), "live save");
  await q("update venue_directors set archived_at = null where venue_id = $1 and director_id = $2", [V1, ida("td")]);
});
test("#19 bar_owner reassigns director on own venue's tournament; not elsewhere; TD can't reassign", async () => {
  allowed(await as("own", "update tournaments set director_id = $1 where id = $2 returning id", [ida("bu"), T1]), "owner reassign @ V1");
  denied(await as("own2", "update tournaments set director_id = $1 where id = $2 returning id", [ida("own2"), T1]), "other owner");
  denied(await as("td", "update tournaments set director_id = $1 where id = $2 returning id", [ida("bu"), T1]), "TD hands off");
  denied(await as("td2", "update tournaments set director_id = $1 where id = $2 returning id", [ida("td2"), T1]), "TD grabs");
});
test("#20 template bypass closed: insert at unrelated venue / retarget own template", async () => {
  denied(await as("bu", "insert into tournament_templates (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V3, ida("bu")]), "basic user");
  denied(await as("td", "insert into tournament_templates (venue_id, director_id, name) values ($1, $2, 'x') returning id", [V2, ida("td")]), "TD @ V2");
  const own = await as("td", "insert into tournament_templates (venue_id, director_id, name) values ($1, $2, 'weekly') returning id", [V1, ida("td")], true);
  allowed(own, "TD @ own venue (useSubmitTournament recurring)");
  allowed(await as("own", "insert into tournament_templates (venue_id, director_id, name) values ($1, $2, 'owner weekly') returning id", [V1, ida("own")]),
    "bar owner (previously only via the permissive policy)");
  const tid = (own as any).rows[0].id;
  denied(await as("td", "update tournament_templates set venue_id = $1 where id = $2 returning id", [V2, tid]), "retarget template");
  allowed(await as("td", "update tournament_templates set name = 'weekly v2', status = 'active' where id = $1 returning id", [tid]), "normal template edit");
});
test("#21 generate_recurring_tournaments: not callable by anon/authenticated; cron (postgres) still runs it", async () => {
  for (const role of ["anon", "authenticated"])
    assert.equal((await q("select has_function_privilege($1, 'public.generate_recurring_tournaments()', 'execute') ok", [role]))[0].ok, false, role);
  denied(await as("bu", "select * from public.generate_recurring_tournaments()"), "authenticated call");
  await q(`insert into tournament_templates (venue_id, director_id, name, status, recurrence_type, recurrence_day, series_start_date, horizon_days)
           values ($1, $2, 'cron weekly', 'active', 'weekly', 'monday', current_date, 14)`, [V1, ida("td")]);
  const before = (await q("select count(*)::int n from tournaments"))[0].n;
  await q("select * from public.generate_recurring_tournaments()");
  assert.ok((await q("select count(*)::int n from tournaments"))[0].n > before, "cron generated tournaments");
});
test("#22 admins (super + compete) can create at any venue for any director (bulk import)", async () => {
  allowed(await as("sa", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'bulk') returning id", [V3, ida("td2")]), "super_admin");
  allowed(await as("ca", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'bulk') returning id", [V2, ida("td")]), "compete_admin");
  allowed(await as("sa", "update tournaments set venue_id = $1, director_id = $2 where id = $3 returning id", [V3, ida("bu"), T2]), "admin move+reassign");
});

// ── 5. conversations ────────────────────────────────────────────────────────────────────────────
test("#23 conversation creator cannot be spoofed", async () => {
  denied(await as("bu", "select public.create_conversation_with_participants($1, 's', 'general', null, false, $2, 'hi') id", [uid("bu2"), uid("td")]), "spoof as bu2");
  denied(await as("bu", "select public.create_conversation_with_participants($1, 's', 'general', null, true, null, 'hi') id", [uid("sa")]), "spoof support as admin");
  denied(await as("bu", "select public.create_conversation_with_participants($1, 's', 'general', null, false, $1, 'hi') id", [uid("bu")]), "self-conversation");
});
test("#24 legitimate conversation creation still works (direct, support, review reply)", async () => {
  const direct = await as("bu", "select public.create_conversation_with_participants($1, 'Q', 'general', null, false, $2, 'hello TD') id", [uid("bu"), uid("td")], true);
  allowed(direct, "player → TD");
  const cid = (direct as any).rows[0].id;
  assert.deepEqual((await q("select user_id from conversation_participants where conversation_id = $1 order by user_id", [cid])).map((r: any) => r.user_id).sort(),
    [uid("bu"), uid("td")].sort());
  assert.equal((await q("select sender_id from conversation_messages where conversation_id = $1", [cid]))[0].sender_id, uid("bu"));
  const support = await as("bu", "select public.create_conversation_with_participants($1, 'Help', 'general', null, true, null, 'help') id", [uid("bu")], true);
  allowed(support, "support");
  assert.equal((await q("select count(*)::int n from conversation_participants where conversation_id = $1", [(support as any).rows[0].id]))[0].n, 1 + 3,
    "creator + all 3 admins");
  allowed(await as("td", "select public.create_conversation_with_participants($1, 'Re', 'review', $3, false, $2, 'thanks') id", [uid("td"), uid("bu"), T1]), "review reply");
});
test("#25 anon cannot call the conversation RPC", async () => {
  denied(await as("anon", "select public.create_conversation_with_participants($1, 's', 'general', null, false, $2, 'x') id", [uid("bu"), uid("td")]), "anon");
});

// ── admin RPCs ──────────────────────────────────────────────────────────────────────────────────
test("#26 compete_admin: only non-admin targets and non-admin roles", async () => {
  denied(await as("ca", "select public.admin_update_user($1, 'x', 'x', 'x', 'super_admin', 'active')", [uid("bu")]), "grant super_admin");
  denied(await as("ca", "select public.admin_update_user($1, 'x', 'x', 'x', 'compete_admin', 'active')", [uid("bu")]), "grant compete_admin");
  denied(await as("ca", "select public.admin_update_user($1, 'x', 'x', 'x', 'basic_user', 'active')", [uid("sa")]), "demote super_admin");
  allowed(await as("ca", "select public.admin_update_user($1, 'Manual TD', 'Manual', 'TD', 'basic_user', 'active')", [uid("manual")], true), "TD → basic");
  assert.equal(await roleOf("manual"), "basic_user");
  allowed(await as("ca", "select public.admin_update_user($1, 'Manual TD', 'Manual', 'TD', 'tournament_director', 'suspended')", [uid("manual")], true), "suspend");
  denied(await as("own", "select public.admin_update_user($1, 'x', 'x', 'x', 'basic_user', 'active')", [uid("manual")]), "bar owner");
  denied(await as("bu", "select public.admin_update_user($1, 'x', 'x', 'x', 'super_admin', 'active')", [uid("bu")]), "basic user self");
});
test("#27 super_admin: can't change own role/status; can't remove the last super_admin; can edit own name", async () => {
  denied(await as("sa", "select public.admin_update_user($1, 'S', 'S', 'A', 'basic_user', 'active')", [uid("sa")]), "own role");
  denied(await as("sa", "select public.admin_update_user($1, 'S', 'S', 'A', 'super_admin', 'suspended')", [uid("sa")]), "own status");
  allowed(await as("sa", "select public.admin_update_user($1, 'Super Renamed', 'Super', 'Renamed', 'super_admin', 'active')", [uid("sa")]), "own name");
  allowed(await as("sa", "select public.admin_update_user($1, 'x', 'x', 'x', 'basic_user', 'active')", [uid("sa2")]), "demote OTHER super (another remains)");
  // sa2 disabled → sa is the last ACTIVE super_admin; sa2 (still super, but inactive) cannot remove sa
  await q("update profiles set is_disabled = true where id = $1", [uid("sa2")]);
  denied(await as("sa2", "select public.admin_update_user($1, 'x', 'x', 'x', 'basic_user', 'active')", [uid("sa")]), "demote last active super");
  denied(await as("sa2", "select public.admin_set_user_disabled($1, true)", [uid("sa")]), "disable last active super");
  denied(await as("sa2", "select public.admin_soft_delete_user($1)", [uid("sa")]), "delete last active super");
  await q("update profiles set is_disabled = false where id = $1", [uid("sa2")]);
});
test("#28 disable / soft-delete: admins only, never self; writes the right columns", async () => {
  denied(await as("own", "select public.admin_set_user_disabled($1, true)", [uid("bu")]), "bar owner disable");
  denied(await as("bu", "select public.admin_soft_delete_user($1)", [uid("bu2")]), "basic user delete");
  denied(await as("sa", "select public.admin_set_user_disabled($1, true)", [uid("sa")]), "self disable");
  denied(await as("sa", "select public.admin_soft_delete_user($1)", [uid("sa")]), "self delete");
  denied(await as("ca", "select public.admin_set_user_disabled($1, true)", [uid("sa")]), "compete disables super");
  allowed(await as("ca", "select public.admin_set_user_disabled($1, true)", [uid("bu2")], true), "disable");
  assert.equal((await q("select is_disabled from profiles where id = $1", [uid("bu2")]))[0].is_disabled, true);
  allowed(await as("ca", "select public.admin_set_user_disabled($1, false)", [uid("bu2")], true), "enable");
  allowed(await as("sa", "select public.admin_soft_delete_user($1)", [uid("bu2")], true), "soft delete");
  const row = (await q("select status, deleted_by, deleted_at is not null d from profiles where id = $1", [uid("bu2")]))[0];
  assert.deepEqual([row.status, Number(row.deleted_by), row.d], ["deleted", ida("sa"), true]);
  await q("update profiles set status = 'active', deleted_at = null, deleted_by = null where id = $1", [uid("bu2")]);
});
test("#29 create_venue: bar_owner/admin only; atomically venue + primary owner + directors + recompute", async () => {
  denied(await as("bu", "select public.create_venue($1::jsonb, '{}')", [JSON.stringify({ venue: "X", address: "a", city: "c", state: "MI", zip_code: "1" })]), "basic user");
  denied(await as("td2", "select public.create_venue($1::jsonb, '{}')", [JSON.stringify({ venue: "X", address: "a", city: "c", state: "MI", zip_code: "1" })]), "TD");
  denied(await as("own2", "select public.create_venue($1::jsonb, '{}')", [JSON.stringify({ venue: "", address: "a", city: "c", state: "MI", zip_code: "1" })]), "validation");
  const r = await as("own2", "select public.create_venue($1::jsonb, $2::bigint[]) id",
    [JSON.stringify({ venue: "New Hall", address: "9 Z St", city: "Flint", state: "MI", zip_code: "48502", phone: "", latitude: 43.0, longitude: -83.7 }), [ida("bu2")]], true);
  allowed(r, "own2 creates");
  const vid = (r as any).rows[0].id;
  assert.deepEqual((await q("select owner_id, is_primary from venue_owners where venue_id = $1", [vid])).map((x: any) => [Number(x.owner_id), x.is_primary]), [[ida("own2"), true]]);
  assert.equal((await q("select count(*)::int n from venue_directors where venue_id = $1 and director_id = $2", [vid, ida("bu2")]))[0].n, 1);
  assert.equal(await roleOf("bu2"), "tournament_director", "director promoted by recompute");
  assert.equal(await roleOf("own2"), "bar_owner");
  // venue_tables-style follow-up (client) and team management on the NEW venue work for its owner
  allowed(await as("own2", "insert into tournaments (venue_id, director_id, name) values ($1, $2, 'first') returning id", [vid, ida("own2")]), "owner can submit there");
  // admin-created venue: admin becomes owner (existing behavior), role untouched
  allowed(await as("sa", "select public.create_venue($1::jsonb, '{}') id", [JSON.stringify({ venue: "Admin Hall", address: "a", city: "c", state: "MI", zip_code: "1" })], true), "admin");
  assert.equal(await roleOf("sa"), "super_admin");
});
test("#30 recompute matrix matches role.service.ts exactly", async () => {
  // owner → bar_owner
  assert.equal((await as("own", "select public.recompute_user_role($1) r", [ida("own")])).ok && await roleOf("own"), "bar_owner");
  // owner archived but still directs → TD
  await q("update venue_owners set archived_at = now() where owner_id = $1", [ida("own2")]);
  const r1 = await as("own2", "select public.recompute_user_role($1) r", [ida("own2")], true);
  allowed(r1, "self recompute");
  assert.equal((r1 as any).rows[0].r, "tournament_director"); // own2 directs V1 (#8)
  await q("update venue_owners set archived_at = null where owner_id = $1", [ida("own2")]);
  await q("select public._recompute_user_role($1)", [ida("own2")]);
  assert.equal(await roleOf("own2"), "bar_owner");
  // only an active tournament → TD; nothing → basic_user
  await q("update venue_directors set archived_at = now() where director_id = $1", [ida("td2")]);
  await q("update tournaments set director_id = $1 where id = $2", [ida("td2"), T2]);
  assert.equal((await q("select public._recompute_user_role($1) r", [ida("td2")]))[0].r, "tournament_director");
  await q("update tournaments set status = 'completed' where director_id = $1", [ida("td2")]);
  assert.equal((await q("select public._recompute_user_role($1) r", [ida("td2")]))[0].r, "basic_user");
  // admin untouched even with no ties
  assert.equal((await q("select public._recompute_user_role($1) r", [ida("sa2")]))[0].r, "super_admin");
  // internal function is not client-callable
  for (const role of ["anon", "authenticated"])
    assert.equal((await q("select has_function_privilege($1, 'public._recompute_user_role(bigint)', 'execute') ok", [role]))[0].ok, false);
});
test("#31 M3 NOT applied: profile SELECT surface unchanged (anon still reads active rows — deferred to M3)", async () => {
  const r = await as("anon", "select id, email from profiles where status = 'active' limit 1");
  allowed(r, "anon read");
  assert.equal((r as any).rows.length, 1);
});
test("rollback restores the exact baseline hole set (then re-apply M2)", async () => {
  await db.exec(M2_ROLLBACK);
  allowed(await as("bu", "update profiles set role = 'super_admin' where id = $1 returning id", [uid("bu")]), "hole back after rollback");
  allowed(await as("bu", "insert into venue_owners (venue_id, owner_id) values ($1, $2) returning id", [V3, ida("bu")]), "venue hole back");
  assert.equal((await q("select has_function_privilege('anon', 'public.generate_recurring_tournaments()', 'execute') ok"))[0].ok, true);
  await db.exec(M2);
  denied(await as("bu", "update profiles set role = 'super_admin' where id = $1 returning id", [uid("bu")]), "closed again");
});
