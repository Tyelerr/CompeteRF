// src/models/services/email-confirmation.service.ts
// Supabase calls for email/password signup with (or without) "Confirm email":
// signUp (with onboarding metadata), resend of the signup confirmation, and verification of the
// emailed link. Mapping of results/errors is pure and lives in src/utils/email-confirmation.ts.
// Never logs emails, tokens or links.

import { supabase } from "../../lib/supabase";
import {
  ConfirmCredentials,
  ConfirmVerifyResult,
  EMAIL_CONFIRM_REDIRECT,
  ResendOutcome,
  SignupMetadata,
  SignupOutcome,
  classifyResendError,
  signupOutcome,
} from "../../utils/email-confirmation";

const isExpiredError = (message: string | undefined, code: string | undefined) =>
  /expired|otp_expired|already|used|not found/i.test(`${code ?? ""} ${message ?? ""}`);

export const emailConfirmationService = {
  /**
   * Creates the auth user. Confirm email OFF → a session comes back (signedIn). Confirm email ON
   * → no session (checkEmail) and Supabase emails the confirmation link. The form values ride
   * along in user_metadata.compete_signup for Complete Profile to pre-fill later.
   */
  async signUpWithEmail(email: string, password: string, metadata: SignupMetadata): Promise<SignupOutcome> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { compete_signup: metadata }, emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
      });
      return signupOutcome(data, error as { code?: string; status?: number; message?: string } | null);
    } catch {
      return signupOutcome(null, { message: "network" });
    }
  },

  /** Sends a fresh signup confirmation link. Same outcome for unknown / already-confirmed addresses. */
  async resendSignupConfirmation(email: string): Promise<ResendOutcome> {
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
      });
      return classifyResendError(error as { code?: string; status?: number; message?: string } | null);
    } catch {
      return "failed";
    }
  },

  /** Verifies the confirmation link — called ONLY from the Continue button. Creates the session. */
  async verifyConfirmation(credentials: ConfirmCredentials): Promise<ConfirmVerifyResult> {
    if (credentials.kind === "token_hash") {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: credentials.tokenHash, type: credentials.type });
      if (error) return { ok: false, expired: isExpiredError(error.message, (error as { code?: string }).code), userId: null };
      return { ok: true, expired: false, userId: data.session?.user.id ?? data.user?.id ?? null };
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    });
    if (error) return { ok: false, expired: isExpiredError(error.message, (error as { code?: string }).code), userId: null };
    return { ok: true, expired: false, userId: data.session?.user.id ?? data.user?.id ?? null };
  },
};
