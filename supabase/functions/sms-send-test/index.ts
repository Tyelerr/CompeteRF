import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTelnyxSms } from "../_shared/telnyx.ts";

// ---------------------------------------------------------------------------
// sms-send-test — sends a fixed test text to the CALLER's own verified number.
// No destination/body from the client. Requires phone_verified_at + sms_enabled.
// Atomically rate-limited (60s cooldown, <=5/hr). Records sms_messages. Never
// exposes the full number or raw provider body.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TEST_MESSAGE = "Compete: your text alerts are working. Reply STOP to opt out, HELP for help.";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/.test(authHeader)) return json({ error: "Unauthorized." }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY") ?? "";
  const FROM = Deno.env.get("TELNYX_FROM_NUMBER") ?? "";
  if (!TELNYX_API_KEY || !FROM) return json({ error: "SMS is unavailable." }, 500);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "Unauthorized." }, 401);

  // Server-loaded canonical + verification + consent.
  const { data: prof } = await admin
    .from("profiles").select("phone_number, phone_verified_at").eq("id", userId).maybeSingle();
  if (!prof?.phone_number || !prof.phone_verified_at) {
    return json({ error: "Verify your number first." }, 400);
  }
  const { data: prefs } = await admin
    .from("notification_preferences").select("sms_enabled").eq("user_id", userId).maybeSingle();
  if (!prefs?.sms_enabled) return json({ error: "Enable text alerts first." }, 400);

  // Atomic rate limit.
  const { data: reserved } = await admin.rpc("reserve_sms_verification_attempt", { p_user_id: userId, p_action: "test" });
  if (typeof reserved !== "string" || !reserved.startsWith("ok:")) {
    return json({ error: "Too many test messages. Please wait and try again." }, 429);
  }

  const to = prof.phone_number as string;
  // Record the attempt BEFORE the provider call.
  const { data: row } = await admin
    .from("sms_messages")
    .insert({ user_id: userId, to_e164: to, message_type: "test_message", provider: "telnyx", status: "queued" })
    .select("id").single();
  const rowId = row?.id;

  const result = await sendTelnyxSms({ apiKey: TELNYX_API_KEY, from: FROM, to, text: TEST_MESSAGE });

  if (rowId) {
    await admin.from("sms_messages").update({
      status: result.ok ? "sent" : "sending_failed",
      provider_message_id: result.providerMessageId ?? null,
      telnyx_message_id: result.providerMessageId ?? null,
      error_code: result.ok ? null : result.errorCode ?? "provider_rejected",
      accepted_at: result.ok ? new Date().toISOString() : null,
      last_status_at: new Date().toISOString(),
    }).eq("id", rowId);
  }

  if (!result.ok) return json({ error: "Couldn't send the test message." }, 502);
  return json({ ok: true }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
