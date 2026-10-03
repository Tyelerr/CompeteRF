// src/viewmodels/useLogin.ts
// Login screen viewmodel: email + password (direct Supabase) or username + password
// (login-with-username Edge Function — the email never reaches this device). On success the
// shared usePostAuthNavigation step routes by account status, so a valid session with no
// profile goes to /auth/complete-profile (never /auth/register, which would sign up again).
// Email + correct password on an unconfirmed account (Supabase "Confirm email" ON) goes to the
// Email Not Confirmed screen with a resend option; every other failure stays generic. Username
// sign-in resolves the email from a PROFILE, and profiles exist only after confirmation, so it
// never meets an unconfirmed account (it stays generic by design).

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { authService } from "../models/services/auth.service";
import { postAuthErrorMessage } from "../utils/auth-routing";
import { isEmailNotConfirmedError } from "../utils/email-confirmation";
import { parseLoginIdentifier } from "../utils/login-identifier";
import { usePostAuthNavigation } from "./hooks/use.post.auth.navigation";
import { usePendingConfirmationStore } from "./stores/pending-confirmation.store";

const INVALID_CREDENTIALS = "Incorrect credentials. Please try again.";

// Only a real credential rejection reads as "incorrect credentials". Offline / server / rate-limit
// failures say what happened — otherwise the user keeps retyping a correct password.
const loginFailureMessage = (err: unknown): string => {
  const e = err as { name?: string; status?: number } | null | undefined;
  if (!e) return INVALID_CREDENTIALS;
  if (e.status === 429) return "Too many sign-in attempts. Wait a minute and try again.";
  if (
    e.name === "AuthRetryableFetchError" ||
    (typeof e.status === "number" && (e.status === 0 || e.status >= 500))
  )
    return "Couldn't reach Compete. Check your connection and try again.";
  return INVALID_CREDENTIALS;
};

export function useLogin() {
  const router = useRouter();
  const { completeSignIn } = usePostAuthNavigation();
  const startPending = usePendingConfirmationStore((s) => s.start);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    setError("");
    if (!identifier.trim()) { setError("Please enter your email or username"); return; }
    if (!password) { setError("Please enter your password"); return; }
    setLoading(true);
    try {
      const { kind, value } = parseLoginIdentifier(identifier);
      let userId: string | null = null;
      let signInError: unknown = null;
      if (kind === "email") {
        let notConfirmed = false;
        const data = await authService.signIn(value, password).catch((err) => {
          // Supabase reports this only after the password check passed — no account oracle.
          notConfirmed = isEmailNotConfirmedError(err);
          signInError = err;
          return null;
        });
        if (notConfirmed) {
          startPending(value, "login", null);
          router.push("/auth/check-email" as any);
          return;
        }
        userId = data?.user?.id ?? null;
      } else {
        const res = await authService.signInWithUsername(value, password);
        userId = res.error ? null : res.userId;
      }
      if (!userId) { setError(loginFailureMessage(signInError)); return; }
      const status = await completeSignIn(userId);
      const message = postAuthErrorMessage(status);
      if (message) setError(message);
    } catch (err) {
      setError(loginFailureMessage(err));
    } finally {
      setLoading(false);
    }
  }, [identifier, password, completeSignIn, router, startPending]);

  return { identifier, setIdentifier, password, setPassword, error, loading, handleLogin };
}
