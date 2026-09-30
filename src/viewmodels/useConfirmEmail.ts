// src/viewmodels/useConfirmEmail.ts
// /auth/confirm — the signup confirmation link (…/auth/confirm?token_hash=…&type=email).
// Same pattern as the password-reset link (useResetPassword):
//  • the link is parsed on arrival but NEVER verified then — the user taps Continue, so a link
//    scanner or preview that merely opens the page consumes nothing;
//  • hydration-safe on web (the static HTML is the neutral "Checking…" state);
//  • after verifyOtp creates the session, the shared post-auth step routes it:
//    no profile → Complete Profile, profile → app.
// Token values are never rendered or logged; the debug summary exists in development only.

import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { emailConfirmationService } from "../models/services/email-confirmation.service";
import type { AuthStatus } from "../models/types/auth.types";
import { postAuthErrorMessage } from "../utils/auth-routing";
import {
  ConfirmPhase,
  confirmDebugInfo,
  confirmLinkKey,
  confirmPhaseForLink,
  continueConfirmation,
  parseConfirmLink,
} from "../utils/email-confirmation";
import { useHydrated } from "./hooks/use.hydrated";
import { usePostAuthNavigation } from "./hooks/use.post.auth.navigation";

export function useConfirmEmail() {
  const hydrated = useHydrated();
  const routeParams = useLocalSearchParams();
  const liveUrl = Linking.useURL();
  const { completeSignIn } = usePostAuthNavigation();

  // undefined = still resolving the launch URL (so a #fragment link doesn't flash "invalid").
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
  const sourceUrl = liveUrl ?? initialUrl ?? null;

  const link = useMemo(() => parseConfirmLink(sourceUrl, routeParams), [sourceUrl, routeParams]);
  const key = confirmLinkKey(link);

  // The phase belongs to the link it was computed for (a new link restarts the flow).
  const [progress, setProgress] = useState<{ key: string; phase: ConfirmPhase } | null>(null);
  const phase: ConfirmPhase = progress && progress.key === key ? progress.phase : confirmPhaseForLink(link);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);

  const route = useCallback(
    async (userId: string) => {
      setRouting(true);
      setRouteError(null);
      const status: AuthStatus = await completeSignIn(userId);
      setRouteError(postAuthErrorMessage(status));
      setRouting(false);
    },
    [completeSignIn],
  );

  const handleContinue = useCallback(async () => {
    if (phase.kind !== "awaiting_continue") return;
    setProgress({ key, phase: { kind: "verifying" } });
    const next = await continueConfirmation(phase, (c) => emailConfirmationService.verifyConfirmation(c));
    setProgress({ key, phase: next });
    if (next.kind === "confirmed") await route(next.userId);
  }, [phase, key, route]);

  const retryRouting = useCallback(async () => {
    if (phase.kind === "confirmed") await route(phase.userId);
  }, [phase, route]);

  const resolving =
    !hydrated || (initialUrl === undefined && link.status === "error" && link.reason === "missing");
  return {
    resolving,
    awaitingContinue: !resolving && phase.kind === "awaiting_continue",
    verifying: phase.kind === "verifying",
    confirmed: phase.kind === "confirmed",
    routing,
    routeError,
    errorTitle: !resolving && phase.kind === "error" ? phase.title : null,
    errorMessage: !resolving && phase.kind === "error" ? phase.message : null,
    // Development builds only (null in production): which pieces arrived, never their values.
    debugInfo: confirmDebugInfo(__DEV__, sourceUrl, routeParams),
    handleContinue,
    retryRouting,
  };
}
