// supabase/functions/_shared/telnyx.ts
// Server-only Telnyx provider helper. NOT an HTTP endpoint — imported by trusted
// Edge Functions only. Accepts server-controlled values, returns a narrow
// normalized result, and never logs full numbers, credentials, or raw bodies.

const TELNYX_MESSAGES_URL = "https://api.telnyx.com/v2/messages";

export interface TelnyxSendResult {
  ok: boolean;
  providerMessageId?: string;
  // Safe internal category — never the raw provider body.
  errorCode?: "invalid_number" | "provider_rejected" | "network_error" | "not_configured";
}

/** Defensive E.164 validation (server already produced this; double-check). */
export function isE164(value: string | null | undefined): boolean {
  return /^\+[1-9]\d{6,14}$/.test((value ?? "").trim());
}

function maskLast4(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length >= 4 ? `••••${d.slice(-4)}` : "••••";
}

/**
 * Send one SMS via Telnyx. `to` must already be canonical E.164 (server-derived).
 * `from` is the verified toll-free number (secret). Returns a narrow result.
 */
export async function sendTelnyxSms(params: {
  apiKey: string;
  from: string;
  to: string;
  text: string;
}): Promise<TelnyxSendResult> {
  const { apiKey, from, to, text } = params;
  if (!apiKey || !from) return { ok: false, errorCode: "not_configured" };
  if (!isE164(to)) return { ok: false, errorCode: "invalid_number" };

  let res: Response;
  try {
    res = await fetch(TELNYX_MESSAGES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, text }),
    });
  } catch {
    // No number, no header, no body in logs.
    console.error("[telnyx] network error");
    return { ok: false, errorCode: "network_error" };
  }

  if (!res.ok) {
    console.error(`[telnyx] rejected status=${res.status} to=${maskLast4(to)}`);
    return { ok: false, errorCode: "provider_rejected" };
  }
  const data = await res.json().catch(() => null);
  return { ok: true, providerMessageId: data?.data?.id };
}
