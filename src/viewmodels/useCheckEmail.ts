// src/viewmodels/useCheckEmail.ts
// "Check your email" (after a signup that needs confirmation) and "Email not confirmed" (at
// sign-in). Resend with a 60 s cooldown; every notice is the same whether or not the address has
// an account. The address comes from the in-memory pending store — after a reload it is gone and
// the screen asks for it (never taken from the URL).

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { emailConfirmationService } from "../models/services/email-confirmation.service";
import { checkEmailCopy, cooldownRemaining, resendNotice } from "../utils/email-confirmation";
import { useHydrated } from "./hooks/use.hydrated";
import { usePendingConfirmationStore } from "./stores/pending-confirmation.store";

export function useCheckEmail() {
  const hydrated = useHydrated();
  const storedEmail = usePendingConfirmationStore((s) => s.email);
  const mode = usePendingConfirmationStore((s) => s.mode);
  const lastSentAt = usePendingConfirmationStore((s) => s.lastSentAt);
  const markSent = usePendingConfirmationStore((s) => s.markSent);

  const [typedEmail, setTypedEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Before hydration render the neutral no-email variant (matches the static HTML on web).
  const email = hydrated ? storedEmail : null;
  const remaining = hydrated ? cooldownRemaining(lastSentAt, now) : 0;

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const target = (email ?? typedEmail).trim();
  const canResend = !sending && remaining === 0 && /.+@.+\..+/.test(target);

  const resend = useCallback(async () => {
    if (!canResend) return;
    setSending(true);
    setNotice(null);
    const outcome = await emailConfirmationService.resendSignupConfirmation(target);
    const sentAt = Date.now();
    // A rate-limited attempt also starts the cooldown, so the user isn't invited to hammer it.
    if (outcome !== "failed") markSent(sentAt);
    setNow(sentAt);
    setNotice(resendNotice(outcome));
    setSending(false);
  }, [canResend, target, markSent]);

  return {
    copy: checkEmailCopy(Platform.OS, hydrated ? mode : "signup", !!email),
    mode: hydrated ? mode : "signup",
    email,
    typedEmail,
    setTypedEmail,
    needsEmailInput: !email,
    sending,
    remaining,
    canResend,
    notice,
    resend,
  };
}
