import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// send-sms — sends a single text message via Twilio.
//
// Secrets (set with `supabase secrets set ...`, never in the app):
//   TWILIO_ACCOUNT_SID   — your Twilio Account SID (starts with "AC...")
//   TWILIO_AUTH_TOKEN    — your Twilio Auth Token
//   TWILIO_FROM_NUMBER   — the Twilio phone number to send from (E.164, +1...)
//
// Request body: { to: string, body: string }
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendSmsRequest {
  to: string;
  body: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    console.error("[send-sms] Twilio secrets are not fully set.");
    return jsonResponse({ error: "SMS service is not configured." }, 500);
  }

  let payload: SendSmsRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const to = normalizeNumber(payload.to);
  const body = (payload.body ?? "").trim();

  if (!to || !body) {
    return jsonResponse({ error: "Missing required fields: to, body." }, 400);
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", fromNumber);
  form.set("Body", body);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  let twilioResponse: Response;
  try {
    twilioResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (err) {
    console.error("[send-sms] Network error reaching Twilio:", err);
    return jsonResponse({ error: "Failed to reach SMS provider." }, 502);
  }

  const data = await twilioResponse.json();

  if (!twilioResponse.ok) {
    console.error("[send-sms] Twilio API error:", data);
    return jsonResponse(
      { error: data?.message ?? "Unknown error from SMS provider." },
      twilioResponse.status,
    );
  }

  console.log(`[send-sms] Sent to ${to}. Twilio SID: ${data.sid}`);
  return jsonResponse({ success: true, id: data.sid }, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Best-effort E.164 normalization for US numbers entered as "(555) 123-4567".
// Already-E.164 numbers (leading "+") pass through untouched.
function normalizeNumber(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
