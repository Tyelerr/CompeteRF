import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// send-sms — sends a single text message via Telnyx.
//
// Secrets (set with `supabase secrets set ...`, never in the app):
//   TELNYX_API_KEY               — your Telnyx V2 API key (Bearer token)
//   TELNYX_FROM_NUMBER           — a Telnyx number to send from (E.164, +1...)
//   TELNYX_MESSAGING_PROFILE_ID  — (optional) use instead of/along with a number
//
// At least one of TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID is required.
//
// Request body: { to: string, body: string }
// ---------------------------------------------------------------------------

const TELNYX_API_URL = "https://api.telnyx.com/v2/messages";

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

  const apiKey = Deno.env.get("TELNYX_API_KEY");
  const fromNumber = Deno.env.get("TELNYX_FROM_NUMBER");
  const messagingProfileId = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");

  if (!apiKey || (!fromNumber && !messagingProfileId)) {
    console.error("[send-sms] Telnyx secrets are not fully set.");
    return jsonResponse({ error: "SMS service is not configured." }, 500);
  }

  let payload: SendSmsRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const to = normalizeNumber(payload.to);
  const text = (payload.body ?? "").trim();

  if (!to || !text) {
    return jsonResponse({ error: "Missing required fields: to, body." }, 400);
  }

  const telnyxBody: Record<string, string> = { to, text };
  if (fromNumber) telnyxBody.from = fromNumber;
  if (messagingProfileId) telnyxBody.messaging_profile_id = messagingProfileId;

  let telnyxResponse: Response;
  try {
    telnyxResponse = await fetch(TELNYX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(telnyxBody),
    });
  } catch (err) {
    console.error("[send-sms] Network error reaching Telnyx:", err);
    return jsonResponse({ error: "Failed to reach SMS provider." }, 502);
  }

  const data = await telnyxResponse.json();

  if (!telnyxResponse.ok) {
    const detail =
      data?.errors?.[0]?.detail ??
      data?.errors?.[0]?.title ??
      "Unknown error from SMS provider.";
    console.error("[send-sms] Telnyx API error:", data);
    return jsonResponse({ error: detail }, telnyxResponse.status);
  }

  const id = data?.data?.id;
  console.log(`[send-sms] Sent to ${to}. Telnyx ID: ${id}`);
  return jsonResponse({ success: true, id }, 200);
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
