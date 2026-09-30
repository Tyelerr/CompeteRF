// src/utils/google-auth.ts
// "Continue with Google" — feature flags + pure logic (no Supabase / router / react-native
// imports, so src/lib/supabase.ts can import it and every rule is unit-tested in
// src/utils/__tests__/google-auth.test.ts).
//
//  • Web   : supabase.auth.signInWithOAuth({ provider: "google" }) with PKCE → Google →
//            Supabase /auth/v1/callback → https://<site>/auth/callback?code=… → exchangeCodeForSession
//            → the shared post-auth step (profile → app, no profile → Complete Profile).
//  • Native: Google native sign-in → ID token (nonce = SHA-256 of a raw nonce) →
//            supabase.auth.signInWithIdToken → the same shared post-auth step.
// Both are OFF until Google Cloud + the Supabase Google provider are configured and tested.

/**
 * Web "Continue with Google" — ON (controlled web test; Google OAuth app in Testing, Supabase
 * Google provider enabled with the Compete Web client). Setting it back to false restores the
 * previous web client exactly (implicit flow, no Google button).
 */
export const GOOGLE_SIGN_IN_WEB_ENABLED = true;
/** Native Google sign-in (also needs the native library + a native build). */
export const GOOGLE_SIGN_IN_NATIVE_ENABLED = false;

/**
 * Supabase auth flow for this client. PKCE only on web and only when web Google is enabled —
 * so turning the flag off restores exactly today's (implicit) client. Native never needs PKCE
 * (Apple/Google use ID tokens; recovery uses token_hash + verifyOtp, which is flow-agnostic).
 */
export function authFlowType(isWeb: boolean, webGoogleEnabled: boolean = GOOGLE_SIGN_IN_WEB_ENABLED): "pkce" | "implicit" {
  return isWeb && webGoogleEnabled ? "pkce" : "implicit";
}

const ALLOWED_ORIGIN = /^https:\/\/(www\.)?thecompeteapp\.com$|^http:\/\/localhost(:\d+)?$/;

/** The page Supabase returns to after Google. Must be in Supabase's Redirect URLs allow-list. */
export function oauthCallbackUrl(origin: string | null | undefined): string | null {
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return null;
  return `${origin}/auth/callback`;
}

// ── /auth/callback ──────────────────────────────────────────────────────────────────────────

export type OAuthCallback =
  | { kind: "code"; code: string }
  | { kind: "error"; reason: "cancelled" | "failed" }
  | { kind: "missing" };

type ParamSource = Record<string, string | string[] | undefined | null>;
const firstOf = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? undefined;

const parseParams = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const pair of s.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const k = decodeURIComponent((i === -1 ? pair : pair.slice(0, i)).replace(/\+/g, " "));
    const v = decodeURIComponent((i === -1 ? "" : pair.slice(i + 1)).replace(/\+/g, " "));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
};

/** Reads ?code=… (PKCE) or Supabase's ?error=…/#error=… from the callback URL / route params. */
export function parseOAuthCallback(url: string | null | undefined, routeParams: ParamSource = {}): OAuthCallback {
  let query: Record<string, string> = {};
  let hash: Record<string, string> = {};
  if (url) {
    const hashAt = url.indexOf("#");
    const before = hashAt === -1 ? url : url.slice(0, hashAt);
    const qAt = before.indexOf("?");
    try {
      query = qAt === -1 ? {} : parseParams(before.slice(qAt + 1));
      hash = hashAt === -1 ? {} : parseParams(url.slice(hashAt + 1));
    } catch {
      return { kind: "error", reason: "failed" };
    }
  }
  const get = (k: string) => {
    const v = hash[k] ?? query[k] ?? firstOf(routeParams[k]);
    return v ? String(v) : undefined;
  };
  const error = get("error");
  if (error || get("error_code")) {
    const text = `${error ?? ""} ${get("error_code") ?? ""} ${get("error_description") ?? ""}`;
    return { kind: "error", reason: /access_denied|cancel/i.test(text) ? "cancelled" : "failed" };
  }
  const code = get("code");
  return code ? { kind: "code", code } : { kind: "missing" };
}

export const OAUTH_CALLBACK_COPY = {
  cancelled: { title: "SIGN-IN CANCELLED", body: "Google sign-in was cancelled. You can try again or use another way to log in." },
  failed: { title: "SIGN-IN FAILED", body: "We couldn't finish signing you in with Google. Please try again." },
  missing: { title: "SIGN-IN LINK INVALID", body: "This sign-in link is missing the information needed to continue. Please try again." },
} as const;

export type OAuthCallbackResult =
  | { kind: "signedIn"; userId: string }
  | { kind: "error"; title: string; message: string };

/**
 * Finishes the web callback. A code is exchanged once; if that fails but a session already
 * exists (the page was reloaded after a successful exchange), that session is used — a reload
 * never shows an error for an account that is actually signed in.
 */
export async function runOAuthCallback(
  cb: OAuthCallback,
  deps: { exchange: (code: string) => Promise<string | null>; currentUserId: () => Promise<string | null> },
): Promise<OAuthCallbackResult> {
  const fail = (k: keyof typeof OAUTH_CALLBACK_COPY): OAuthCallbackResult => ({
    kind: "error",
    title: OAUTH_CALLBACK_COPY[k].title,
    message: OAUTH_CALLBACK_COPY[k].body,
  });
  if (cb.kind === "error") return fail(cb.reason);
  if (cb.kind === "code") {
    try {
      const userId = await deps.exchange(cb.code);
      if (userId) return { kind: "signedIn", userId };
    } catch {
      /* fall through to an existing session */
    }
  }
  try {
    const existing = await deps.currentUserId();
    if (existing) return { kind: "signedIn", userId: existing };
  } catch {
    /* no session */
  }
  return fail(cb.kind === "missing" ? "missing" : "failed");
}

/** Complete Profile name pre-fill from Google's user_metadata (never a username). */
export function googleNameHints(userMetadata: unknown): { firstName: string | null; lastName: string | null } {
  const m = userMetadata && typeof userMetadata === "object" ? (userMetadata as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null);
  let firstName = str(m.given_name);
  let lastName = str(m.family_name);
  if (!firstName && !lastName) {
    const full = str(m.full_name) ?? str(m.name);
    if (full) {
      const parts = full.split(/\s+/);
      firstName = parts[0] ?? null;
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }
  }
  return { firstName, lastName };
}
