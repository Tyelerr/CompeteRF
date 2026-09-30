// src/utils/auth-routing.ts
// The ONE post-auth decision for every sign-in method (password, username, Apple, Google).
// Pure (no Supabase / router) so it is unit-testable: AuthProvider feeds it the hydration
// outcome, usePostAuthNavigation acts on the result.
import type { AuthStatus } from "../models/types/auth.types";

export type HydrationOutcome =
  | { kind: "noSession" }
  | { kind: "failed" }
  | { kind: "loaded"; profile: { is_disabled?: boolean | null } | null };

export const deriveAuthStatus = (outcome: HydrationOutcome): AuthStatus => {
  switch (outcome.kind) {
    case "noSession":
      return "signedOut";
    // A failed load says nothing about whether the profile exists.
    case "failed":
      return "error";
    case "loaded":
      if (!outcome.profile) return "needsProfile";
      return outcome.profile.is_disabled === true ? "disabled" : "ready";
  }
};

export type PostAuthRoute =
  | { kind: "app" }
  | { kind: "completeProfile" }
  // Stay put: signed out, still loading, disabled (AuthProvider's eject alert handles it),
  // or a load error (the screen shows a retryable message).
  | { kind: "stay" };

export const resolvePostAuthRoute = (status: AuthStatus): PostAuthRoute => {
  switch (status) {
    case "ready":
      return { kind: "app" };
    case "needsProfile":
      return { kind: "completeProfile" };
    case "loading":
    case "signedOut":
    case "disabled":
    case "error":
      return { kind: "stay" };
  }
};

export const AUTH_LOAD_ERROR_MESSAGE =
  "We couldn't load your account. Check your connection and try again.";

/** User-facing message for a post-auth status that stays on the current screen, if any. */
export const postAuthErrorMessage = (status: AuthStatus): string | null =>
  status === "error" ? AUTH_LOAD_ERROR_MESSAGE : null;

// ── Compete password for social-created accounts ───────────────────────────
// Onboarding rule: an account created through Apple (or later Google) that has NO Compete
// profile yet must create a Compete password during complete-profile. The password is added to
// the SAME Supabase user (updateUser), so username + password sign-in works too.
//
// isSocialSignup answers only "was this account created through a social provider rather than
// an email + password signup?" — it is NOT a has-password check. app_metadata.providers is not
// authoritative password data: adding a password later does not add "email" to it (prod: an
// Apple user with a password still lists ["apple"]). The "no profile yet" half of the rule is
// supplied by where it is used — complete-profile is only reached without a profile.
export const isSocialSignup = (
  appMetadata: { provider?: string | null; providers?: string[] | null } | null | undefined,
): boolean => {
  const providers = appMetadata?.providers ?? (appMetadata?.provider ? [appMetadata.provider] : []);
  return !providers.includes("email");
};

export const MIN_PASSWORD_LENGTH = 8;

/** Same rules as registration: at least 8 characters, and both entries match. */
export const newPasswordError = (password: string, confirm: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password !== confirm) return "Passwords do not match";
  return null;
};
