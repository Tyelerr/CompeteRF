// src/utils/__tests__/auth-routing.test.ts
// Run: npx tsx --test src/utils/__tests__/auth-routing.test.ts
// The shared post-auth decision (every sign-in method) + static guards that keep screens off
// the old per-screen routing and keep the native Google library out of the web bundle.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  AUTH_LOAD_ERROR_MESSAGE,
  deriveAuthStatus,
  MIN_PASSWORD_LENGTH,
  newPasswordError,
  postAuthErrorMessage,
  isSocialSignup,
  resolvePostAuthRoute,
} from "../auth-routing";
import type { AuthStatus } from "../../models/types/auth.types";

// ── deriveAuthStatus ────────────────────────────────────────────────────────
test("no session → signedOut", () => {
  assert.equal(deriveAuthStatus({ kind: "noSession" }), "signedOut");
});

test("session + profile → ready", () => {
  assert.equal(deriveAuthStatus({ kind: "loaded", profile: { is_disabled: false } }), "ready");
  assert.equal(deriveAuthStatus({ kind: "loaded", profile: {} }), "ready");
  assert.equal(deriveAuthStatus({ kind: "loaded", profile: { is_disabled: null } }), "ready");
});

test("session + successful load with no profile row → needsProfile", () => {
  assert.equal(deriveAuthStatus({ kind: "loaded", profile: null }), "needsProfile");
});

test("session + disabled profile → disabled (never ready)", () => {
  assert.equal(deriveAuthStatus({ kind: "loaded", profile: { is_disabled: true } }), "disabled");
});

test("session + hydration failure → error, NEVER needsProfile", () => {
  assert.equal(deriveAuthStatus({ kind: "failed" }), "error");
  assert.notEqual(deriveAuthStatus({ kind: "failed" }), "needsProfile");
});

// ── resolvePostAuthRoute ────────────────────────────────────────────────────
test("ready → app; needsProfile → complete-profile", () => {
  assert.deepEqual(resolvePostAuthRoute("ready"), { kind: "app" });
  assert.deepEqual(resolvePostAuthRoute("needsProfile"), { kind: "completeProfile" });
});

test("error / disabled / signedOut / loading stay put — only needsProfile reaches complete-profile", () => {
  const all: AuthStatus[] = ["loading", "signedOut", "needsProfile", "disabled", "ready", "error"];
  for (const s of all) {
    const r = resolvePostAuthRoute(s);
    if (s === "needsProfile") assert.equal(r.kind, "completeProfile");
    else if (s === "ready") assert.equal(r.kind, "app");
    else assert.equal(r.kind, "stay", `${s} must not navigate`);
  }
});

test("a hydration failure end-to-end never routes to complete-profile", () => {
  assert.equal(resolvePostAuthRoute(deriveAuthStatus({ kind: "failed" })).kind, "stay");
  assert.equal(postAuthErrorMessage(deriveAuthStatus({ kind: "failed" })), AUTH_LOAD_ERROR_MESSAGE);
});

test("only the error status surfaces a retry message", () => {
  assert.equal(postAuthErrorMessage("error"), AUTH_LOAD_ERROR_MESSAGE);
  for (const s of ["ready", "needsProfile", "disabled", "signedOut", "loading"] as AuthStatus[]) {
    assert.equal(postAuthErrorMessage(s), null);
  }
});

// ── Static guards ───────────────────────────────────────────────────────────
const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" || n === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) && !n.endsWith(".d.ts") ? [p] : [];
  });
const rel = (f: string) => relative(ROOT, f).split(sep).join("/");

// Sign-in surfaces: routing goes through usePostAuthNavigation, never a per-screen profile lookup.
const SIGN_IN_SURFACES = [
  "src/views/screens/auth/login.screen.tsx",
  "src/views/screens/auth/welcome.screen.tsx",
  "src/viewmodels/useLogin.ts",
  "src/viewmodels/hooks/use.social.sign.in.ts",
];

test("password/username login no longer routes a signed-in user to /auth/register", () => {
  for (const f of [...SIGN_IN_SURFACES, "app/(tabs)/profile.tsx"]) {
    assert.ok(!/router\.replace\(\s*["']\/auth\/register/.test(read(f)), `${f} must not replace() to /auth/register`);
  }
  assert.ok(read("src/viewmodels/useLogin.ts").includes("completeSignIn("), "useLogin uses the shared post-auth step");
});

test("sign-in surfaces do not look up profiles themselves", () => {
  for (const f of SIGN_IN_SURFACES) {
    assert.ok(!/from\(\s*["']profiles["']\s*\)/.test(read(f)), `${f} must not query profiles for routing`);
  }
});

test("the native Google library is imported only by google-signin.provider.native.ts", () => {
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))];
  const offenders = files
    .filter((f) => /@react-native-google-signin\/google-signin/.test(readFileSync(f, "utf8")))
    .map(rel)
    .filter((f) => f !== "src/models/services/google-signin.provider.native.ts");
  assert.deepEqual(offenders, []);
});

test("Google sign-in keeps Supabase nonce verification (raw nonce to Supabase, digest to Google)", () => {
  const svc = read("src/models/services/auth.service.ts");
  const google = svc.slice(svc.indexOf("async signInWithGoogle("), svc.indexOf("async signOut("));
  assert.ok(/getIdToken\(digest\)/.test(google), "Google receives the SHA-256 digest");
  assert.ok(/provider:\s*"google"[\s\S]*nonce:\s*rawNonce/.test(google), "Supabase receives the raw nonce");
  assert.ok(!/from\(\s*["']profiles/.test(google), "no pre-login profile/email lookup");
});

// ── Compete password for provider-created accounts ──────────────────────────
test("isSocialSignup: Apple / Google-created accounts (→ password step when no profile); email signups aren't", () => {
  assert.equal(isSocialSignup({ provider: "apple", providers: ["apple"] }), true);
  assert.equal(isSocialSignup({ provider: "google", providers: ["google"] }), true);
  assert.equal(isSocialSignup({ provider: "email", providers: ["email"] }), false);
  assert.equal(isSocialSignup({ provider: "email", providers: ["email", "google"] }), false);
  assert.equal(isSocialSignup({ provider: "apple" }), true); // providers missing
  assert.equal(isSocialSignup(null), true); // unknown → ask
});

test("new password: registration rules (min length, both entries match)", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(newPasswordError("short", "short") ?? "", /at least 8/);
  assert.equal(newPasswordError("longenough1", "longenough2"), "Passwords do not match");
  assert.equal(newPasswordError("longenough1", "longenough1"), null);
});

test("complete-profile adds the password to the SAME user (updateUser) BEFORE creating the profile", () => {
  const svc = read("src/models/services/auth.service.ts");
  const add = svc.slice(svc.indexOf("async addPasswordToCurrentAccount("), svc.indexOf("async getSession("));
  assert.ok(/supabase\.auth\.updateUser\(\{\s*password\s*\}\)/.test(add), "uses updateUser on the current user");
  assert.ok(!/signUp\(/.test(add), "never creates a second account");

  const screen = read("src/views/screens/auth/complete-profile.screen.tsx");
  const addAt = screen.indexOf("addPasswordToCurrentAccount(");
  const createAt = screen.indexOf("profileService.createProfile(");
  assert.ok(addAt > 0 && createAt > 0 && addAt < createAt, "password step runs before the profile insert");
});
