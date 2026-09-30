import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { GOOGLE_SIGN_IN_NATIVE_ENABLED, GOOGLE_SIGN_IN_WEB_ENABLED, oauthCallbackUrl } from "../../utils/google-auth";
import type { SocialSignInResult } from "../types/auth.types";
import { isSocialSignup } from "../../utils/auth-routing";
import { googleSignInProvider } from "./google-signin.provider";

/**
 * Default redirect URL for password reset emails. Uses the app's custom
 * scheme (configured in app.json as "competerf") so Expo Router's
 * automatic deep linking routes the incoming URL to app/reset-password.tsx
 * with token_hash and type available as search params.
 *
 * This must match one of the allowed Redirect URLs configured in the
 * Supabase Dashboard under Authentication > URL Configuration.
 */
const PASSWORD_RESET_REDIRECT = "competerf://reset-password";

/**
 * Generate a cryptographically secure random nonce for Apple / Google sign-in.
 * Uses expo-crypto's OS-level RNG, not Math.random() which is predictable
 * and would allow an attacker to brute-force the raw nonce from the hashed
 * nonce exposed in the identity token.
 */
async function generateSecureNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Nonce pair for an ID-token sign-in: the provider (Apple / Google) receives `digest`
 * (SHA-256 hex of `raw`) and embeds it in the ID token's nonce claim; Supabase receives
 * `raw`, hashes it, and rejects the token unless the hashes match (replay protection).
 */
async function createNoncePair(): Promise<{ raw: string; digest: string }> {
  const raw = await generateSecureNonce();
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, digest };
}

export const authService = {
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signInWithApple() {
    const rawNonce = await generateSecureNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      throw new Error("No identity token returned from Apple");
    }
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    return {
      user: data.user,
      session: data.session,
      fullName: credential.fullName,
    };
  },

  /**
   * Whether "Continue with Google" is offered here. Web: the web flag (OAuth redirect).
   * Native: the native flag AND the native module (false in Expo Go / without the library).
   */
  async isGoogleSignInAvailable(): Promise<boolean> {
    if (Platform.OS === "web") return GOOGLE_SIGN_IN_WEB_ENABLED;
    if (!GOOGLE_SIGN_IN_NATIVE_ENABLED) return false;
    try {
      return await googleSignInProvider.isAvailable();
    } catch {
      return false;
    }
  },

  /**
   * Web "Continue with Google": redirects the browser to Google via Supabase (PKCE — the code
   * verifier stays in this browser). Returns to /auth/callback, which exchanges the code.
   * Never looks anything up by email; same-email accounts are linked by Supabase itself.
   */
  async startGoogleWebSignIn(): Promise<void> {
    if (!GOOGLE_SIGN_IN_WEB_ENABLED) throw new Error("Google sign-in is not available");
    const redirectTo = oauthCallbackUrl(typeof window !== "undefined" ? window.location.origin : null);
    if (!redirectTo) throw new Error("Google sign-in is not available on this site");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
  },

  /** /auth/callback: trades the one-time PKCE code for a session. Returns the user id or null. */
  async exchangeOAuthCode(code: string): Promise<string | null> {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return null;
    return data.session?.user.id ?? data.user?.id ?? null;
  },

  /** The signed-in user (id + metadata), or null. */
  async getCurrentUser(): Promise<{ id: string; userMetadata: Record<string, unknown> } | null> {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    return user ? { id: user.id, userMetadata: (user.user_metadata ?? {}) as Record<string, unknown> } : null;
  },

  /**
   * Native Google sign-in: Google ID token (nonce claim = SHA-256 of rawNonce) → Supabase
   * signInWithIdToken with the matching raw nonce. Nonce verification stays ON in Supabase.
   * Returns null when the user cancels the chooser. Never looks anything up by email first —
   * same-email accounts are linked by Supabase's own automatic identity linking.
   */
  async signInWithGoogle(): Promise<SocialSignInResult | null> {
    if (!GOOGLE_SIGN_IN_NATIVE_ENABLED) throw new Error("Google sign-in is not available");
    const { raw: rawNonce, digest } = await createNoncePair();
    const result = await googleSignInProvider.getIdToken(digest);
    if (result.type === "cancelled") return null;
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: result.idToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    if (!data.user) throw new Error("Google sign-in returned no user");
    return {
      userId: data.user.id,
      nameHints: { firstName: result.givenName, lastName: result.familyName },
    };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Send a password reset email. The link in the email opens the app via
   * the competerf:// scheme with a token_hash and type=recovery as query
   * parameters. The reset-password screen then calls verifyOtp to exchange
   * the token for a short-lived recovery session, at which point the user
   * can set a new password.
   *
   * @param email - the user's email address
   * @param redirectTo - optional override of the redirect URL, defaulting to
   *   competerf://reset-password. Primarily exposed for testing.
   */
  async sendPasswordResetEmail(
    email: string,
    redirectTo: string = PASSWORD_RESET_REDIRECT,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    return { error: error?.message ?? null };
  },

  async updatePassword(newPassword: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  },

  /**
   * True when the signed-in account was created through a social provider (Apple / Google)
   * rather than an email + password signup. NOT a has-password check — see isSocialSignup.
   * complete-profile combines it with "no profile yet" to require a Compete password.
   */
  async currentAccountIsSocialSignup(): Promise<boolean> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Not signed in");
    return isSocialSignup(data.user.app_metadata);
  },

  /**
   * Adds a password to the CURRENT Supabase user (same auth.users id — no new account, no
   * new identity). Afterwards username + password and email + password sign-in work too.
   */
  async addPasswordToCurrentAccount(
    password: string,
  ): Promise<{ error: string | null; code: string | null }> {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null, code: (error as { code?: string } | null)?.code ?? null };
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  // Username + password sign-in WITHOUT the client ever seeing the account email (M3 privacy):
  // the login-with-username Edge Function resolves the email server-side, signs in, and returns
  // only the session tokens, which we install with setSession. Every failure is the same
  // generic error. There is deliberately NO fallback to reading profiles.email.
  async signInWithUsername(
    username: string,
    password: string,
  ): Promise<{ userId: string | null; error: string | null }> {
    const { data, error } = await supabase.functions.invoke("login-with-username", {
      body: { username: username.trim(), password },
    });
    const session = (data as { session?: { access_token?: string; refresh_token?: string } } | null)?.session;
    if (error || !session?.access_token || !session?.refresh_token) {
      return { userId: null, error: "invalid_credentials" };
    }
    const { data: set, error: setErr } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (setErr || !set.session) return { userId: null, error: "invalid_credentials" };
    return { userId: set.session.user.id, error: null };
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },
};