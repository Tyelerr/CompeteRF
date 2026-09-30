// src/models/services/password-recovery.service.ts
// Turns recovery-link credentials (src/utils/recovery-link.ts) into a Supabase recovery session.
// Called ONLY after the user taps Continue on the reset screen — never on link arrival — so a
// link scanner / preview that merely opens the page consumes nothing.

import { supabase } from "../../lib/supabase";
import type { RecoveryCredentials } from "../../utils/recovery-link";

export interface RecoverySessionResult {
  ok: boolean;
  /** True when Supabase says the token is expired / already used. */
  expired: boolean;
  error: string | null;
}

const isExpiredError = (message: string | undefined, code: string | undefined) =>
  /expired|invalid|already|used|not found/i.test(`${code ?? ""} ${message ?? ""}`);

export const passwordRecoveryService = {
  async establishRecoverySession(credentials: RecoveryCredentials): Promise<RecoverySessionResult> {
    let error: { message?: string; code?: string } | null = null;
    if (credentials.kind === "token_hash") {
      ({ error } = await supabase.auth.verifyOtp({ token_hash: credentials.tokenHash, type: "recovery" }));
    } else if (credentials.kind === "session") {
      ({ error } = await supabase.auth.setSession({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
      }));
    } else {
      ({ error } = await supabase.auth.exchangeCodeForSession(credentials.code));
    }
    if (!error) return { ok: true, expired: false, error: null };
    return { ok: false, expired: isExpiredError(error.message, error.code), error: error.message ?? "Verification failed" };
  },
};
