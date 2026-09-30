// src/viewmodels/useOAuthCallback.ts
// /auth/callback — where Supabase sends the browser back after "Continue with Google" (web).
//  • hydration-safe: nothing runs until the static HTML has hydrated (the page renders the
//    neutral "Signing you in…" state first);
//  • the one-time PKCE code is exchanged exactly once (StrictMode / re-render safe); a reload
//    after a successful exchange reuses the existing session instead of showing an error;
//  • the code is removed from the address bar, never rendered or logged;
//  • then the ONE shared post-auth step routes it: profile → app, no profile → Complete Profile
//    (with Google's first/last name as a pre-fill — never a username).

import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { authService } from "../models/services/auth.service";
import { postAuthErrorMessage } from "../utils/auth-routing";
import { googleNameHints, parseOAuthCallback, runOAuthCallback } from "../utils/google-auth";
import { useHydrated } from "./hooks/use.hydrated";
import { usePostAuthNavigation } from "./hooks/use.post.auth.navigation";

export function useOAuthCallback() {
  const hydrated = useHydrated();
  const routeParams = useLocalSearchParams();
  const { completeSignIn } = usePostAuthNavigation();
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    const href = typeof window !== "undefined" ? (window.location?.href ?? null) : null;
    (async () => {
      const result = await runOAuthCallback(parseOAuthCallback(href, routeParams), {
        exchange: (code) => authService.exchangeOAuthCode(code),
        currentUserId: async () => (await authService.getCurrentUser())?.id ?? null,
      });
      if (typeof window !== "undefined" && window.history?.replaceState) {
        window.history.replaceState(null, "", "/auth/callback"); // drop ?code=… / #error=…
      }
      if (result.kind === "error") {
        setFailure({ title: result.title, message: result.message });
        return;
      }
      const user = await authService.getCurrentUser().catch(() => null);
      const status = await completeSignIn(result.userId, { nameHints: googleNameHints(user?.userMetadata) });
      const message = postAuthErrorMessage(status);
      if (message) setFailure({ title: "SIGN-IN PROBLEM", message });
    })();
  }, [hydrated, routeParams, completeSignIn]);

  return { failure };
}
