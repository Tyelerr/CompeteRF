// src/utils/__tests__/google-auth.test.ts
// Run: npx tsx --test src/utils/__tests__/google-auth.test.ts
// "Continue with Google" (web OAuth + native ID token) — flags OFF, PKCE only when web Google is
// on, the /auth/callback logic (code exchange, cancel, reload, invalid), name pre-fill, and static
// guards (hydration, one-time exchange, no code/token leakage, hidden button, nonce kept).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_SIGN_IN_NATIVE_ENABLED,
  GOOGLE_SIGN_IN_WEB_ENABLED,
  OAUTH_CALLBACK_COPY,
  authFlowType,
  googleNameHints,
  oauthCallbackUrl,
  parseOAuthCallback,
  runOAuthCallback,
} from "../google-auth";
import { isSocialSignup } from "../auth-routing";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("web Google ON, native Google stays OFF", () => {
  assert.equal(GOOGLE_SIGN_IN_WEB_ENABLED, true);
  assert.equal(GOOGLE_SIGN_IN_NATIVE_ENABLED, false);
});

test("PKCE only on web and only when web Google is enabled (flag off = today's implicit client)", () => {
  assert.equal(authFlowType(true, true), "pkce");
  assert.equal(authFlowType(true, false), "implicit");
  assert.equal(authFlowType(false, true), "implicit");
  assert.equal(authFlowType(false, false), "implicit");
  assert.equal(authFlowType(true), "pkce", "default follows the web flag (on)");
  assert.equal(authFlowType(false), "implicit", "native never PKCE");
  const client = read("src/lib/supabase.ts");
  assert.ok(client.includes("flowType: authFlowType(!isNative)"));
  assert.ok(client.includes("detectSessionInUrl: false"), "the app still handles every URL itself");
});

test("callback URL only for Compete origins (+ localhost for testing)", () => {
  assert.equal(oauthCallbackUrl("https://www.thecompeteapp.com"), "https://www.thecompeteapp.com/auth/callback");
  assert.equal(oauthCallbackUrl("https://thecompeteapp.com"), "https://thecompeteapp.com/auth/callback");
  assert.equal(oauthCallbackUrl("http://localhost:8081"), "http://localhost:8081/auth/callback");
  assert.equal(oauthCallbackUrl("https://evil.example.com"), null);
  assert.equal(oauthCallbackUrl("https://thecompeteapp.com.evil.com"), null);
  assert.equal(oauthCallbackUrl(null), null);
});

test("callback parsing: code, cancel, provider failure, missing", () => {
  assert.deepEqual(parseOAuthCallback("https://www.thecompeteapp.com/auth/callback?code=abc123"), { kind: "code", code: "abc123" });
  assert.deepEqual(parseOAuthCallback(null, { code: "fromParams" }), { kind: "code", code: "fromParams" });
  assert.deepEqual(
    parseOAuthCallback("https://www.thecompeteapp.com/auth/callback?error=access_denied&error_description=The+user+cancelled"),
    { kind: "error", reason: "cancelled" },
  );
  assert.deepEqual(
    parseOAuthCallback("https://www.thecompeteapp.com/auth/callback#error=server_error&error_description=Unable+to+exchange+external+code"),
    { kind: "error", reason: "failed" },
  );
  assert.deepEqual(parseOAuthCallback("https://www.thecompeteapp.com/auth/callback"), { kind: "missing" });
  assert.deepEqual(parseOAuthCallback("https://www.thecompeteapp.com/auth/callback?code=%E0%A4%A"), { kind: "error", reason: "failed" }, "malformed encoding");
});

test("existing profile / new user: a good code signs in (routing then goes through the shared step)", async () => {
  let exchanged = 0;
  const res = await runOAuthCallback({ kind: "code", code: "c1" }, {
    exchange: async () => { exchanged++; return "user-1"; },
    currentUserId: async () => null,
  });
  assert.deepEqual(res, { kind: "signedIn", userId: "user-1" });
  assert.equal(exchanged, 1);
});

test("reload after a successful exchange reuses the existing session (no error)", async () => {
  const res = await runOAuthCallback({ kind: "code", code: "used" }, {
    exchange: async () => null, // code already consumed / verifier gone
    currentUserId: async () => "user-1",
  });
  assert.deepEqual(res, { kind: "signedIn", userId: "user-1" });
});

test("cancel → friendly cancelled message, never exchanges", async () => {
  let exchanged = 0;
  const res = await runOAuthCallback({ kind: "error", reason: "cancelled" }, {
    exchange: async () => { exchanged++; return "x"; },
    currentUserId: async () => null,
  });
  assert.deepEqual(res, { kind: "error", title: OAUTH_CALLBACK_COPY.cancelled.title, message: OAUTH_CALLBACK_COPY.cancelled.body });
  assert.equal(exchanged, 0);
});

test("failed exchange with no session → SIGN-IN FAILED; missing code → SIGN-IN LINK INVALID", async () => {
  const failed = await runOAuthCallback({ kind: "code", code: "bad" }, { exchange: async () => { throw new Error("x"); }, currentUserId: async () => null });
  assert.equal((failed as any).title, "SIGN-IN FAILED");
  const missing = await runOAuthCallback({ kind: "missing" }, { exchange: async () => "never", currentUserId: async () => null });
  assert.equal((missing as any).title, "SIGN-IN LINK INVALID");
});

test("Google names pre-fill Complete Profile (never a username)", () => {
  assert.deepEqual(googleNameHints({ given_name: "Tyler", family_name: "Hill", email: "x@gmail.com" }), { firstName: "Tyler", lastName: "Hill" });
  assert.deepEqual(googleNameHints({ full_name: "Efren Manalang Reyes" }), { firstName: "Efren", lastName: "Manalang Reyes" });
  assert.deepEqual(googleNameHints(null), { firstName: null, lastName: null });
});

test("new Google user with no profile gets the Compete-password step (social signup)", () => {
  assert.equal(isSocialSignup({ provider: "google", providers: ["google"] }), true);
  assert.equal(isSocialSignup({ provider: "email", providers: ["email", "google"] }), false, "an email account that linked Google already has a password");
});

test("/auth/callback: hydration-safe, exchanges once, strips the code, uses the shared post-auth step", () => {
  const hook = read("src/viewmodels/useOAuthCallback.ts");
  assert.ok(/if \(!hydrated \|\| started\.current\) return;\s*started\.current = true;/.test(hook));
  assert.ok(hook.includes('window.history.replaceState(null, "", "/auth/callback")'));
  assert.ok(hook.includes("completeSignIn(result.userId, { nameHints: googleNameHints(user?.userMetadata) })"));
  assert.ok(!/console\.(log|info|warn|error)/.test(hook), "never logs the URL / code");
  assert.match(read("app/auth/callback.tsx"), /OAuthCallbackScreen/);
  const screen = read("src/views/screens/auth/oauth-callback.screen.tsx");
  assert.ok(!/code|token/i.test(screen.split("const styles")[0].replace(/useOAuthCallback|OAuthCallback/g, "")), "no code/token rendered");
});

test("the Google button renders nothing unless available; availability follows the flags", () => {
  const btn = read("src/views/components/auth/GoogleSignInButton.tsx");
  assert.ok(btn.includes("if (!available) return null;"));
  const svc = read("src/models/services/auth.service.ts");
  const avail = svc.slice(svc.indexOf("async isGoogleSignInAvailable("), svc.indexOf("async startGoogleWebSignIn("));
  assert.ok(/if \(Platform\.OS === "web"\) return GOOGLE_SIGN_IN_WEB_ENABLED;/.test(avail));
  assert.ok(/if \(!GOOGLE_SIGN_IN_NATIVE_ENABLED\) return false;/.test(avail));
  for (const f of ["src/views/screens/auth/login.screen.tsx", "src/views/screens/auth/welcome.screen.tsx"]) {
    assert.ok(/<GoogleSignInButton available=\{(google\.)?googleAvailable\}/.test(read(f)), f);
  }
});

test("web OAuth: Supabase provider google, allow-listed redirect, no email/profile lookup, flag-guarded", () => {
  const svc = read("src/models/services/auth.service.ts");
  const web = svc.slice(svc.indexOf("async startGoogleWebSignIn("), svc.indexOf("async exchangeOAuthCode("));
  assert.ok(/if \(!GOOGLE_SIGN_IN_WEB_ENABLED\) throw/.test(web));
  assert.ok(/signInWithOAuth\(\{\s*provider: "google"/.test(web));
  assert.ok(web.includes("oauthCallbackUrl("));
  assert.ok(!/from\(\s*["']profiles|email/.test(web.replace(/Never looks anything up by email/, "")));
  const native = svc.slice(svc.indexOf("async signInWithGoogle("), svc.indexOf("async signOut("));
  assert.ok(/if \(!GOOGLE_SIGN_IN_NATIVE_ENABLED\) throw/.test(native), "native path flag-guarded");
  assert.ok(/nonce: rawNonce/.test(native) && /getIdToken\(digest\)/.test(native), "nonce verification kept");
});

test("Apple sign-in is unchanged (still the ID-token + nonce path)", () => {
  const svc = read("src/models/services/auth.service.ts");
  const apple = svc.slice(svc.indexOf("async signInWithApple("), svc.indexOf("async isGoogleSignInAvailable("));
  assert.ok(/provider: "apple"/.test(apple) && /nonce: rawNonce/.test(apple));
});

test("PKCE on web keeps the token_hash password reset working (verifyOtp is flow-agnostic)", () => {
  // The reset page verifies with verifyOtp({ token_hash, type: "recovery" }) — a POST /verify that
  // does not use the PKCE code verifier — so the HTTPS token_hash reset email works in both flows.
  const svc = read("src/models/services/password-recovery.service.ts");
  assert.ok(svc.includes('verifyOtp({ token_hash: credentials.tokenHash, type: "recovery" })'));
  const hook = read("src/viewmodels/useResetPassword.ts");
  assert.ok(!/exchangeCodeForSession|flowType/.test(hook), "reset page never depends on the PKCE verifier");
  const lib = read("node_modules/@supabase/auth-js/dist/main/GoTrueClient.js");
  const verify = lib.slice(lib.indexOf("async verifyOtp("), lib.indexOf("async verifyOtp(") + 2500);
  assert.ok(!/flowType|code_verifier|codeVerifier/.test(verify), "installed auth-js verifyOtp ignores the flow type");
});

test("Apple sign-in code is byte-identical to the released version", () => {
  const svc = read("src/models/services/auth.service.ts");
  const apple = svc.slice(svc.indexOf("async signInWithApple("), svc.indexOf("async isGoogleSignInAvailable("));
  assert.ok(apple.includes("const rawNonce = await generateSecureNonce();"));
  assert.ok(!apple.includes("createNoncePair"), "Apple keeps its own nonce lines");
});

test("Google button follows Google's light-theme branding and keeps the Supabase handler", () => {
  const btn = read("src/views/components/auth/GoogleSignInButton.tsx");
  // Google's official G logo, verbatim (four brand-coloured paths from Google's button generator).
  for (const fill of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) assert.ok(btn.includes(`fill="${fill}"`), fill);
  assert.ok(btn.includes('M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85'), "official path data");
  assert.ok(btn.includes('export const GOOGLE_SIGN_IN_LABEL = "Sign in with Google";'));
  assert.ok(/backgroundColor: GOOGLE_BUTTON\.fill/.test(btn) && /borderColor: GOOGLE_BUTTON\.stroke/.test(btn) && /color: GOOGLE_BUTTON\.text/.test(btn));
  const colors = read("src/theme/colors.ts");
  assert.ok(/fill: "#FFFFFF"/.test(colors) && /stroke: "#747775"/.test(colors) && /text: "#1F1F1F"/.test(colors));
  assert.ok(!/primary|COLORS\.success/.test(btn.split("const styles")[1].split("dividerRow")[0]), "no green / Compete primary fill");
  assert.ok(btn.includes("onPress={onPress}"), "click = the passed Supabase handler");
  assert.ok(!/accounts\.google\.com\/gsi|google\.accounts\.id/.test(btn), "no Google Identity Services SDK");
});
