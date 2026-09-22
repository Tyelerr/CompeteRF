// supabase/tests/push_token_owner.test.ts
// SQL tests for supabase/migrations/20260925120000_push_token_single_owner.sql against PGlite,
// with the real prod push_tokens shape + RLS policy ("Users manage own push tokens"). The
// registration flow is the app's exact one (notificationService.registerPushToken): delete
// other accounts' rows for the token (RLS-limited), then upsert (user_id, token) active.
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/push_token_owner.test.ts
/// <reference types="node" />

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = readFileSync(join(__dirname, "..", "migrations", "20260925120000_push_token_single_owner.sql"), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const IPHONE = "ExponentPushToken[iphone]";
const IPAD = "ExponentPushToken[ipad]";

let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const active = async (token: string) =>
  (await q("select user_id from push_tokens where token = $1 and is_active order by user_id", [token])).map((r: any) => r.user_id);

/** The app's registerPushToken, executed AS the signed-in user under RLS. */
async function register(uid: string, token: string) {
  await q("begin");
  await q("select set_config('test.uid', $1, true)", [uid]);
  await q("set local role authenticated");
  await q("delete from push_tokens where token = $1 and user_id <> $2", [token, uid]); // RLS: no-op for others
  await q(
    `insert into push_tokens (user_id, token, device_type, is_active, updated_at) values ($1, $2, 'ios', true, now())
     on conflict (user_id, token) do update set is_active = true, updated_at = now()`,
    [uid, token],
  );
  await q("commit");
}
/** Device-scoped sign-out (the proposed client change): remove ONLY this device's row. */
async function signOutDevice(uid: string, token: string) {
  await q("begin");
  await q("select set_config('test.uid', $1, true)", [uid]);
  await q("set local role authenticated");
  await q("delete from push_tokens where user_id = $1 and token = $2", [uid, token]);
  await q("commit");
}

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key);
    insert into public.profiles values ('${A}'), ('${B}'), ('${C}');
    create table public.push_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      token text not null, device_type text check (device_type = any (array['ios','android','web'])),
      is_active boolean not null default true,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique (user_id, token));
    alter table public.push_tokens enable row level security;
    create policy "Users manage own push tokens" on public.push_tokens for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    grant select, insert, update, delete on public.push_tokens to authenticated;
    -- pre-migration prod state: one iPhone token active under A, B and C (C newest)
    insert into public.push_tokens (user_id, token, device_type, updated_at) values
      ('${A}', '${IPHONE}', 'ios', now() - interval '3 days'),
      ('${B}', '${IPHONE}', 'ios', now() - interval '2 days'),
      ('${C}', '${IPHONE}', 'ios', now() - interval '1 day'),
      ('${A}', '${IPAD}', 'ios', now() - interval '5 days');
  `);
});

test("BEFORE the fix: the app's own registration cannot remove other accounts (RLS) — token stays shared", async () => {
  await register(A, IPHONE);
  assert.deepEqual(await active(IPHONE), [A, B, C]);
});

test("migration cleanup: shared token keeps ONLY its most recently registered owner; other devices untouched", async () => {
  await db.exec(MIG);
  assert.deepEqual(await active(IPHONE), [A]); // A registered last (previous test)
  assert.deepEqual(await active(IPAD), [A]);
  assert.equal((await q("select count(*)::int n from push_tokens"))[0].n, 4, "deactivated, not deleted");
});

test("account switch on the same phone moves the token to the new account (unchanged client code)", async () => {
  await register(B, IPHONE);
  assert.deepEqual(await active(IPHONE), [B]);
  await register(C, IPHONE);
  assert.deepEqual(await active(IPHONE), [C]);
  await register(A, IPHONE); // A signs back in → A owns it again
  assert.deepEqual(await active(IPHONE), [A]);
});

test("one account on several devices keeps every device active", async () => {
  await register(A, IPHONE);
  await register(A, IPAD);
  assert.deepEqual(await active(IPHONE), [A]);
  assert.deepEqual(await active(IPAD), [A]);
});

test("device-scoped sign-out removes only that device; the account's other devices keep push", async () => {
  await signOutDevice(A, IPHONE);
  assert.deepEqual(await active(IPHONE), []);
  assert.deepEqual(await active(IPAD), [A]);
  await register(B, IPHONE); // next account on that phone
  assert.deepEqual(await active(IPHONE), [B]);
});

test("invariant enforced: at most one active owner per token, even for a direct write", async () => {
  // a single statement re-activating the token for several accounts is refused outright…
  await assert.rejects(q("update push_tokens set is_active = true where token = $1", [IPHONE]));
  assert.deepEqual(await active(IPHONE), [B]);
  // …and one-at-a-time re-activation just moves ownership
  await q("update push_tokens set is_active = true where token = $1 and user_id = $2", [IPHONE, C]);
  assert.deepEqual(await active(IPHONE), [C]);
  assert.equal((await q("select count(*)::int n from (select token from push_tokens where is_active group by token having count(*) > 1) x"))[0].n, 0);
});

test("trigger function is not callable by clients", async () => {
  for (const role of ["anon", "authenticated"])
    assert.equal((await q("select has_function_privilege($1, 'public._push_tokens_single_owner()', 'execute') ok", [role]))[0].ok, false);
});
