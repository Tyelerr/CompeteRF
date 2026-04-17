import { supabase } from "@/src/lib/supabase";
import { authService } from "@/src/models/services/auth.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";

type VerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "ready" }
  | { kind: "error"; message: string; debugUrl?: string };

/**
 * Parse a URL hash fragment (the part after '#') into a key/value map.
 * Supabase's implicit flow redirects to
 *   competerf://reset-password#access_token=xxx&refresh_token=yyy&type=recovery
 * and we need to extract those tokens to call setSession directly.
 */
function parseHashFragment(url: string): Record<string, string> {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return {};
  const hash = url.substring(hashIndex + 1);
  const result: Record<string, string> = {};
  hash.split("&").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k && v !== undefined) {
      result[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  });
  return result;
}

/**
 * Handles the password reset flow after the user taps the recovery link
 * in their email. Supports two Supabase redirect flows:
 *
 *   A) token_hash query-param flow (newer PKCE-style)
 *      URL: competerf://reset-password?token_hash=xxx&type=recovery
 *      Action: call verifyOtp to consume the token and establish session.
 *
 *   B) access_token hash-fragment flow (implicit/legacy)
 *      URL: competerf://reset-password#access_token=xxx&refresh_token=yyy&type=recovery
 *      Action: call setSession directly; verification already happened server-side.
 *
 * Whichever flow Supabase uses, by the time this hook runs we have a
 * session ready for the user to set a new password.
 *
 * On failure, the error branch carries a human-readable message AND a
 * debugUrl so the screen can display it during diagnosis.
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
    access_token?: string;
    refresh_token?: string;
  }>();

  // Track whether we've already attempted verification for the current
  // token/url so React strict-mode double-mount doesn't double-fire.
  const verifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      // Collect everything we can see about the URL that opened this screen.
      const initialUrl = (await Linking.getInitialURL()) ?? "(no initial URL)";
      const hashParams = parseHashFragment(initialUrl);

      const tokenHash = typeof params.token_hash === "string" ? params.token_hash : undefined;
      const type =
        (typeof params.type === "string" && params.type) ||
        hashParams.type ||
        undefined;
      const accessToken =
        (typeof params.access_token === "string" && params.access_token) ||
        hashParams.access_token ||
        undefined;
      const refreshToken =
        (typeof params.refresh_token === "string" && params.refresh_token) ||
        hashParams.refresh_token ||
        undefined;

      // Compose a debug snapshot we can show the user if anything fails.
      const debugSummary = [
        `url=${initialUrl}`,
        `token_hash=${tokenHash ? "(present)" : "(missing)"}`,
        `type=${type ?? "(missing)"}`,
        `access_token=${accessToken ? "(present)" : "(missing)"}`,
        `refresh_token=${refreshToken ? "(present)" : "(missing)"}`,
      ].join("\n");

      // Log for dev-client debugging visible via Metro logs.
      console.log("[useResetPassword] Arrived with:", debugSummary);

      // Dedupe by either token present, so we don't reverify on re-render.
      const dedupeKey = tokenHash ?? accessToken ?? null;
      if (dedupeKey && verifiedKeyRef.current === dedupeKey) {
        return;
      }

      // --- Flow A: query-param token_hash + verifyOtp ---
      if (tokenHash) {
        if (type && type !== "recovery") {
          setVerify({
            kind: "error",
            message: `Unexpected link type: ${type}. Expected "recovery".`,
            debugUrl: initialUrl,
          });
          return;
        }
        verifiedKeyRef.current = tokenHash;
        setVerify({ kind: "verifying" });
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (error) {
          console.warn("[useResetPassword] verifyOtp error:", error);
          setVerify({
            kind: "error",
            message: error.message || "Could not verify reset link.",
            debugUrl: initialUrl,
          });
        } else {
          setVerify({ kind: "ready" });
        }
        return;
      }

      // --- Flow B: hash-fragment access_token + refresh_token + setSession ---
      if (accessToken && refreshToken) {
        verifiedKeyRef.current = accessToken;
        setVerify({ kind: "verifying" });
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          console.warn("[useResetPassword] setSession error:", error);
          setVerify({
            kind: "error",
            message: error.message || "Could not establish reset session.",
            debugUrl: initialUrl,
          });
        } else {
          setVerify({ kind: "ready" });
        }
        return;
      }

      // Neither flow delivered a token. Show a diagnostic error so the user
      // sees something better than an infinite VERIFYING... spinner.
      setVerify({
        kind: "error",
        message:
          "No reset token was received. The link may have expired, or the email client stripped the token parameters.",
        debugUrl: debugSummary,
      });
    })().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Something went wrong verifying your reset link.";
      setVerify({ kind: "error", message });
    });
  }, [params.token_hash, params.type, params.access_token, params.refresh_token]);

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
  const verifyDebugUrl = verify.kind === "error" ? verify.debugUrl ?? null : null;

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
    verifyDebugUrl,
    success,
    error: submitError,
    handleUpdatePassword,
  };
}