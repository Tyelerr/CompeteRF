import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// sms-verify-start — begins phone verification via Telnyx Verify.
//
// Trust boundary: validates the caller's JWT, derives the user id server-side,
// sets the canonical phone via set_sms_phone (own-row, normalizes, invalidates
// prior verification), atomically reserves a rate-limited attempt, then asks
// Telnyx to send an OTP. Never logs the phone or any OTP; returns generic errors.
//
// Secrets: TELNYX_API_KEY, TELNYX_VERIFY_PROFILE_ID.
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TELNYX_CREATE_URL = "https://api.telnyx.com/v2/verifications/sms";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Reject missing/malformed Authorization before any privileged work.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/.test(authHeader)) return json({ error: "Unauthorized." }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY");
  const VERIFY_PROFILE_ID = Deno.env.get("TELNYX_VERIFY_PROFILE_ID");
  if (!TELNYX_API_KEY || !VERIFY_PROFILE_ID) {
    console.error("[sms-verify-start] Telnyx Verify secrets not configured.");
    return json({ error: "Verification is unavailable." }, 500);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  // Identity from the validated JWT — never from the client body.
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "Unauthorized." }, 401);

  let body: { phone?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const normalized = normalizeE164(body.phone);
  if (!normalized) return json({ error: "Enter a valid mobile number." }, 400);

  // Set the canonical phone (own row; invalidates verification + disables SMS if
  // the number changed; logs phone_changed). Runs as the authenticated user.
  const { error: setErr } = await userClient.rpc("set_sms_phone", { p_phone: normalized });
  if (setErr) return json({ error: "Couldn't save that number." }, 400);

  // Re-read the canonical number authoritatively; verify against the input.
  const { data: prof } = await admin
    .from("profiles").select("phone_number").eq("id", userId).maybeSingle();
  const canonical = prof?.phone_number ?? null;
  if (!canonical || canonical !== normalized) {
    return json({ error: "Couldn't start verification." }, 400);
  }

  // Atomic reserve (cooldown + caps). Denials insert no row.
  const { data: reserved, error: resErr } = await admin.rpc(
    "reserve_sms_verification_attempt",
    { p_user_id: userId, p_action: "start" },
  );
  if (resErr || typeof reserved !== "string" || !reserved.startsWith("ok:")) {
    const retryAfter = await computeStartRetryAfter(admin, userId);
    const mins = Math.ceil(retryAfter / 60);
    const friendly = retryAfter >= 60
      ? `${mins} minute${mins === 1 ? "" : "s"}`
      : `${retryAfter} second${retryAfter === 1 ? "" : "s"}`;
    return json(
      { error: `Please wait ${friendly} before requesting another verification code.`, retry_after: retryAfter },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }
  const attemptId = Number(reserved.slice(3));
  const masked = maskLast4(canonical);

  // Ask Telnyx to send the OTP.
  let telnyxOk = false;
  try {
    const res = await fetch(TELNYX_CREATE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: canonical, verify_profile_id: VERIFY_PROFILE_ID }),
    });
    telnyxOk = res.ok;
    if (!res.ok) {
      // Read the body ONCE; log status + Telnyx error code/title/detail. Redact
      // the full number if the provider echoes it. NEVER log the Authorization
      // header, API key, or the complete phone number.
      const responseText = await res.text();
      const safeText = responseText.split(canonical).join(maskLast4(canonical));
      let responseBody: unknown;
      try { responseBody = JSON.parse(safeText); } catch { responseBody = safeText; }
      console.error(
        "[sms-verify-start] Telnyx create failed",
        JSON.stringify({ status: res.status, body: responseBody }),
      );
    }
  } catch {
    console.error("[sms-verify-start] Telnyx create network error.");
  }

  await admin.from("sms_verification_attempts")
    .update({ status: telnyxOk ? "sent" : "error", phone_masked: masked, updated_at: new Date().toISOString() })
    .eq("id", attemptId);

  if (!telnyxOk) return json({ error: "Couldn't send the code. Please try again." }, 502);
  return json({ ok: true }, 200);
});

function normalizeE164(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (/^\+[1-9]\d{6,14}$/.test(t)) return t;
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
function maskLast4(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length >= 4 ? `••••${d.slice(-4)}` : "••••";
}
function json(b: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}

// Best-effort remaining wait (seconds) for the friendly 429 message. The reserve
// RPC above is the real atomic gate; this only computes a display hint from the
// user's recent 'start' rows (60s cooldown, 5/hour, 10/day).
// deno-lint-ignore no-explicit-any
async function computeStartRetryAfter(admin: any, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await admin
    .from("sms_verification_attempts")
    .select("created_at")
    .eq("user_id", userId).eq("action", "start")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const now = Date.now();
  const times: number[] = (data ?? []).map((r: { created_at: string }) => new Date(r.created_at).getTime());
  let wait = 0;
  if (times.length > 0) {
    const sinceLast = (now - times[0]) / 1000;
    if (sinceLast < 60) wait = Math.max(wait, Math.ceil(60 - sinceLast));
  }
  const inHour = times.filter((t) => t > now - 3600 * 1000);
  if (inHour.length >= 5) wait = Math.max(wait, Math.ceil((inHour[4] + 3600 * 1000 - now) / 1000));
  const inDay = times.filter((t) => t > now - 86400 * 1000);
  if (inDay.length >= 10) wait = Math.max(wait, Math.ceil((inDay[9] + 86400 * 1000 - now) / 1000));
  return Math.max(wait, 1);
}
