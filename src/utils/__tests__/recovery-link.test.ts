// src/utils/__tests__/recovery-link.test.ts
// Run: npx tsx --test src/utils/__tests__/recovery-link.test.ts
// Password-recovery deep links: every format Supabase can hand the app, cold start vs a link that
// arrives while the app is running (app/+native-intent.tsx), the Continue gate, and that normal
// deep links are untouched. Pure logic from src/utils/recovery-link.ts + static guards.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RECOVERY_ERROR_COPY,
  RECOVERY_ERROR_MESSAGES,
  resetSuccessCopy,
  continueRecovery,
  describeRecoveryLink,
  recoveryDebugInfo,
  isRecoveryUrl,
  linkKey,
  parseRecoveryLink,
  phaseForLink,
  recoveryRouteFor,
  routeIncomingLink,
} from "../recovery-link";
import { useRecoveryLinkStore } from "../../viewmodels/stores/recovery-link.store";

const AT = "eyJhbGciOiJIUzI1NiJ9.recovery-access.sig";
const RT = "v1-refresh-abc123";
// Supabase default (implicit) redirect after its /verify endpoint — tokens in the #fragment:
const HASH_LINK = `competerf://reset-password#access_token=${AT}&expires_at=1790000000&expires_in=3600&refresh_token=${RT}&token_type=bearer&type=recovery`;
const TOKEN_HASH_LINK = "https://www.thecompeteapp.com/reset-password?token_hash=pkce_abc123&type=recovery";
const EXPIRED_LINK = "competerf://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

const fakeEstablish = () => {
  const calls: unknown[] = [];
  const fn = async (c: unknown) => {
    calls.push(c);
    return { ok: true, expired: false, error: null };
  };
  return { fn, calls };
};

// ── 1 & 2: cold start vs already running go through the same capture path ────────────────────
test("1. cold start from a valid recovery link: captured (with #fragment) and routed to /reset-password", () => {
  const captured: string[] = [];
  const routed = routeIncomingLink(HASH_LINK, (u) => captured.push(u)); // initial: true
  assert.equal(routed, "/reset-password");
  assert.deepEqual(captured, [HASH_LINK], "the full raw URL incl. tokens is kept for the screen");
  const link = parseRecoveryLink(captured[0]);
  assert.equal(link.status, "credentials");
});

test("2. link received while the app is already running: same capture, and the store announces a NEW link", () => {
  useRecoveryLinkStore.setState({ url: null, seq: 0 });
  const capture = (u: string) => useRecoveryLinkStore.getState().capture(u);
  routeIncomingLink(HASH_LINK, capture); // e.g. an earlier link
  const firstSeq = useRecoveryLinkStore.getState().seq;
  const routed = routeIncomingLink(TOKEN_HASH_LINK, capture); // initial: false — app already open
  assert.equal(routed, "/reset-password");
  assert.equal(useRecoveryLinkStore.getState().url, TOKEN_HASH_LINK);
  assert.equal(useRecoveryLinkStore.getState().seq, firstSeq + 1, "a new link restarts the flow");
  useRecoveryLinkStore.getState().clear();
  assert.equal(useRecoveryLinkStore.getState().url, null);
});

// ── 3 & 4: supported formats ──────────────────────────────────────────────────────────────────
test("3. #-style access_token + refresh_token link → session credentials", () => {
  assert.deepEqual(parseRecoveryLink(HASH_LINK), {
    status: "credentials",
    credentials: { kind: "session", accessToken: AT, refreshToken: RT },
  });
});

test("4. token_hash + type=recovery (query string or router params) → token_hash credentials", () => {
  assert.deepEqual(parseRecoveryLink(TOKEN_HASH_LINK), { status: "credentials", credentials: { kind: "token_hash", tokenHash: "pkce_abc123" } });
  assert.deepEqual(parseRecoveryLink(null, { token_hash: "th_1", type: "recovery" }), {
    status: "credentials", credentials: { kind: "token_hash", tokenHash: "th_1" },
  });
  assert.deepEqual(parseRecoveryLink("competerf://reset-password?code=pkce-code-1"), {
    status: "credentials", credentials: { kind: "code", code: "pkce-code-1" },
  });
  assert.deepEqual(parseRecoveryLink(TOKEN_HASH_LINK.replace("type=recovery", "type=signup")), {
    status: "error", reason: "wrong_type", detail: "signup",
  });
});

// ── 5–7: missing / malformed / expired ────────────────────────────────────────────────────────
test("5. missing credentials (the reported bug state) → clear 'missing' error, not a spinner", () => {
  for (const url of [null, "competerf://reset-password", "competerf://reset-password?", "competerf://reset-password#"]) {
    const link = parseRecoveryLink(url);
    assert.deepEqual(link, { status: "error", reason: "missing" }, String(url));
    const phase = phaseForLink(link);
    assert.equal(phase.kind, "error");
    assert.equal(phase.kind === "error" && phase.message, RECOVERY_ERROR_MESSAGES.missing);
  }
});

test("6. malformed link → 'malformed' error (incomplete tokens, garbage encoding)", () => {
  assert.equal((parseRecoveryLink(`competerf://reset-password#access_token=${AT}&type=recovery`) as any).reason, "malformed");
  assert.equal((parseRecoveryLink(`competerf://reset-password#refresh_token=${RT}`) as any).reason, "malformed");
  // undecodable escapes don't throw
  assert.doesNotThrow(() => parseRecoveryLink("competerf://reset-password#access_token=%E0%A4%A&refresh_token=%%"));
});

test("7. expired / already-used link (Supabase #error=… or a failed verification) → 'expired'", () => {
  const link = parseRecoveryLink(EXPIRED_LINK);
  assert.deepEqual(link, { status: "error", reason: "expired", detail: "otp_expired" });
  assert.match((phaseForLink(link) as any).message, /expired or was already used/);
});

test("7b. verification that fails as expired/used after Continue → 'expired' error", async () => {
  const phase = phaseForLink(parseRecoveryLink(HASH_LINK));
  const next = await continueRecovery(phase, async () => ({ ok: false, expired: true, error: "Token has expired or is invalid" }));
  assert.deepEqual(next, { kind: "error", reason: "expired", title: "RESET LINK EXPIRED", message: RECOVERY_ERROR_MESSAGES.expired });
  const thrown = await continueRecovery(phase, async () => { throw new Error("network"); });
  assert.equal(thrown.kind, "error");
});

// ── 8 & 9: Continue gate and success ──────────────────────────────────────────────────────────
test("8. nothing is verified when a link arrives — only the Continue action verifies", async () => {
  const { fn, calls } = fakeEstablish();
  const phase = phaseForLink(parseRecoveryLink(HASH_LINK));
  assert.equal(phase.kind, "awaiting_continue");
  assert.equal(calls.length, 0, "arriving/parsing never calls the service");
  await continueRecovery(phase, fn);
  assert.equal(calls.length, 1, "Continue verifies exactly once");
  // Continue on a non-awaiting phase is a no-op
  await continueRecovery({ kind: "ready" }, fn);
  await continueRecovery(phaseForLink(parseRecoveryLink(EXPIRED_LINK)), fn);
  assert.equal(calls.length, 1);
});

test("9. successful verification reaches the Set New Password step (phase 'ready')", async () => {
  for (const url of [HASH_LINK, TOKEN_HASH_LINK]) {
    const { fn, calls } = fakeEstablish();
    const next = await continueRecovery(phaseForLink(parseRecoveryLink(url)), fn);
    assert.deepEqual(next, { kind: "ready" });
    assert.equal(calls.length, 1);
  }
});

// ── 10: normal deep links untouched ───────────────────────────────────────────────────────────
test("10. normal app deep links are returned unchanged and nothing is captured", () => {
  const others = [
    "competerf://join/abc123",
    "https://www.thecompeteapp.com/join/abc123",
    "https://thecompeteapp.com/r/TYLER1",
    "competerf://tournament/2810",
    "competerf://profile?checkin=1#section",
    "exp://192.168.1.5:8081/--/billiards",
    "/(tabs)/admin/manage-tournament/2810",
    "competerf://reset-password-help", // look-alike path
  ];
  for (const url of others) {
    const captured: string[] = [];
    assert.equal(routeIncomingLink(url, (u) => captured.push(u)), url, url);
    assert.deepEqual(captured, [], url);
    assert.equal(recoveryRouteFor(url), null, url);
  }
  for (const url of [HASH_LINK, TOKEN_HASH_LINK, "competerf://auth/reset-password#error=x", "exp://10.0.0.2:8081/--/reset-password?token_hash=a", "competerf:///reset-password"]) {
    assert.equal(isRecoveryUrl(url), true, url);
  }
});

// ── safety ────────────────────────────────────────────────────────────────────────────────────
test("the debug summary never contains token values", () => {
  const info = describeRecoveryLink(HASH_LINK);
  assert.ok(!info.includes(AT) && !info.includes(RT), info);
  assert.match(info, /access_token=present · refresh_token=present/);
  assert.match(describeRecoveryLink(EXPIRED_LINK), /error=otp_expired/);
});

test("link identity changes per link but not per re-render", () => {
  assert.equal(linkKey(parseRecoveryLink(HASH_LINK)), linkKey(parseRecoveryLink(HASH_LINK)));
  assert.notEqual(linkKey(parseRecoveryLink(HASH_LINK)), linkKey(parseRecoveryLink(TOKEN_HASH_LINK)));
});

// ── static guards ─────────────────────────────────────────────────────────────────────────────
const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("+native-intent routes every native deep link through routeIncomingLink (cold + running)", () => {
  const src = read("app/+native-intent.tsx");
  assert.match(src, /export function redirectSystemPath\(/);
  assert.ok(src.includes("routeIncomingLink(path,"), "single path for initial and subsequent links");
  assert.ok(!/initial\s*[?&|=]/.test(src.replace(/initial: boolean/, "")), "does not branch on initial");
  assert.ok(/catch \{\s*return path;/.test(src), "never breaks normal deep linking");
});

test("the reset viewmodel verifies only in handleContinue, and not from getInitialURL alone", () => {
  const src = read("src/viewmodels/useResetPassword.ts");
  const effects = src.split("useEffect(").slice(1).join("\n");
  assert.ok(!/establishRecoverySession|verifyOtp|setSession|exchangeCodeForSession/.test(effects.split("return {")[0].split("const handleContinue")[0]),
    "no verification inside effects");
  assert.ok(/const handleContinue = useCallback\(async \(\) => \{[\s\S]*continueRecovery\(/.test(src));
  assert.ok(src.includes("useRecoveryLinkStore((s) => s.url)"), "reads the captured link");
  assert.ok(src.includes("Linking.useURL()"), "also follows links that arrive while running (web / fallback)");
});

test("detectSessionInUrl stays false (native parses recovery links itself)", () => {
  assert.match(read("src/lib/supabase.ts"), /detectSessionInUrl: false/);
});

// ── UX cleanup: wording, success copy, secrets, and the literal "•" regression ─────────────

test("expired / already-used link → RESET LINK EXPIRED with the exact copy", () => {
  const phase = phaseForLink(parseRecoveryLink(EXPIRED_LINK)) as any;
  assert.equal(phase.title, "RESET LINK EXPIRED");
  assert.equal(phase.message, "This password reset link has expired or was already used.\n\nPlease request a new password reset email and use the newest link.");
  assert.deepEqual(RECOVERY_ERROR_COPY.expired, { title: phase.title, body: phase.message });
});

test("no recovery credentials at all → RESET LINK INVALID (missing information)", () => {
  const phase = phaseForLink(parseRecoveryLink("competerf://reset-password")) as any;
  assert.equal(phase.title, "RESET LINK INVALID");
  assert.equal(phase.message, "This password reset link is missing the information needed to continue.\n\nPlease request a new password reset email and use the newest link.");
});

test("malformed / incomplete / wrong-type credentials → RESET LINK INVALID (incomplete or invalid)", () => {
  for (const url of [
    `competerf://reset-password#access_token=${AT}&type=recovery`,
    TOKEN_HASH_LINK.replace("type=recovery", "type=signup"),
  ]) {
    const phase = phaseForLink(parseRecoveryLink(url)) as any;
    assert.equal(phase.title, "RESET LINK INVALID", url);
    assert.equal(phase.message, "This password reset link is incomplete or invalid.\n\nPlease request a new password reset email.", url);
  }
});

test("the old generic 'No reset token was received' copy is gone", () => {
  const all = JSON.stringify(RECOVERY_ERROR_COPY) + read("src/viewmodels/useResetPassword.ts") + read("src/views/screens/auth/reset-password.screen.tsx");
  assert.ok(!/No reset token was received|RESET LINK PROBLEM|email client stripped/.test(all));
});

test("debug info never shows token_hash, access/refresh tokens, codes or passwords", () => {
  const secrets = ["th_SECRET_123", AT, RT, "code_SECRET_456"];
  const urls = [
    `https://www.thecompeteapp.com/reset-password?token_hash=${secrets[0]}&type=recovery`,
    HASH_LINK,
    `competerf://reset-password?code=${secrets[3]}`,
  ];
  for (const url of urls) {
    const info = describeRecoveryLink(url, { token_hash: secrets[0], code: secrets[3] });
    for (const secret of secrets) assert.ok(!info.includes(secret), `${info} leaks ${secret.slice(0, 6)}`);
  }
  const screen = read("src/views/screens/auth/reset-password.screen.tsx");
  assert.ok(!/\{password\}|\{confirmPassword\}/.test(screen.replace(/value=\{(confirmP|p)assword\}/g, "")), "password values are only input values");
});

test("web success copy points back to sign-in and never says to open the app", () => {
  const web = resetSuccessCopy("web");
  assert.deepEqual(web, {
    title: "PASSWORD UPDATED",
    body: "Your password has been updated successfully.\n\nYou can now sign in with your username or email and your new password.",
    actionLabel: "Back to Login",
    actionRoute: "/auth/login",
  });
  assert.ok(!/open the app|\bapp\b/i.test(`${web.body} ${web.actionLabel}`));
  for (const os of ["ios", "android"]) {
    const n = resetSuccessCopy(os);
    assert.equal(n.title, "PASSWORD UPDATED");
    assert.equal(n.actionRoute, "/(tabs)", "native: the recovery session is signed in → continue into the app");
  }
});

test("successful password update reaches the platform success screen", () => {
  const hook = read("src/viewmodels/useResetPassword.ts");
  assert.ok(/const \{ error \} = await authService\.updatePassword\(password\);[\s\S]*setSuccess\(true\)/.test(hook));
  assert.ok(hook.includes("successCopy: resetSuccessCopy(Platform.OS)"));
  const screen = read("src/views/screens/auth/reset-password.screen.tsx");
  assert.ok(/if \(success\)[\s\S]*\{successCopy\.title\}[\s\S]*successCopy\.actionLabel/.test(screen));
});

test("regression: no JSX attribute string with a unicode escape in auth screens / the shared Input", () => {
  const files = [
    "src/views/screens/auth/reset-password.screen.tsx",
    "src/views/screens/auth/login.screen.tsx",
    "src/views/screens/auth/register.screen.tsx",
    "src/views/screens/auth/complete-profile.screen.tsx",
    "src/views/screens/auth/forgot-password.screen.tsx",
    "src/views/components/common/input.tsx",
  ];
  for (const f of files) {
    // A JSX attribute string like placeholder="<backslash>u2022" renders those six characters
    // literally; placeholder={"<backslash>u2022"} (an expression) is fine.
    assert.ok(!/[A-Za-z]="[^"]*\\u[0-9A-Fa-f]{4}/.test(read(f)), `${f} has a literal unicode escape in a JSX attribute`);
  }
  const screen = read("src/views/screens/auth/reset-password.screen.tsx");
  assert.equal((screen.match(/label="(New|Confirm) Password"[^>]*secureTextEntry/g) ?? []).length, 2, "both fields stay masked");
});

// ── Production error screen: no debug diagnostics ────────────────────────────────────────────

test("production: the debug summary is null for every link state (dev only)", () => {
  const cases: [string | null, Record<string, string>][] = [
    [null, {}],
    ["https://www.thecompeteapp.com/reset-password", {}],
    [TOKEN_HASH_LINK, {}],
    [HASH_LINK, {}],
    [EXPIRED_LINK, {}],
    ["competerf://reset-password?code=abc", {}],
    [null, { token_hash: "th_route_param", type: "recovery" }],
  ];
  for (const [url, params] of cases) {
    assert.equal(recoveryDebugInfo(false, url, params), null, String(url));
    assert.equal(recoveryDebugInfo(true, url, params), describeRecoveryLink(url, params), "dev keeps the summary");
  }
});

test("production: the reset error screen renders no DEBUG INFO / token-state diagnostics", () => {
  const screen = read("src/views/screens/auth/reset-password.screen.tsx");
  const hook = read("src/viewmodels/useResetPassword.ts");
  // The only debug block is wrapped in a __DEV__ conditional (compiled to false → stripped in prod).
  const devBlocks = screen.match(/\{__DEV__ && verifyDebugInfo \? \([\s\S]*?\) : null\}/g) ?? [];
  assert.equal(devBlocks.length, 1, "exactly one __DEV__-gated debug block");
  const outside = screen.replace(devBlocks[0], "");
  assert.ok(!/debug info|verifyDebugInfo\}|debugBox|debugText/i.test(outside.split("const styles")[0]),
    "no debug label, summary or box outside the __DEV__ block");
  // No diagnostics, raw Supabase errors or URLs are rendered in the user-facing markup.
  for (const leak of ["token_hash", "access_token", "refresh_token", "code=", "error=", "link=", "url", "verifyErrorReason", "error.message"]) {
    assert.ok(!outside.split("const styles")[0].includes(leak), `screen renders "${leak}"`);
  }
  // The viewmodel only produces the summary in development.
  assert.ok(hook.includes("verifyDebugInfo: recoveryDebugInfo(__DEV__, sourceUrl, routeParams)"));
  assert.ok(!/describeRecoveryLink\(/.test(hook), "hook never builds the summary unconditionally");
  // The error branch shows only title, friendly message, and the two actions.
  const errBranch = outside.slice(outside.indexOf("if (verifyError) {"), outside.indexOf("if (awaitingContinue)"));
  assert.ok(errBranch.includes("{verifyErrorTitle}") && errBranch.includes("{verifyError}"));
  assert.ok(errBranch.includes('title="Request a New Link"') && errBranch.includes('title="Back to Login"'));
  assert.equal((errBranch.match(/<Text /g) ?? []).length, 3, "icon + title + message only");
});
