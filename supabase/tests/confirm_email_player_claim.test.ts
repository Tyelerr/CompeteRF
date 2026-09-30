// supabase/tests/confirm_email_player_claim.test.ts
// Pending-player claim safety when Supabase "Confirm email" is ON, against PGlite with the
// VERBATIM production functions (fixtures/player_claim_functions.prod.sql) and the production
// triggers (auth.users AFTER UPDATE OF email_confirmed_at; profiles AFTER INSERT):
//  • an unconfirmed auth user never claims a PENDING player (even if a profile row appeared);
//  • confirmation alone creates / claims nothing (no profile yet);
//  • the profile insert AFTER confirmation performs the existing claim;
//  • Confirm-email-OFF signups (confirmed at creation) behave exactly as before.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/confirm_email_player_claim.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FNS = readFileSync(join(__dirname, "fixtures", "player_claim_functions.prod.sql"), "utf8");

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
let seq = 0;
const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;

/** A TD-created PENDING player (optionally with a TD-verified Fargo). */
async function pendingPlayer(email: string, fargo: number | null = null): Promise<string> {
  const rows = await q(
    `insert into public.players (display_name, email, account_status, fargo, fargo_verified_by, fargo_last_verified_at)
     values ('Pending Person', $1, 'PENDING', $2, $3, $4) returning id`,
    [email, fargo, fargo ? 7 : null, fargo ? "2026-09-01T00:00:00Z" : null],
  );
  return rows[0].id;
}
/** What Supabase Auth writes on signUp: the user row, confirmed now (Confirm OFF) or not (Confirm ON). */
const authSignUp = (id: string, email: string, confirmed: boolean) =>
  q(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)`, [id, email, confirmed ? new Date().toISOString() : null]);
/** Clicking the emailed link (verifyOtp): Auth sets email_confirmed_at. */
const authConfirm = (id: string) => q(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
/** The app's profile insert (register / Complete Profile). */
const insertProfile = (id: string, email: string) =>
  q(`insert into public.profiles (id, email, name, first_name, last_name) values ($1, $2, 'New Person', 'New', 'Person')`, [id, email]);
const playerById = async (id: string) => (await q(`select * from public.players where id = $1`, [id]))[0];
const playersOwnedBy = async (u: string) => q(`select * from public.players where profile_id = $1`, [u]);

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create table public.profiles (
      id uuid primary key references auth.users(id),
      id_auto bigserial,
      email text unique,
      name text, first_name text, last_name text, phone_number text,
      fargo integer, fargo_status text, fargo_verified_by bigint, fargo_last_verified_at timestamptz
    );
    create table public.players (
      id uuid primary key default gen_random_uuid(),
      display_name text not null, first_name text, last_name text,
      email text, email_normalized text generated always as (lower(btrim(email))) stored,
      phone_e164 text, account_status text not null default 'PENDING',
      profile_id uuid unique references public.profiles(id), activated_at timestamptz,
      fargo integer, fargo_verified_by bigint, fargo_last_verified_at timestamptz
    );
    create unique index players_email_normalized_key on public.players (email_normalized);
    create table public.player_invitations (
      player_id uuid, accepted_at timestamptz, superseded_at timestamptz, revoked_at timestamptz
    );
    -- Links chip/registration rows to the claimed profile in prod; its effect is out of scope here.
    create table public.link_calls (player_id uuid, profile_id uuid);
    create function public._link_claimed_player_rows(p_player uuid, p_profile uuid) returns void
      language sql as $$ insert into public.link_calls values (p_player, p_profile) $$;
  `);
  await db.exec(FNS);
  await db.exec(`
    create trigger on_auth_email_confirmed_claim_player after update of email_confirmed_at on auth.users
      for each row when ((new.email_confirmed_at is not null) and (old.email_confirmed_at is distinct from new.email_confirmed_at))
      execute function public.tg_claim_player_on_email_confirm();
    create trigger on_profile_created_provision_player after insert on public.profiles
      for each row execute function public.tg_provision_player_for_profile();
  `);
});

test("Confirm ON: signUp (unconfirmed, no profile) does not touch a matching PENDING player", async () => {
  const u = uid();
  const p = await pendingPlayer("victim1@example.com");
  await authSignUp(u, "victim1@example.com", false);
  const row = await playerById(p);
  assert.equal(row.profile_id, null);
  assert.equal(row.account_status, "PENDING");
  assert.equal((await playersOwnedBy(u)).length, 0);
});

test("unconfirmed auth user + a profile row (defense in depth) still cannot claim the PENDING player", async () => {
  const u = uid();
  const p = await pendingPlayer("victim2@example.com", 612);
  await authSignUp(u, "victim2@example.com", false);
  await insertProfile(u, "victim2@example.com"); // the app never does this without a session
  const row = await playerById(p);
  assert.equal(row.profile_id, null, "not claimed");
  assert.equal(row.account_status, "PENDING");
  assert.equal((await playersOwnedBy(u)).length, 0, "no player created for an unverified email that matches a pending one");
  const prof = (await q(`select fargo, fargo_status from public.profiles where id = $1`, [u]))[0];
  assert.equal(prof.fargo, null, "pending Fargo not promoted");
});

test("confirmation alone (no profile yet) claims nothing and creates nothing", async () => {
  const u = uid();
  const p = await pendingPlayer("owner3@example.com");
  await authSignUp(u, "owner3@example.com", false);
  await authConfirm(u);
  assert.equal((await playerById(p)).profile_id, null);
  assert.equal((await playerById(p)).account_status, "PENDING");
  assert.equal((await playersOwnedBy(u)).length, 0);

  const lone = uid(); // no pending player for this address
  await authSignUp(lone, "lone3@example.com", false);
  await authConfirm(lone);
  assert.equal((await q(`select count(*)::int n from public.players where email_normalized = 'lone3@example.com'`))[0].n, 0);
});

test("profile insert AFTER confirmation performs the existing claim (incl. TD-verified Fargo)", async () => {
  const u = uid();
  const p = await pendingPlayer("owner4@example.com", 655);
  await authSignUp(u, "owner4@example.com", false);
  await authConfirm(u);
  await insertProfile(u, "owner4@example.com");
  const row = await playerById(p);
  assert.equal(row.profile_id, u);
  assert.equal(row.account_status, "ACTIVE");
  const prof = (await q(`select fargo, fargo_status from public.profiles where id = $1`, [u]))[0];
  assert.equal(prof.fargo, 655);
  assert.equal(prof.fargo_status, "verified");
  assert.equal((await q(`select count(*)::int n from public.link_calls where profile_id = $1`, [u]))[0].n, 1);
});

test("confirmed user with no pending player gets a fresh ACTIVE player on profile insert", async () => {
  const u = uid();
  await authSignUp(u, "fresh5@example.com", false);
  await authConfirm(u);
  await insertProfile(u, "fresh5@example.com");
  const owned = await playersOwnedBy(u);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].account_status, "ACTIVE");
});

test("Confirm OFF (today): confirmed at signUp → profile insert claims exactly as before", async () => {
  const u = uid();
  const p = await pendingPlayer("today6@example.com");
  await authSignUp(u, "today6@example.com", true);
  await insertProfile(u, "today6@example.com");
  const row = await playerById(p);
  assert.equal(row.profile_id, u);
  assert.equal(row.account_status, "ACTIVE");
});

test("a player already owned by another account is never re-claimed", async () => {
  const owner = uid();
  await authSignUp(owner, "taken7@example.com", true);
  await insertProfile(owner, "taken7@example.com");
  const other = uid();
  await authSignUp(other, "other7@example.com", false);
  await q(`update auth.users set email = 'taken7@example.com' where id = $1`, [other]); // same address on another user
  await authConfirm(other);
  const owned = await q(`select profile_id from public.players where email_normalized = 'taken7@example.com'`);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].profile_id, owner);
});
