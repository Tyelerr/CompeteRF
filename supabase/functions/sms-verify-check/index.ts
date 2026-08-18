import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// sms-verify-check — completes phone verification via Telnyx Verify.
//
// Trust boundary: validates the JWT, derives the user id, loads the user's
// CURRENT canonical phone server-side (never trusts a client-supplied number),
// asks Telnyx to check the submitted code against that number, and only on an
// explicit "accepted" result calls the service-role-only mark_phone_verified.
// Verification does NOT enable SMS. Never logs the OTP or the full phone number.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/.test(authHeader)) return json({ error: "Unauthorized." }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY");
  const VERIFY_PROFILE_ID = Deno.env.get("TELNYX_VERIFY_PROFILE_ID");
  if (!TELNYX_API_KEY || !VERIFY_PROFILE_ID) {
    console.error("[sms-verify-check] Telnyx Verify secrets not configured.");
    return json({ error: "Verification is unavailable." }, 500);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "Unauthorized." }, 401);

  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  // Validate OTP shape WITHOUT logging it. (No phone is accepted from the client.)
  const code = (body.code ?? "").trim();
  if (!/^\d{4,10}$/.test(code)) return json({ error: "Enter the code we sent." }, 400);

  // Server-loaded canonical number — the only number we ever verify against.
  const { data: prof } = await admin
    .from("profiles").select("phone_number").eq("id", userId).maybeSingle();
  const canonical = prof?.phone_number ?? null;
  if (!canonical) return json({ error: "Add and send a code to a number first." }, 400);

  // Atomic reserve (check cap). A failed check consumes a slot.
  const { data: reserved, error: resErr } = await admin.rpc(
    "reserve_sms_verification_attempt",
    { p_user_id: userId, p_action: "check" },
  );
  if (resErr || typeof reserved !== "string" || !reserved.startsWith("ok:")) {
    return json({ error: "Too many attempts. Please wait and try again." }, 429);
  }
  const attemptId = Number(reserved.slice(3));
  const masked = maskLast4(canonical);

  // Ask Telnyx to check the code against the SERVER-loaded canonical number.
  let accepted = false;
  try {
    const url = `https://api.telnyx.com/v2/verifications/by_phone_number/${encodeURIComponent(canonical)}/actions/verify`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code, verify_profile_id: VERIFY_PROFILE_ID }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const rc = data?.data?.response_code;
      const returnedPhone = data?.data?.phone_number;
      // Explicit "accepted" only; and if a phone is echoed, it must match canonical.
      accepted = rc === "accepted" && (!returnedPhone || returnedPhone === canonical);
    } else {
      console.error("[sms-verify-check] Telnyx verify non-2xx:", res.status);
    }
  } catch (e) {
    console.error("[sms-verify-check] Telnyx verify network error.");
  }

  if (!accepted) {
    await admin.from("sms_verification_attempts")
      .update({ status: "failed", phone_masked: masked, updated_at: new Date().toISOString() })
      .eq("id", attemptId);
    return json({ error: "That code didn't match. Please try again." }, 400);
  }

  // Server-only verification write (hardcodes provider/method; re-checks canonical).
  const { error: markErr } = await admin.rpc("mark_phone_verified", {
    p_user_id: userId,
    p_phone_e164: canonical,
  });
  if (markErr) {
    await admin.from("sms_verification_attempts")
      .update({ status: "error", phone_masked: masked, updated_at: new Date().toISOString() })
      .eq("id", attemptId);
    return json({ error: "Couldn't complete verification. Please try again." }, 500);
  }

  await admin.from("sms_verification_attempts")
    .update({ status: "verified", phone_masked: masked, updated_at: new Date().toISOString() })
    .eq("id", attemptId);
  return json({ ok: true, verified: true }, 200);
});

function maskLast4(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length >= 4 ? `••••${d.slice(-4)}` : "••••";
}
function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
