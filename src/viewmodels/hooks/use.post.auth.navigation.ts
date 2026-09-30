// src/viewmodels/hooks/use.post.auth.navigation.ts
// The ONE post-sign-in step for every sign-in method (email/password, username/password,
// Apple, Google, and complete-profile). Waits for AuthProvider's hydration to settle, maps the
// resulting status through resolvePostAuthRoute, and navigates:
//   ready → app · needsProfile → /auth/complete-profile · disabled / error / signedOut → stay.
// Screens never look up the profile themselves.

import { useRouter } from "expo-router";
import { useCallback } from "react";
import { AuthNameHints, AuthStatus } from "../../models/types/auth.types";
import { useAuthContext } from "../../providers/AuthProvider";
import { resolvePostAuthRoute } from "../../utils/auth-routing";

export function usePostAuthNavigation() {
  const router = useRouter();
  const { resolveAuthStatus } = useAuthContext();

  const completeSignIn = useCallback(
    async (
      userId: string,
      opts?: { nameHints?: AuthNameHints; force?: boolean },
    ): Promise<AuthStatus> => {
      const status = await resolveAuthStatus(userId, { force: opts?.force });
      const route = resolvePostAuthRoute(status);
      if (route.kind === "app") {
        router.replace("/(tabs)");
      } else if (route.kind === "completeProfile") {
        router.replace({
          pathname: "/auth/complete-profile",
          params: {
            firstName: opts?.nameHints?.firstName ?? "",
            lastName: opts?.nameHints?.lastName ?? "",
          },
        } as any);
      }
      return status;
    },
    [resolveAuthStatus, router],
  );

  return { completeSignIn };
}
