import { supabase } from "@/src/lib/supabase";
import { authService } from "@/src/models/services/auth.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";

type VerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Handles the password reset flow after the user taps the recovery link
 * in their email. The link opens the app via the competerf:// scheme and
 * lands on app/reset-password.tsx with a token_hash query parameter.
 *
 * The hook:
 *   1. Reads token_hash from the URL.
 *   2. Calls supabase.auth.verifyOtp to exchange the token for a short
 *      recovery session.
 *   3. Once the session is ready, lets the user set a new password.
 *
 * This hook intentionally does NOT use a global Linking.addEventListener
 * because Expo Router already wires custom-scheme URLs to routes via
 * app.json's "scheme" field. By the time this hook mounts, the URL params
 * are already available via useLocalSearchParams.
 */
export function useResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: "idle" });

  const params = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
  }>();

  // Track whether we've already attempted verification for the current token
  // so React strict-mode double-mount or re-renders don't re-fire verifyOtp.
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const tokenHash = typeof params.token_hash === "string" ? params.token_hash : undefined;
    const type = typeof params.type === "string" ? params.type : undefined;

    // No token yet - could mean deep link hasn't arrived, or user opened
    // the route directly. Stay in idle and let the screen show a waiting UI.
    if (!tokenHash) {
      return;
    }

    // Avoid re-verifying the same token if the effect fires twice.
    if (verifiedTokenRef.current === tokenHash) {
      return;
    }
    verifiedTokenRef.current = tokenHash;

    // Supabase sends type=recovery for password reset. Guard against
    // unexpected types so we don't accidentally consume a magic-link token
    // or similar on the password reset screen.
    if (type !== "recovery") {
      setVerify({
        kind: "error",
        message: "This link is not a password reset link.",
      });
      return;
    }

    setVerify({ kind: "verifying" });

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => {
        if (error) {
          setVerify({
            kind: "error",
            message:
              error.message ||
              "This reset link is invalid or has expired. Please request a new one.",
          });
        } else {
          setVerify({ kind: "ready" });
        }
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong verifying your reset link.";
        setVerify({ kind: "error", message });
      });
  }, [params.token_hash, params.type]);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      setSubmitError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setSubmitError(null);

    const { error } = await authService.updatePassword(password);

    setLoading(false);

    if (error) {
      setSubmitError(error);
    } else {
      setSuccess(true);
    }
  };

  // Derived flags to keep the screen component simple.
  const sessionReady = verify.kind === "ready";
  const verifying = verify.kind === "verifying" || verify.kind === "idle";
  const verifyError = verify.kind === "error" ? verify.message : null;

  return {
    params,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    sessionReady,
    verifying,
    verifyError,
    success,
    // Legacy alias: existing screen reads error for the submit-form error.
    // We preserve that, and expose verifyError separately for the new
    // error-screen branch.
    error: submitError,
    handleUpdatePassword,
  };
}