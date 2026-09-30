// src/viewmodels/hooks/use.social.sign.in.ts
// Provider sign-in actions for the auth screens (Apple today; Google once the native provider
// ships). Each provider only produces a Supabase session — routing is the shared
// usePostAuthNavigation step, so every provider gets the same account-status handling.

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { authService } from "../../models/services/auth.service";
import { AuthNameHints, AuthStatus } from "../../models/types/auth.types";
import { postAuthErrorMessage } from "../../utils/auth-routing";
import { usePostAuthNavigation } from "./use.post.auth.navigation";

type SocialProvider = "apple" | "google";

export function useSocialSignIn() {
  const { completeSignIn } = usePostAuthNavigation();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const [googleAvailable, setGoogleAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    authService.isGoogleSignInAvailable().then((ok) => { if (active) setGoogleAvailable(ok); });
    return () => { active = false; };
  }, []);

  const finish = useCallback(async (userId: string, nameHints?: AuthNameHints) => {
    const status: AuthStatus = await completeSignIn(userId, { nameHints });
    const message = postAuthErrorMessage(status);
    if (message) setError(message);
  }, [completeSignIn]);

  const signInWithApple = useCallback(async () => {
    setError("");
    setPending("apple");
    try {
      const result = await authService.signInWithApple();
      if (!result.user) { setError("Sign in failed. Please try again."); return; }
      await finish(result.user.id, {
        firstName: result.fullName?.givenName,
        lastName: result.fullName?.familyName,
      });
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setError("Apple Sign In failed. Please try again.");
    } finally {
      setPending(null);
    }
  }, [finish]);

  const signInWithGoogle = useCallback(async () => {
    setError("");
    setPending("google");
    // Web: full-page redirect to Google (PKCE); /auth/callback finishes via the shared post-auth
    // step. The page unloads on success, so only a failure to START comes back here.
    if (Platform.OS === "web") {
      try {
        await authService.startGoogleWebSignIn();
      } catch {
        setError("Google Sign In failed. Please try again.");
        setPending(null);
      }
      return;
    }
    try {
      const result = await authService.signInWithGoogle();
      if (!result) return; // chooser dismissed
      await finish(result.userId, result.nameHints);
    } catch {
      setError("Google Sign In failed. Please try again.");
    } finally {
      setPending(null);
    }
  }, [finish]);

  return {
    signInWithApple,
    signInWithGoogle,
    googleAvailable,
    appleLoading: pending === "apple",
    googleLoading: pending === "google",
    error,
  };
}
