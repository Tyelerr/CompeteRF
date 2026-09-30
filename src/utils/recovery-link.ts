// src/utils/recovery-link.ts
// Password-recovery deep links — pure parsing, so every format is unit-tested
// (src/utils/__tests__/recovery-link.test.ts). No Supabase / router imports here.
//
// Formats we accept (all on the /reset-password route, custom scheme or https):
//   A) token_hash (not yet consumed; verified by verifyOtp):
//        …/reset-password?token_hash=…&type=recovery
//   B) Supabase default / implicit redirect (already verified server-side, tokens in the hash):
//        competerf://reset-password#access_token=…&refresh_token=…&type=recovery
//   C) PKCE code:  …/reset-password?code=…
//   D) Supabase error redirect (expired / already used / denied):
//        competerf://reset-password#error=access_denied&error_code=otp_expired&error_description=…
// Nothing here consumes anything: callers verify only after the user taps Continue.

export type RecoveryCredentials =
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string };

export type RecoveryErrorReason = "expired" | "denied" | "missing" | "malformed" | "wrong_type";

export type RecoveryLink =
  | { status: "credentials"; credentials: RecoveryCredentials }
  | { status: "error"; reason: RecoveryErrorReason; detail?: string | null };

type ParamSource = Record<string, string | string[] | undefined | null>;

const RECOVERY_PATH = /^\/?(auth\/)?reset-password\/?$/i;

const decode = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

/** Parse `a=1&b=2` (no leading ? or #) into a map; later keys don't override earlier non-empty ones. */
export function parseParamString(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (s ?? "").split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const k = decode(i === -1 ? pair : pair.slice(0, i));
    const v = decode(i === -1 ? "" : pair.slice(i + 1));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/** Split any deep link / URL into path, query and hash parts (handles `competerf://host`, https, Expo Go `/--/`). */
export function splitUrl(url: string): { path: string; query: string; hash: string } {
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt + 1);
  const qAt = beforeHash.indexOf("?");
  let path = qAt === -1 ? beforeHash : beforeHash.slice(0, qAt);
  const query = qAt === -1 ? "" : beforeHash.slice(qAt + 1);
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(path);
  if (scheme) {
    path = path.slice(scheme[0].length);
    // https://host/path → drop host; competerf://reset-password → the host IS the route
    if (/^https?:\/\//i.test(scheme[0]) || /^exps?:\/\//i.test(scheme[0])) {
      const slash = path.indexOf("/");
      path = slash === -1 ? "" : path.slice(slash);
    }
  }
  path = path.replace(/^\/?--\//, "/"); // Expo Go: exp://host:port/--/reset-password
  return { path, query, hash };
}

/** Is this URL a password-recovery link (any supported scheme / host)? Other deep links → false. */
export function isRecoveryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return RECOVERY_PATH.test(splitUrl(url).path.replace(/^\/+/, "/"));
}

const first = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Extract recovery credentials (or the reason there are none) from the URL that opened the
 * screen and/or the router's route params. Hash values win over query values (Supabase puts
 * tokens and errors in the hash).
 */
export function parseRecoveryLink(url: string | null | undefined, routeParams: ParamSource = {}): RecoveryLink {
  const fromUrl = url ? splitUrl(url) : { query: "", hash: "" };
  const hash = parseParamString(fromUrl.hash);
  const query = parseParamString(fromUrl.query);
  const get = (k: string): string | undefined => {
    const v = hash[k] ?? query[k] ?? first(routeParams[k]);
    return v === undefined || v === null || v === "" ? undefined : String(v);
  };

  // D) Supabase told us the link is bad.
  const error = get("error");
  const errorCode = get("error_code");
  if (error || errorCode) {
    const expired = /expired|otp_expired|invalid|used/i.test(`${errorCode ?? ""} ${get("error_description") ?? ""}`);
    return { status: "error", reason: expired ? "expired" : "denied", detail: errorCode ?? error ?? null };
  }

  const type = get("type");
  const tokenHash = get("token_hash");
  const accessToken = get("access_token");
  const refreshToken = get("refresh_token");
  const code = get("code");

  if (type && type !== "recovery" && (tokenHash || accessToken)) {
    return { status: "error", reason: "wrong_type", detail: type };
  }
  if (tokenHash) return { status: "credentials", credentials: { kind: "token_hash", tokenHash } };
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) return { status: "error", reason: "malformed", detail: "incomplete session tokens" };
    return { status: "credentials", credentials: { kind: "session", accessToken, refreshToken } };
  }
  if (code) return { status: "credentials", credentials: { kind: "code", code } };
  return { status: "error", reason: "missing" };
}

// What the user sees for each failure the app can actually tell apart.
export const RECOVERY_ERROR_COPY: Record<RecoveryErrorReason, { title: string; body: string }> = {
  // Supabase said otp_expired (or verification failed as expired / already used).
  expired: {
    title: "RESET LINK EXPIRED",
    body: "This password reset link has expired or was already used.\n\nPlease request a new password reset email and use the newest link.",
  },
  // The reset route opened with no recovery credentials at all.
  missing: {
    title: "RESET LINK INVALID",
    body: "This password reset link is missing the information needed to continue.\n\nPlease request a new password reset email and use the newest link.",
  },
  // Incomplete / invalid credentials, the wrong link type, or a non-expiry rejection.
  malformed: { title: "RESET LINK INVALID", body: "This password reset link is incomplete or invalid.\n\nPlease request a new password reset email." },
  wrong_type: { title: "RESET LINK INVALID", body: "This password reset link is incomplete or invalid.\n\nPlease request a new password reset email." },
  denied: { title: "RESET LINK INVALID", body: "This password reset link is incomplete or invalid.\n\nPlease request a new password reset email." },
};

/** Body text per failure (kept for callers that only need the message). */
export const RECOVERY_ERROR_MESSAGES: Record<RecoveryErrorReason, string> = {
  expired: RECOVERY_ERROR_COPY.expired.body,
  missing: RECOVERY_ERROR_COPY.missing.body,
  malformed: RECOVERY_ERROR_COPY.malformed.body,
  wrong_type: RECOVERY_ERROR_COPY.wrong_type.body,
  denied: RECOVERY_ERROR_COPY.denied.body,
};

/**
 * Success screen after the new password is saved. Web: the reset happened in the browser, so
 * point back to sign-in (never "open the app"). Native: the recovery session is already signed in.
 */
export function resetSuccessCopy(platform: string): { title: string; body: string; actionLabel: string; actionRoute: string } {
  if (platform === "web") {
    return {
      title: "PASSWORD UPDATED",
      body: "Your password has been updated successfully.\n\nYou can now sign in with your username or email and your new password.",
      actionLabel: "Back to Login",
      actionRoute: "/auth/login",
    };
  }
  return {
    title: "PASSWORD UPDATED",
    body: "Your password has been updated successfully.",
    actionLabel: "Continue",
    actionRoute: "/(tabs)",
  };
}

/** A support-safe summary of what arrived — says which pieces exist, never their values. */
export function describeRecoveryLink(url: string | null | undefined, routeParams: ParamSource = {}): string {
  const { hash, query } = url ? splitUrl(url) : { hash: "", query: "" };
  const all = { ...parseParamString(query), ...parseParamString(hash) };
  const has = (k: string) => (all[k] || first(routeParams[k]) ? "present" : "missing");
  return [
    `link=${url ? (isRecoveryUrl(url) ? "reset-password" : "other") : "none"}`,
    `token_hash=${has("token_hash")}`,
    `access_token=${has("access_token")}`,
    `refresh_token=${has("refresh_token")}`,
    `code=${has("code")}`,
    `error=${all.error_code || all.error || first(routeParams.error_code) || "none"}`,
  ].join(" · ");
}

/**
 * The debug summary as the reset screen may show it: development builds only. Production users
 * never see link/parser diagnostics (not even which pieces were present) — null there.
 */
export function recoveryDebugInfo(
  isDev: boolean,
  url: string | null | undefined,
  routeParams: ParamSource = {},
): string | null {
  return isDev ? describeRecoveryLink(url, routeParams) : null;
}

/**
 * For app/+native-intent.tsx: a recovery link is routed to the clean `/reset-password` path
 * (its credentials are captured separately, never put in navigation state); any other link
 * returns null so it is left completely untouched.
 */
export function recoveryRouteFor(url: string | null | undefined): "/reset-password" | null {
  return isRecoveryUrl(url) ? "/reset-password" : null;
}

// ── Screen phases (pure) ─────────────────────────────────────────────────────────────────────

export type RecoveryPhase =
  | { kind: "awaiting_continue"; credentials: RecoveryCredentials }
  | { kind: "verifying" }
  | { kind: "ready" }
  | { kind: "error"; reason: RecoveryErrorReason; title: string; message: string };

/** What the screen shows when a link arrives: NEVER verifies — valid links wait for Continue. */
export function phaseForLink(link: RecoveryLink): RecoveryPhase {
  if (link.status === "credentials") return { kind: "awaiting_continue", credentials: link.credentials };
  return { kind: "error", reason: link.reason, title: RECOVERY_ERROR_COPY[link.reason].title, message: RECOVERY_ERROR_COPY[link.reason].body };
}

/** Stable identity of a link, so a NEW link resets the flow but a re-render does not. */
export function linkKey(link: RecoveryLink): string {
  if (link.status === "error") return `error:${link.reason}:${link.detail ?? ""}`;
  const c = link.credentials;
  return c.kind === "token_hash" ? `th:${c.tokenHash}` : c.kind === "session" ? `s:${c.accessToken}` : `c:${c.code}`;
}

/**
 * The Continue action: the ONLY place credentials are verified. `establish` is the service call
 * (passwordRecoveryService.establishRecoverySession), injected so this stays pure/testable.
 */
export async function continueRecovery(
  phase: RecoveryPhase,
  establish: (c: RecoveryCredentials) => Promise<{ ok: boolean; expired: boolean; error: string | null }>,
): Promise<RecoveryPhase> {
  if (phase.kind !== "awaiting_continue") return phase;
  try {
    const result = await establish(phase.credentials);
    if (result.ok) return { kind: "ready" };
    const reason: RecoveryErrorReason = result.expired ? "expired" : "denied";
    return { kind: "error", reason, title: RECOVERY_ERROR_COPY[reason].title, message: RECOVERY_ERROR_COPY[reason].body };
  } catch {
    return { kind: "error", reason: "denied", title: RECOVERY_ERROR_COPY.denied.title, message: RECOVERY_ERROR_COPY.denied.body };
  }
}

/**
 * The native deep-link entry point (called from app/+native-intent.tsx for BOTH a cold start and
 * a link that arrives while the app is running). A recovery link is captured (full raw URL,
 * #fragment included) and routed to /reset-password; any other link is returned unchanged and
 * nothing is captured.
 */
export function routeIncomingLink(path: string, capture: (rawUrl: string) => void): string {
  const route = recoveryRouteFor(path);
  if (!route) return path;
  capture(path);
  return route;
}
