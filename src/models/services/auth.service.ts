import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { supabase } from "../../lib/supabase";

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
 * Generate a cryptographically secure random nonce for Apple Sign In.
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

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async resolveEmailFromUsername(username: string): Promise<string | null> {
    const { data } = await supabase
      .from("profiles")
      .select("email")
      .ilike("user_name", username.trim())
      .maybeSingle();
    return data?.email ?? null;
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },
};