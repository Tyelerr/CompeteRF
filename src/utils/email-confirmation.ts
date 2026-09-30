// src/utils/email-confirmation.ts
// Email/password signup that works whether Supabase "Confirm email" is OFF (signUp returns a
// session) or ON (signUp returns a user but NO session until the emailed link is confirmed).
// Pure logic only — no Supabase / router imports — so every rule is unit-tested
// (src/utils/__tests__/email-confirmation.test.ts). The Supabase calls live in
// src/models/services/email-confirmation.service.ts; the viewmodels inject them here.
//
// Rules:
//  • The Compete profile is created ONLY when a session exists (the profiles INSERT policy is
//    auth.uid() = id, and a pending player may only be claimed for a confirmed email). Without a
//    session the user sees "Check your email" — never an RLS error.
//  • Signup form values are kept in auth user metadata (compete_signup) so Complete Profile can
//    pre-fill them after confirmation, possibly on another device. Metadata is user-editable and
//    only ever used as a pre-fill: the username is re-validated before insert, never reserved.
//  • Nothing here reveals whether an arbitrary email already has an account.
import { splitUrl, parseParamString } from "./recovery-link";

// Same format as src/utils/referral.ts (normalizeReferralCode / isWellFormedReferralCode), mirrored
// here because that module imports react-native and this one must stay importable in plain tests.
const normalizeReferralCode = (raw: string): string => raw.trim().toUpperCase();
const isWellFormedReferralCode = (raw: string): boolean => /^[A-Z0-9]{3,16}$/.test(normalizeReferralCode(raw));

/** Where confirmation links land (web + native: native finishes in the browser for now). */
export const EMAIL_CONFIRM_REDIRECT = "https://www.thecompeteapp.com/auth/confirm";
export const RESEND_COOLDOWN_SECONDS = 60;

// ── Signup metadata ──────────────────────────────────────────────────────────────────────────

export type SignupReferralSource = "link" | "manual";

export interface SignupReferral {
  code: string;
  source: SignupReferralSource;
  visitId: string | null;
}

/** What Complete Profile can pre-fill after a delayed confirmation. Never trusted. */
export interface SignupMetadata {
  first_name: string | null;
  last_name: string | null;
  username_candidate: string | null;
  home_state: string | null;
  preferred_game: string | null;
  favorite_player: string | null;
  referral: SignupReferral | null;
}

export interface SignupForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  homeState: string;
  preferredGame?: string | null;
  favoritePlayer?: string | null;
  referral?: SignupReferral | null;
}

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanReferral = (r: unknown): SignupReferral | null => {
  if (!r || typeof r !== "object") return null;
  const raw = r as { code?: unknown; source?: unknown; visitId?: unknown };
  if (typeof raw.code !== "string") return null;
  const code = normalizeReferralCode(raw.code);
  if (!isWellFormedReferralCode(code)) return null;
  const source: SignupReferralSource = raw.source === "link" ? "link" : "manual";
  const visitId = typeof raw.visitId === "string" && UUID_RE.test(raw.visitId) ? raw.visitId : null;
  return { code, source, visitId };
};

/** The metadata object stored at signUp (never the email or password). */
export function buildSignupMetadata(form: SignupForm): SignupMetadata {
  return {
    first_name: clip(form.firstName, 60),
    last_name: clip(form.lastName, 60),
    username_candidate: clip(form.username, 20),
    home_state: clip(form.homeState, 40),
    preferred_game: clip(form.preferredGame, 40),
    favorite_player: clip(form.favoritePlayer, 80),
    referral: cleanReferral(form.referral),
  };
}

/** Reads compete_signup back from user_metadata; tolerant of anything a user could have written. */
export function readSignupMetadata(userMetadata: unknown): SignupMetadata | null {
  const root = userMetadata && typeof userMetadata === "object" ? (userMetadata as Record<string, unknown>) : null;
  const raw = root?.compete_signup;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    first_name: clip(m.first_name, 60),
    last_name: clip(m.last_name, 60),
    username_candidate: clip(m.username_candidate, 20),
    home_state: clip(m.home_state, 40),
    preferred_game: clip(m.preferred_game, 40),
    favorite_player: clip(m.favorite_player, 80),
    referral: cleanReferral(m.referral),
  };
}

// ── signUp outcome ──────────────────────────────────────────────────────────────────────────

export type SignupOutcome =
  | { kind: "signedIn"; userId: string } // Confirm email OFF: session now → profile now
  | { kind: "checkEmail" } // Confirm email ON (or an existing address — deliberately identical)
  | { kind: "error"; message: string };

type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null } | null | undefined;

/** Maps supabase.auth.signUp's result. A user WITHOUT a session is never an error. */
export function signupOutcome(
  data: { user?: { id?: string | null } | null; session?: { user?: { id?: string | null } | null } | null } | null | undefined,
  error: AuthErrorLike,
): SignupOutcome {
  if (error) return { kind: "error", message: signUpErrorMessage(error) };
  const sessionUserId = data?.session?.user?.id ?? null;
  if (data?.session && (sessionUserId || data?.user?.id)) {
    return { kind: "signedIn", userId: (sessionUserId ?? data.user!.id)! };
  }
  if (data?.user) return { kind: "checkEmail" };
  return { kind: "error", message: SIGNUP_GENERIC_ERROR };
}

export const SIGNUP_GENERIC_ERROR = "We couldn't create your account. Please try again.";

/** User-facing signUp error — never the raw Supabase text. */
export function signUpErrorMessage(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (error?.status === 429 || /rate_limit/.test(code)) return "Too many attempts. Please wait a minute and try again.";
  if (code === "weak_password" || (/password/.test(msg) && /weak|short|least/.test(msg))) return "Please choose a stronger password.";
  if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email|email.*invalid/.test(msg))
    return "Please enter a valid email address.";
  if (code === "signup_disabled") return "New sign-ups are temporarily unavailable. Please try again later.";
  // Only reachable while Confirm email is OFF (with it ON, an existing address looks like success).
  if (code === "user_already_exists" || code === "email_exists" || /already registered/.test(msg))
    return "We couldn't create an account with this email. If you already have one, log in or reset your password.";
  return SIGNUP_GENERIC_ERROR;
}

/** Profile insert failure after a successful signUp (Confirm OFF path / Complete Profile). */
export function profileInsertErrorMessage(error: { code?: string | null; message?: string | null } | null | undefined): string {
  const msg = (error?.message ?? "").toLowerCase();
  if (error?.code === "23505" && /user_name/.test(msg)) return "This username is already taken";
  if (error?.code === "23505") return "An account profile already exists for this sign-in. Please log in.";
  return "We couldn't finish creating your profile. Please try again.";
}

// ── The signup orchestration (dependencies injected → behaviour-tested) ─────────────────────

export interface SignupDeps {
  /** Only when this screen has not already created the auth user (retry after a profile error). */
  signUp: (email: string, password: string, metadata: SignupMetadata) => Promise<SignupOutcome>;
  createProfile: (userId: string, form: SignupForm) => Promise<void>;
  sendWelcomeEmail: (email: string, firstName: string) => void;
  completeSignIn: (userId: string) => Promise<unknown>;
  showCheckEmail: (email: string) => void;
}

export type SignupRunResult =
  | { kind: "done"; userId: string }
  | { kind: "checkEmail" }
  | { kind: "error"; message: string; userId: string | null };

/**
 * One submit of the Register form.
 *  Confirm OFF: signUp → session → profile insert → welcome email → shared post-auth step (app).
 *  Confirm ON : signUp → no session → "Check your email". No profile insert, no welcome email.
 * `existingUserId` is the auth user this screen already created (a previous submit whose profile
 * insert failed) — then signUp is skipped so a retry never hits "already registered".
 */
export async function runEmailSignup(
  form: SignupForm,
  deps: SignupDeps,
  existingUserId: string | null = null,
): Promise<SignupRunResult> {
  let userId = existingUserId;
  if (!userId) {
    const outcome = await deps.signUp(form.email.trim(), form.password, buildSignupMetadata(form));
    if (outcome.kind === "error") return { kind: "error", message: outcome.message, userId: null };
    if (outcome.kind === "checkEmail") {
      deps.showCheckEmail(form.email.trim());
      return { kind: "checkEmail" };
    }
    userId = outcome.userId;
  }
  try {
    await deps.createProfile(userId, form);
  } catch (err) {
    return { kind: "error", message: profileInsertErrorMessage(err as { code?: string; message?: string }), userId };
  }
  // Welcome email strictly AFTER the profile exists; fire-and-forget.
  try {
    deps.sendWelcomeEmail(form.email.trim(), form.firstName.trim());
  } catch {
    /* never blocks signup */
  }
  await deps.completeSignIn(userId);
  return { kind: "done", userId };
}

// ── Check your email / resend ────────────────────────────────────────────────────────────────

export type CheckEmailMode = "signup" | "login";

export function checkEmailCopy(
  platform: string,
  mode: CheckEmailMode,
  hasEmail = true,
): { title: string; lead: string; body: string; resendLabel: string } {
  const after =
    platform === "web"
      ? "After you confirm, you'll finish setting up your account in your browser."
      : "After you confirm, come back to the Compete app and log in to finish setting up your account.";
  // No address in memory (e.g. after a reload, or "Request a New Link" from an expired link).
  if (!hasEmail) {
    return {
      title: mode === "login" ? "EMAIL NOT CONFIRMED" : "CONFIRM YOUR EMAIL",
      lead: "Enter your email and we'll send you a new confirmation link.",
      body: `${after}\n\nCan't find the email? Check your spam folder.`,
      resendLabel: "Send Confirmation Email",
    };
  }
  if (mode === "login") {
    return {
      title: "EMAIL NOT CONFIRMED",
      lead: "Please confirm your email before signing in.",
      body: `${after}\n\nCan't find the email? Check your spam folder, or send a new link.`,
      resendLabel: "Resend Confirmation Email",
    };
  }
  return {
    title: "CHECK YOUR EMAIL",
    lead: "We sent a confirmation link to:",
    body: `Confirm your email to finish creating your Compete account.\n\n${after}\n\nCan't find it? Check your spam folder.`,
    resendLabel: "Resend Email",
  };
}

/** Seconds left before another resend is allowed (0 = allowed). */
export function cooldownRemaining(lastSentAt: number | null, now: number, seconds = RESEND_COOLDOWN_SECONDS): number {
  if (!lastSentAt) return 0;
  const left = Math.ceil((lastSentAt + seconds * 1000 - now) / 1000);
  return left > 0 ? left : 0;
}

export type ResendOutcome = "sent" | "rate_limited" | "failed";

/** supabase.auth.resend error → outcome. "Already confirmed" / unknown address look like "sent". */
export function classifyResendError(error: AuthErrorLike): ResendOutcome {
  if (!error) return "sent";
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (error.status === 429 || /rate_limit/.test(code) || /rate limit|too many|security purposes/.test(msg)) return "rate_limited";
  if (/already.*confirm|confirmed/.test(msg) || code === "email_already_confirmed") return "sent";
  return "failed";
}

/** The notice after a resend attempt — identical whether or not the address has an account. */
export function resendNotice(outcome: ResendOutcome): { tone: "success" | "error"; text: string } {
  if (outcome === "sent")
    return { tone: "success", text: "If this email still needs confirming, a new link is on its way. Already confirmed? Just log in." };
  if (outcome === "rate_limited") return { tone: "error", text: "Please wait a little before requesting another email." };
  return { tone: "error", text: "We couldn't send the email right now. Please check your connection and try again." };
}

/** Email not confirmed at sign-in. Supabase only says so after the password check succeeds. */
export function isEmailNotConfirmedError(error: AuthErrorLike): boolean {
  if (!error) return false;
  return error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message ?? "");
}

// ── /auth/confirm link ──────────────────────────────────────────────────────────────────────

export type ConfirmCredentials =
  | { kind: "token_hash"; tokenHash: string; type: "email" | "signup" }
  | { kind: "session"; accessToken: string; refreshToken: string };

export type ConfirmErrorReason = "expired" | "invalid" | "missing";

export type ConfirmLink =
  | { status: "credentials"; credentials: ConfirmCredentials }
  | { status: "error"; reason: ConfirmErrorReason };

type ParamSource = Record<string, string | string[] | undefined | null>;
const firstOf = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? undefined;

const CONFIRM_TYPES = ["email", "signup"] as const;

/**
 * Parses …/auth/confirm?token_hash=…&type=email (primary; our template), Supabase's implicit
 * redirect (#access_token=…&refresh_token=…&type=signup) and its error redirect
 * (#error=access_denied&error_code=otp_expired…). Hash values win over query/route params.
 */
export function parseConfirmLink(url: string | null | undefined, routeParams: ParamSource = {}): ConfirmLink {
  const parts = url ? splitUrl(url) : { query: "", hash: "" };
  const hash = parseParamString(parts.hash);
  const query = parseParamString(parts.query);
  const get = (k: string): string | undefined => {
    const v = hash[k] ?? query[k] ?? firstOf(routeParams[k]);
    return v === undefined || v === null || v === "" ? undefined : String(v);
  };

  const errorCode = get("error_code");
  if (get("error") || errorCode) {
    const expired = /expired|otp_expired|used/i.test(`${errorCode ?? ""} ${get("error_description") ?? ""}`);
    return { status: "error", reason: expired ? "expired" : "invalid" };
  }

  const type = get("type");
  const typeOk = !type || (CONFIRM_TYPES as readonly string[]).includes(type);
  const tokenHash = get("token_hash");
  const accessToken = get("access_token");
  const refreshToken = get("refresh_token");

  if (tokenHash) {
    if (!typeOk) return { status: "error", reason: "invalid" };
    return { status: "credentials", credentials: { kind: "token_hash", tokenHash, type: type === "signup" ? "signup" : "email" } };
  }
  if (accessToken || refreshToken) {
    if (!typeOk || !accessToken || !refreshToken) return { status: "error", reason: "invalid" };
    return { status: "credentials", credentials: { kind: "session", accessToken, refreshToken } };
  }
  return { status: "error", reason: "missing" };
}

export const CONFIRM_ERROR_COPY: Record<ConfirmErrorReason, { title: string; body: string }> = {
  expired: {
    title: "LINK EXPIRED",
    body: "This confirmation link has expired or was already used.\n\nIf you already confirmed your email, just log in. Otherwise, request a new confirmation email.",
  },
  invalid: {
    title: "LINK INVALID",
    body: "This confirmation link is incomplete or invalid.\n\nPlease request a new confirmation email.",
  },
  missing: {
    title: "LINK INVALID",
    body: "This confirmation link is missing the information needed to continue.\n\nPlease request a new confirmation email.",
  },
};

export type ConfirmPhase =
  | { kind: "awaiting_continue"; credentials: ConfirmCredentials }
  | { kind: "verifying" }
  | { kind: "confirmed"; userId: string }
  | { kind: "error"; reason: ConfirmErrorReason; title: string; message: string };

const confirmError = (reason: ConfirmErrorReason): ConfirmPhase => ({
  kind: "error",
  reason,
  title: CONFIRM_ERROR_COPY[reason].title,
  message: CONFIRM_ERROR_COPY[reason].body,
});

/** On arrival: NEVER verifies — a valid link waits for Continue (link scanners consume nothing). */
export function confirmPhaseForLink(link: ConfirmLink): ConfirmPhase {
  return link.status === "credentials" ? { kind: "awaiting_continue", credentials: link.credentials } : confirmError(link.reason);
}

export function confirmLinkKey(link: ConfirmLink): string {
  if (link.status === "error") return `error:${link.reason}`;
  const c = link.credentials;
  return c.kind === "token_hash" ? `th:${c.tokenHash}` : `s:${c.accessToken}`;
}

export interface ConfirmVerifyResult {
  ok: boolean;
  expired: boolean;
  userId: string | null;
}

/** The Continue action — the ONLY place the link is verified (verifyOtp / setSession). */
export async function continueConfirmation(
  phase: ConfirmPhase,
  verify: (c: ConfirmCredentials) => Promise<ConfirmVerifyResult>,
): Promise<ConfirmPhase> {
  if (phase.kind !== "awaiting_continue") return phase;
  try {
    const res = await verify(phase.credentials);
    if (res.ok && res.userId) return { kind: "confirmed", userId: res.userId };
    return confirmError(res.expired ? "expired" : "invalid");
  } catch {
    return confirmError("invalid");
  }
}

/** Dev-only support summary (which pieces arrived, never values); null in production. */
export function confirmDebugInfo(isDev: boolean, url: string | null | undefined, routeParams: ParamSource = {}): string | null {
  if (!isDev) return null;
  const parts = url ? splitUrl(url) : { query: "", hash: "" };
  const all = { ...parseParamString(parts.query), ...parseParamString(parts.hash) };
  const has = (k: string) => (all[k] || firstOf(routeParams[k]) ? "present" : "missing");
  return [`token_hash=${has("token_hash")}`, `access_token=${has("access_token")}`, `type=${all.type || firstOf(routeParams.type) || "none"}`, `error=${all.error_code || all.error || "none"}`].join(" · ");
}
