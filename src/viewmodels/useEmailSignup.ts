// src/viewmodels/useEmailSignup.ts
// Register screen submit: wires the real services into runEmailSignup (src/utils/email-confirmation.ts).
//  Confirm email OFF (today): signUp → session → profile → welcome email → app (unchanged result).
//  Confirm email ON (later) : signUp → no session → /auth/check-email. No profile, no RLS error.

import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { emailConfirmationService } from "../models/services/email-confirmation.service";
import { profileService } from "../models/services/profile.service";
import { sendWelcomeEmail } from "../services/email/sendWelcomeEmail";
import { toTitleCase } from "../utils/helpers";
import { SignupForm, SignupRunResult, runEmailSignup } from "../utils/email-confirmation";
import { usePostAuthNavigation } from "./hooks/use.post.auth.navigation";
import { usePendingConfirmationStore } from "./stores/pending-confirmation.store";

export function useEmailSignup() {
  const router = useRouter();
  const { completeSignIn } = usePostAuthNavigation();
  const startPending = usePendingConfirmationStore((s) => s.start);
  // The auth user this screen already created, if its profile insert failed — a retry then
  // re-attempts only the profile (never a second signUp, which would say "already registered").
  const created = useRef<{ userId: string; email: string } | null>(null);

  const submit = useCallback(
    async (form: SignupForm): Promise<SignupRunResult> => {
      const result = await runEmailSignup(
        form,
        {
          signUp: (email, password, metadata) => emailConfirmationService.signUpWithEmail(email, password, metadata),
          createProfile: async (userId, f) => {
            const first = toTitleCase(f.firstName.trim());
            const last = toTitleCase(f.lastName.trim());
            await profileService.createProfile({
              id: userId,
              email: f.email.trim(),
              name: `${first} ${last}`,
              first_name: first,
              last_name: last,
              user_name: f.username,
              home_state: f.homeState,
              preferred_game: f.preferredGame || undefined,
              favorite_player: f.favoritePlayer || undefined,
              // profiles.status defaults to 'active' (the old inline insert passed it explicitly,
              // which ProfileInsert doesn't type — same row either way).
            });
          },
          sendWelcomeEmail: (email, firstName) => {
            sendWelcomeEmail(email, toTitleCase(firstName)).catch((err) =>
              console.warn("[useEmailSignup] Welcome email failed silently:", err?.message ?? err),
            );
          },
          completeSignIn: (userId) => completeSignIn(userId, { force: true }),
          showCheckEmail: (email) => {
            startPending(email, "signup", Date.now());
            router.replace("/auth/check-email" as any);
          },
        },
        // Reuse only for the same address; a changed email starts a fresh signUp.
        created.current && created.current.email === form.email.trim().toLowerCase() ? created.current.userId : null,
      );
      if (result.kind === "error") {
        created.current = result.userId ? { userId: result.userId, email: form.email.trim().toLowerCase() } : null;
      } else {
        created.current = null;
      }
      return result;
    },
    [completeSignIn, router, startPending],
  );

  return { submit };
}
