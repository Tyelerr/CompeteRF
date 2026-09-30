// src/utils/__tests__/email-confirmation.test.ts
// Run: npx tsx --test src/utils/__tests__/email-confirmation.test.ts
// Email/password signup compatible with Supabase "Confirm email" OFF (today) and ON (later):
// the signup orchestration (behaviour, with injected fakes), Check Your Email + resend, the
// /auth/confirm link + Continue gate, unconfirmed-login mapping, metadata/referral pre-fill,
// and static guards (no session assumptions, no debug/token leakage, hydration, web wording).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFIRM_ERROR_COPY,
  EMAIL_CONFIRM_REDIRECT,
  RESEND_COOLDOWN_SECONDS,
  SignupDeps,
  SignupForm,
  buildSignupMetadata,
  checkEmailCopy,
  classifyResendError,
  confirmDebugInfo,
  confirmLinkKey,
  confirmPhaseForLink,
  continueConfirmation,
  cooldownRemaining,
  isEmailNotConfirmedError,
  parseConfirmLink,
  profileInsertErrorMessage,
  readSignupMetadata,
  resendNotice,
  runEmailSignup,
  signUpErrorMessage,
  signupOutcome,
} from "../email-confirmation";
import { resolvePostAuthRoute } from "../auth-routing";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const FORM: SignupForm = {
  email: "  new.player@example.com ",
  password: "correct-horse-1",
  firstName: "Tyler",
  lastName: "Hill",
  username: "breakshot",
  homeState: "AZ",
  preferredGame: "9-Ball",
  favoritePlayer: "Efren",
  referral: { code: "ABC123", source: "link", visitId: "5b6c1b2e-7d0f-4f6a-9a51-0e7a2c1d3f40" },
};

/** Records every call so tests can assert order and absence. */
function fakeDeps(outcome: Awaited<ReturnType<SignupDeps["signUp"]>>, opts: { profileFails?: unknown } = {}) {
  const calls: string[] = [];
  const seen: { metadata?: unknown; checkEmail?: string; profileUser?: string } = {};
  const deps: SignupDeps = {
    signUp: async (_email, _pw, metadata) => {
      calls.push("signUp");
      seen.metadata = metadata;
      return outcome;
    },
    createProfile: async (userId) => {
      calls.push("createProfile");
      seen.profileUser = userId;
      if (opts.profileFails) throw opts.profileFails;
    },
    sendWelcomeEmail: () => {
      calls.push("welcome");
    },
    completeSignIn: async () => {
      calls.push("completeSignIn");
    },
    showCheckEmail: (email) => {
      calls.push("checkEmail");
      seen.checkEmail = email;
    },
  };
  return { deps, calls, seen };
}

// ── signUp outcome ───────────────────────────────────────────────────────────────────────────

test("signUp with an immediate session (Confirm email OFF) → signedIn", () => {
  const out = signupOutcome({ user: { id: "u1" }, session: { user: { id: "u1" } } }, null);
  assert.deepEqual(out, { kind: "signedIn", userId: "u1" });
});

test("signUp with a user but NO session (Confirm email ON) → checkEmail, never an error", () => {
  assert.deepEqual(signupOutcome({ user: { id: "u1" }, session: null }, null), { kind: "checkEmail" });
});

test("signUp errors never surface raw Supabase text", () => {
  const raw = "AuthApiError: some internal detail 0xDEAD";
  const msg = signUpErrorMessage({ code: "unexpected_failure", message: raw });
  assert.ok(!msg.includes("0xDEAD") && !msg.includes("AuthApiError"));
  assert.equal(signUpErrorMessage({ status: 429, message: "x" }), "Too many attempts. Please wait a minute and try again.");
  assert.equal(signUpErrorMessage({ code: "weak_password" }), "Please choose a stronger password.");
  assert.match(signUpErrorMessage({ code: "user_already_exists" }), /log in or reset your password/);
  assert.equal(signupOutcome(null, null).kind, "error");
});

// ── the orchestration ───────────────────────────────────────────────────────────────────────

test("Confirm OFF: signUp → profile → welcome email → shared post-auth step (unchanged result)", async () => {
  const { deps, calls, seen } = fakeDeps({ kind: "signedIn", userId: "u1" });
  const res = await runEmailSignup(FORM, deps);
  assert.deepEqual(res, { kind: "done", userId: "u1" });
  assert.deepEqual(calls, ["signUp", "createProfile", "welcome", "completeSignIn"]);
  assert.equal(seen.profileUser, "u1");
  assert.ok(!calls.includes("checkEmail"), "no confirmation screen while signUp returns a session");
});

test("Confirm ON: no session → Check Your Email; NO profile insert, NO welcome email, NO RLS error", async () => {
  const { deps, calls, seen } = fakeDeps({ kind: "checkEmail" });
  const res = await runEmailSignup(FORM, deps);
  assert.deepEqual(res, { kind: "checkEmail" });
  assert.deepEqual(calls, ["signUp", "checkEmail"]);
  assert.equal(seen.checkEmail, "new.player@example.com", "trimmed address shown");
});

test("welcome email is sent only after the profile exists (a failed insert sends none)", async () => {
  const { deps, calls } = fakeDeps({ kind: "signedIn", userId: "u1" }, { profileFails: { code: "23505", message: "profiles_user_name_key" } });
  const res = await runEmailSignup(FORM, deps);
  assert.equal(res.kind, "error");
  assert.deepEqual(calls, ["signUp", "createProfile"]);
  assert.equal((res as { message: string }).message, "This username is already taken");
  assert.equal((res as { userId: string | null }).userId, "u1", "the created auth user is remembered for the retry");
});

test("retry after a failed profile insert skips signUp (never 'already registered')", async () => {
  const { deps, calls } = fakeDeps({ kind: "error", message: "should not be called" });
  const res = await runEmailSignup(FORM, deps, "u1");
  assert.deepEqual(res, { kind: "done", userId: "u1" });
  assert.deepEqual(calls, ["createProfile", "welcome", "completeSignIn"]);
});

test("signUp error → message, nothing else runs", async () => {
  const { deps, calls } = fakeDeps({ kind: "error", message: "Please enter a valid email address." });
  const res = await runEmailSignup(FORM, deps);
  assert.deepEqual(res, { kind: "error", message: "Please enter a valid email address.", userId: null });
  assert.deepEqual(calls, ["signUp"]);
});

test("profile insert errors are friendly", () => {
  assert.equal(profileInsertErrorMessage({ code: "23505", message: 'duplicate key "profiles_user_name_key"' }), "This username is already taken");
  assert.equal(profileInsertErrorMessage({ code: "42501", message: "new row violates row-level security policy" }), "We couldn't finish creating your profile. Please try again.");
});

// ── metadata + referral ─────────────────────────────────────────────────────────────────────

test("signup metadata carries the onboarding fields + referral, never the email or password", async () => {
  const { deps, seen } = fakeDeps({ kind: "checkEmail" });
  await runEmailSignup(FORM, deps);
  const meta = seen.metadata as Record<string, unknown>;
  assert.deepEqual(meta, {
    first_name: "Tyler",
    last_name: "Hill",
    username_candidate: "breakshot",
    home_state: "AZ",
    preferred_game: "9-Ball",
    favorite_player: "Efren",
    referral: { code: "ABC123", source: "link", visitId: "5b6c1b2e-7d0f-4f6a-9a51-0e7a2c1d3f40" },
  });
  const json = JSON.stringify(meta);
  assert.ok(!json.includes("correct-horse-1") && !json.includes("@example.com"));
});

test("metadata round-trips for Complete Profile pre-fill and tolerates tampering", () => {
  const stored = { compete_signup: buildSignupMetadata(FORM), other: 1 };
  const back = readSignupMetadata(stored)!;
  assert.equal(back.first_name, "Tyler");
  assert.equal(back.username_candidate, "breakshot");
  assert.deepEqual(back.referral, { code: "ABC123", source: "link", visitId: "5b6c1b2e-7d0f-4f6a-9a51-0e7a2c1d3f40" });
  assert.equal(readSignupMetadata(null), null);
  assert.equal(readSignupMetadata({}), null);
  const junk = readSignupMetadata({ compete_signup: { first_name: 42, username_candidate: "x".repeat(99), referral: { code: "!!", source: "evil" } } })!;
  assert.equal(junk.first_name, null);
  assert.equal(junk.username_candidate!.length, 20, "clipped");
  assert.equal(junk.referral, null, "malformed referral dropped");
  const manual = readSignupMetadata({ compete_signup: { referral: { code: "abc123", source: "whatever", visitId: "not-a-uuid" } } })!;
  assert.deepEqual(manual.referral, { code: "ABC123", source: "manual", visitId: null });
});

test("Complete Profile pre-fills from metadata but re-validates the username and only offers valid choices", () => {
  const src = read("src/views/screens/auth/complete-profile.screen.tsx");
  assert.ok(src.includes("readSignupMetadata(user?.user_metadata)"), "reads compete_signup");
  assert.ok(/setUsername\(\(cur\) => cur \|\| meta\.username_candidate!\)/.test(src), "pre-fills the username state");
  assert.ok(/if \(!isAvailable\) \{ setError\("This username is already taken"\)/.test(src), "still requires availability before insert");
  assert.ok(src.includes("useCheckUsername(username)"), "availability check runs on the pre-filled value");
  assert.ok(src.includes("US_STATES.some((s) => s.value === state)") && src.includes("GAME_OPTIONS.includes(game)"));
  assert.ok(src.includes("adoptReferral(meta.referral)"), "referral survives a confirmation on another device");
});

test("referral: signup snapshots it into metadata; the device-local pending referral still wins", () => {
  const reg = read("src/views/screens/auth/register.screen.tsx");
  assert.ok(reg.includes("await referral.commit();") && reg.includes("referral: referral.snapshot()"));
  const hook = read("src/viewmodels/hooks/use.referral.code.field.ts");
  assert.ok(/const adopt = useCallback[\s\S]*if \(await pendingReferralService\.get\(\)\) return;/.test(hook));
});

// ── Check Your Email / resend ────────────────────────────────────────────────────────────────

test("check-email copy: web never mentions the app; native explains returning to it", () => {
  for (const mode of ["signup", "login"] as const) {
    for (const hasEmail of [true, false]) {
      const web = checkEmailCopy("web", mode, hasEmail);
      assert.ok(!/\bapp\b/i.test(`${web.title} ${web.lead} ${web.body}`), `web ${mode}/${hasEmail}`);
      const ios = checkEmailCopy("ios", mode, hasEmail);
      assert.match(ios.body, /come back to the Compete app/);
    }
  }
  assert.equal(checkEmailCopy("web", "signup").title, "CHECK YOUR EMAIL");
  assert.equal(checkEmailCopy("web", "signup").lead, "We sent a confirmation link to:");
  assert.match(checkEmailCopy("web", "signup").body, /^Confirm your email to finish creating your Compete account\./);
  assert.equal(checkEmailCopy("web", "login").title, "EMAIL NOT CONFIRMED");
  assert.equal(checkEmailCopy("web", "login").lead, "Please confirm your email before signing in.");
  assert.equal(checkEmailCopy("web", "login").resendLabel, "Resend Confirmation Email");
});

test("resend cooldown is ~60 s and counts down", () => {
  assert.equal(RESEND_COOLDOWN_SECONDS, 60);
  const t0 = 1_000_000;
  assert.equal(cooldownRemaining(null, t0), 0);
  assert.equal(cooldownRemaining(t0, t0), 60);
  assert.equal(cooldownRemaining(t0, t0 + 59_001), 1);
  assert.equal(cooldownRemaining(t0, t0 + 60_000), 0);
});

test("resend outcomes: success / rate limit / already confirmed / failure — never revealing accounts", () => {
  assert.equal(classifyResendError(null), "sent");
  assert.equal(classifyResendError({ status: 429, message: "x" }), "rate_limited");
  assert.equal(classifyResendError({ code: "over_email_send_rate_limit" }), "rate_limited");
  assert.equal(classifyResendError({ message: "For security purposes, you can only request this after 42 seconds." }), "rate_limited");
  assert.equal(classifyResendError({ message: "Email already confirmed" }), "sent", "already confirmed looks like success");
  assert.equal(classifyResendError({ message: "fetch failed" }), "failed");
  const sent = resendNotice("sent");
  assert.equal(sent.tone, "success");
  assert.ok(!/no account|not found|doesn't exist|does not exist/i.test(sent.text));
  assert.equal(resendNotice("rate_limited").tone, "error");
  assert.equal(resendNotice("failed").tone, "error");
});

test("resend uses Supabase resend(type: signup) with the HTTPS /auth/confirm redirect", () => {
  const svc = read("src/models/services/email-confirmation.service.ts");
  assert.ok(/auth\.resend\(\{\s*type: "signup"/.test(svc));
  assert.equal(EMAIL_CONFIRM_REDIRECT, "https://www.thecompeteapp.com/auth/confirm");
  assert.ok(svc.includes("emailRedirectTo: EMAIL_CONFIRM_REDIRECT"));
});

// ── /auth/confirm ───────────────────────────────────────────────────────────────────────────

const LINK = "https://www.thecompeteapp.com/auth/confirm?token_hash=pkce_abc123SECRET&type=email";

test("token_hash email confirmation link → credentials (type email)", () => {
  const link = parseConfirmLink(LINK);
  assert.deepEqual(link, { status: "credentials", credentials: { kind: "token_hash", tokenHash: "pkce_abc123SECRET", type: "email" } });
  assert.equal((parseConfirmLink(null, { token_hash: "th1", type: "signup" }) as any).credentials.type, "signup");
});

test("Continue is required: arrival never verifies; only continueConfirmation calls verifyOtp", async () => {
  const phase = confirmPhaseForLink(parseConfirmLink(LINK));
  assert.equal(phase.kind, "awaiting_continue");
  let calls = 0;
  const next = await continueConfirmation(phase, async () => {
    calls++;
    return { ok: true, expired: false, userId: "u9" };
  });
  assert.equal(calls, 1);
  assert.deepEqual(next, { kind: "confirmed", userId: "u9" });
  // a non-waiting phase never verifies
  assert.equal((await continueConfirmation(next, async () => { calls++; return { ok: true, expired: false, userId: "x" }; })).kind, "confirmed");
  assert.equal(calls, 1);
  const hook = read("src/viewmodels/useConfirmEmail.ts");
  const effects = hook.split("useEffect(").slice(1).map((s) => s.split("}, [")[0]).join("\n");
  assert.ok(!/verify|continueConfirmation/i.test(effects), "no verification inside effects");
  assert.ok(/const handleContinue = useCallback\(async \(\) => \{[\s\S]*continueConfirmation\(/.test(hook));
});

test("expired / used link → friendly LINK EXPIRED", async () => {
  const fromRedirect = confirmPhaseForLink(
    parseConfirmLink("https://www.thecompeteapp.com/auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
  ) as any;
  assert.equal(fromRedirect.title, "LINK EXPIRED");
  assert.equal(fromRedirect.message, CONFIRM_ERROR_COPY.expired.body);
  const afterVerify = (await continueConfirmation(confirmPhaseForLink(parseConfirmLink(LINK)), async () => ({ ok: false, expired: true, userId: null }))) as any;
  assert.equal(afterVerify.title, "LINK EXPIRED");
  const thrown = (await continueConfirmation(confirmPhaseForLink(parseConfirmLink(LINK)), async () => { throw new Error("network"); })) as any;
  assert.equal(thrown.title, "LINK INVALID");
});

test("missing / malformed / wrong-type links → friendly LINK INVALID", () => {
  const missing = confirmPhaseForLink(parseConfirmLink("https://www.thecompeteapp.com/auth/confirm")) as any;
  assert.equal(missing.title, "LINK INVALID");
  assert.equal(missing.message, CONFIRM_ERROR_COPY.missing.body);
  for (const url of [
    "https://www.thecompeteapp.com/auth/confirm?token_hash=abc&type=recovery", // a reset link is not a confirmation
    "https://www.thecompeteapp.com/auth/confirm#access_token=only-half&type=signup",
  ]) {
    assert.equal((confirmPhaseForLink(parseConfirmLink(url)) as any).title, "LINK INVALID", url);
  }
  assert.notEqual(confirmLinkKey(parseConfirmLink(LINK)), confirmLinkKey(parseConfirmLink(LINK.replace("abc123", "zzz"))));
});

test("successful verification → shared post-auth step: no profile → Complete Profile, profile → app", () => {
  assert.deepEqual(resolvePostAuthRoute("needsProfile"), { kind: "completeProfile" });
  assert.deepEqual(resolvePostAuthRoute("ready"), { kind: "app" });
  const hook = read("src/viewmodels/useConfirmEmail.ts");
  assert.ok(/if \(next\.kind === "confirmed"\) await route\(next\.userId\);/.test(hook));
  assert.ok(hook.includes("await completeSignIn(userId)"), "uses the ONE shared post-auth step");
  const svc = read("src/models/services/email-confirmation.service.ts");
  assert.ok(svc.includes("verifyOtp({ token_hash: credentials.tokenHash, type: credentials.type })"));
});

test("no token / debug leakage: production summary is null, the screen gates debug on __DEV__, nothing logs URLs", () => {
  assert.equal(confirmDebugInfo(false, LINK), null);
  const dev = confirmDebugInfo(true, LINK)!;
  assert.ok(dev.includes("token_hash=present") && !dev.includes("SECRET"));
  const screen = read("src/views/screens/auth/confirm-email.screen.tsx");
  const blocks = screen.match(/\{__DEV__ && debugInfo \? \([\s\S]*?\) : null\}/g) ?? [];
  assert.equal(blocks.length, 1);
  const outside = screen.replace(blocks[0], "").split("const styles")[0];
  assert.ok(!/debug info|debugInfo\}|token_hash|access_token|error\.message/i.test(outside));
  for (const f of ["src/viewmodels/useConfirmEmail.ts", "src/models/services/email-confirmation.service.ts", "src/views/screens/auth/confirm-email.screen.tsx"]) {
    assert.ok(!/console\.(log|info|warn|error)\([^)]*(url|Url|token|link)/.test(read(f)), `${f} logs a url/token`);
  }
  assert.ok(read("src/viewmodels/useConfirmEmail.ts").includes("confirmDebugInfo(__DEV__, sourceUrl, routeParams)"));
});

test("web hydration: /auth/confirm and Check Your Email render their neutral state until hydrated", () => {
  const confirm = read("src/viewmodels/useConfirmEmail.ts");
  assert.ok(confirm.includes("const hydrated = useHydrated();"));
  assert.ok(/const resolving =\s*!hydrated \|\|/.test(confirm));
  const check = read("src/viewmodels/useCheckEmail.ts");
  assert.ok(check.includes("const email = hydrated ? storedEmail : null;"));
  assert.ok(check.includes("const remaining = hydrated ? cooldownRemaining(lastSentAt, now) : 0;"));
});

// ── login ───────────────────────────────────────────────────────────────────────────────────

test("unconfirmed login maps to EMAIL NOT CONFIRMED; wrong credentials stay generic", () => {
  assert.equal(isEmailNotConfirmedError({ code: "email_not_confirmed", message: "Email not confirmed" }), true);
  assert.equal(isEmailNotConfirmedError({ message: "Email not confirmed" }), true);
  assert.equal(isEmailNotConfirmedError({ code: "invalid_credentials", message: "Invalid login credentials" }), false);
  assert.equal(isEmailNotConfirmedError(null), false);
  const vm = read("src/viewmodels/useLogin.ts");
  assert.ok(vm.includes('const INVALID_CREDENTIALS = "Incorrect credentials. Please try again.";'));
  assert.ok(/notConfirmed = isEmailNotConfirmedError\(err\);/.test(vm));
  assert.ok(/startPending\(value, "login", null\);\s*router\.push\("\/auth\/check-email"/.test(vm));
});

// ── static guards: no session assumptions, email kept out of URLs, routes exist ───────────────

test("Register no longer calls Supabase inline or assumes a session after signUp", () => {
  const reg = read("src/views/screens/auth/register.screen.tsx");
  assert.ok(!/supabase\.auth\.signUp|profileService\.createProfile|getSession\(|sendWelcomeEmail/.test(reg));
  assert.ok(reg.includes("const { submit } = useEmailSignup();"));
  const vm = read("src/viewmodels/useEmailSignup.ts");
  assert.ok(vm.includes("runEmailSignup("));
  assert.ok(!/router\.(push|replace)\([^)]*email/i.test(vm.replace('"/auth/check-email" as any', "")), "the email is never put in a route");
});

test("new routes exist and re-export their screens", () => {
  assert.match(read("app/auth/confirm.tsx"), /ConfirmEmailScreen/);
  assert.match(read("app/auth/check-email.tsx"), /CheckEmailScreen/);
});

test("the mirrored referral-code format matches src/utils/referral.ts", () => {
  const original = read("src/utils/referral.ts");
  const mirror = read("src/utils/email-confirmation.ts");
  for (const piece of ["raw.trim().toUpperCase()", "/^[A-Z0-9]{3,16}$/"]) {
    assert.ok(original.includes(piece) && mirror.includes(piece), piece);
  }
});

test("Forgot Password success copy never promises the link opens the app", () => {
  const src = read("src/views/screens/auth/forgot-password.screen.tsx");
  assert.ok(!/open the app/i.test(src));
  assert.ok(src.includes("Open the link in the email to choose a new password."));
});

test("Complete Profile never guesses 'social': an email user's existing password can't be replaced", () => {
  const src = read("src/views/screens/auth/complete-profile.screen.tsx");
  assert.ok(!/\.catch\(\(\) => \{ if \(active\) setSocialSignupWithoutProfile\(true\)/.test(src), "a failed check must not default to social");
  assert.ok(/setSocialSignupWithoutProfile\(null\);\s*setAccountCheckFailed\(true\);/.test(src));
  const recheck = src.indexOf("if (!(await authService.currentAccountIsSocialSignup()))");
  const add = src.indexOf("authService.addPasswordToCurrentAccount(password)");
  assert.ok(recheck > 0 && add > recheck, "re-confirms a social signup right before adding a password");
  assert.ok(/disabled=\{!profileCreated && \(socialSignupWithoutProfile === null \|\| !isFormValid\)\}/.test(src), "submit disabled while unknown");
});
