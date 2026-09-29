// src/utils/__tests__/username-login.test.ts
// Run: npx tsx --test src/utils/__tests__/username-login.test.ts
// login-with-username Edge Function core (supabase/functions/_shared/username_login.ts):
// the email is resolved server-side and NEVER returned; every failure is the same generic
// error (no username / email enumeration); only session tokens come back.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_LOGIN_ERROR, handleUsernameLogin } from "../../../supabase/functions/_shared/username_login";

const EMAIL = "someone@example.com";
const session = {
  access_token: "at", refresh_token: "rt", expires_in: 3600, expires_at: 1, token_type: "bearer",
  user: { id: "u1", email: EMAIL }, // what supabase returns — must NOT be forwarded
};
const deps = (over: Partial<Parameters<typeof handleUsernameLogin>[1]> = {}) => ({
  resolveEmail: async (u: string) => (u === "GoodUser" ? EMAIL : null),
  signIn: async (e: string, p: string) =>
    e === EMAIL && p === "right" ? { session: session as any, error: null } : { session: null, error: new Error("Invalid login credentials") },
  ...over,
});

test("success returns only the session tokens — never the email or user object", async () => {
  const r = await handleUsernameLogin({ username: " GoodUser ", password: "right" }, deps());
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(EMAIL), "email never leaves the server");
  assert.ok(!text.includes('"user"'));
  assert.deepEqual(Object.keys((r.body as any).session).sort(), ["access_token", "expires_at", "expires_in", "refresh_token", "token_type"]);
});

test("unknown username and wrong password return the SAME generic error (no enumeration)", async () => {
  const unknown = await handleUsernameLogin({ username: "Nobody", password: "right" }, deps());
  const wrong = await handleUsernameLogin({ username: "GoodUser", password: "nope" }, deps());
  assert.deepEqual([unknown.status, wrong.status], [401, 401]);
  assert.deepEqual(unknown.body, { error: GENERIC_LOGIN_ERROR });
  assert.deepEqual(wrong.body, unknown.body);
});

test("bad input (missing fields, emails, oversized) is rejected before any lookup", async () => {
  let lookups = 0;
  const d = deps({ resolveEmail: async () => { lookups++; return EMAIL; } });
  for (const input of [null, {}, { username: "GoodUser" }, { password: "right" }, { username: EMAIL, password: "right" }, { username: "x".repeat(41), password: "right" }, { username: 5, password: "right" }]) {
    const r = await handleUsernameLogin(input, d);
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: GENERIC_LOGIN_ERROR });
  }
  assert.equal(lookups, 0);
});

test("lookup failure is a 500 with no detail; a session without tokens is treated as failure", async () => {
  const r = await handleUsernameLogin({ username: "GoodUser", password: "right" }, deps({ resolveEmail: async () => { throw new Error("db down: details"); } }));
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes("details"));
  const noTok = await handleUsernameLogin({ username: "GoodUser", password: "right" }, deps({ signIn: async () => ({ session: { access_token: "", refresh_token: "" } as any, error: null }) }));
  assert.equal(noTok.status, 401);
});
