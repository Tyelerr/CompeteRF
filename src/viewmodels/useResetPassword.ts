import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { authService } from "@/src/models/services/auth.service";
import { passwordRecoveryService } from "@/src/models/services/password-recovery.service";
import {
  RecoveryPhase,
  continueRecovery,
  isRecoveryUrl,
  linkKey,
  parseRecoveryLink,
  phaseForLink,
  recoveryDebugInfo,
  resetSuccessCopy,
} from "@/src/utils/recovery-link";
import { useHydrated } from "@/src/viewmodels/hooks/use.hydrated";
import { useRecoveryLinkStore } from "@/src/viewmodels/stores/recovery-link.store";

/**
 * Password-reset screen viewmodel.
 *
 * Where the recovery link comes from, in priority order:
 *  1. The link captured by app/+native-intent.tsx (native): the FULL raw URL — including the
 *     #fragment Supabase uses for tokens/errors — for both a cold start and a link that arrives
 *     while the app is already running. (Routing alone drops the fragment, and
 *     Linking.getInitialURL() is null when the app was already running — the old bug.)
 *  2. The current / initial URL from expo-linking (web: the browser URL incl. its #fragment).
 *  3. expo-router query params (?token_hash=…&type=recovery, ?code=…).
 *
 * Nothing is verified when the link arrives: valid links wait for the user to tap Continue
 * (handleContinue), so a link scanner or preview that merely opens the page consumes nothing.
 * Parsing lives in src/utils/recovery-link.ts, Supabase work in password-recovery.service.ts.
 */
export function useResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const routeParams = useLocalSearchParams();
  const capturedUrl = useRecoveryLinkStore((s) => s.url);
  const capturedSeq = useRecoveryLinkStore((s) => s.seq);
  const clearCaptured = useRecoveryLinkStore((s) => s.clear);
  const liveUrl = Linking.useURL();

  // undefined = still resolving the launch URL (so we don't flash "missing" on a cold start).
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Linking.getInitialURL()
      .then((url) => alive && setInitialUrl(url ?? null))
      .catch(() => alive && setInitialUrl(null));
    return () => {
      alive = false;
    };
  }, []);

  const sourceUrl =
    capturedUrl ??
    (isRecoveryUrl(liveUrl) ? liveUrl : null) ??
    (isRecoveryUrl(initialUrl) ? initialUrl : null);

  const link = useMemo(() => parseRecoveryLink(sourceUrl, routeParams), [sourceUrl, routeParams]);
  const key = `${capturedSeq}|${linkKey(link)}`;
  // Web static export: the pre-rendered HTML is the neutral VERIFYING state (no URL at build
  // time), so the first client render must match it (React #418) — resolve only after hydration.
  const hydrated = useHydrated();
  const resolving =
    !hydrated || (initialUrl === undefined && !capturedUrl && link.status === "error" && link.reason === "missing");

  // The phase is tied to the link it was computed for: a NEW link (new key) restarts the flow at
  // "awaiting Continue" (or its error) without an effect; re-renders keep the current phase.
  const [progress, setProgress] = useState<{ key: string; phase: RecoveryPhase } | null>(null);
  const phase: RecoveryPhase = progress && progress.key === key ? progress.phase : phaseForLink(link);

  const handleContinue = useCallback(async () => {
    if (phase.kind !== "awaiting_continue") return;
    setProgress({ key, phase: { kind: "verifying" } });
    const next = await continueRecovery(phase, (c) => passwordRecoveryService.establishRecoverySession(c));
    setProgress({ key, phase: next });
  }, [phase, key]);

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
      clearCaptured(); // the link is spent — never reuse its credentials
      setSuccess(true);
    }
  };

  return {
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    success,
    error: submitError,
    handleUpdatePassword,
    // recovery-link flow
    resolving,
    awaitingContinue: !resolving && phase.kind === "awaiting_continue",
    verifying: phase.kind === "verifying",
    sessionReady: phase.kind === "ready",
    verifyErrorTitle: !resolving && phase.kind === "error" ? phase.title : null,
    verifyError: !resolving && phase.kind === "error" ? phase.message : null,
    verifyErrorReason: !resolving && phase.kind === "error" ? phase.reason : null,
    // Development builds only (null in production): which pieces arrived, never their values.
    verifyDebugInfo: recoveryDebugInfo(__DEV__, sourceUrl, routeParams),
    handleContinue,
    // Web: "Back to Login" (never "open the app"); native: continue into the signed-in app.
    successCopy: resetSuccessCopy(Platform.OS),
  };
}
