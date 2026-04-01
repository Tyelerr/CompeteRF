import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESEND_API_URL = "https://api.resend.com/emails";

const DEFAULT_FROM = "Compete <no-reply@thecompeteapp.com>";
const DEFAULT_REPLY_TO = "support@thecompeteapp.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SendEmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

interface ResendSuccessResponse {
  id: string;
}

interface ResendErrorResponse {
  name: string;
  message: string;
  statusCode: number;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Pull secret from Supabase secrets — never from client
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[send-email] RESEND_API_KEY secret is not set.");
    return jsonResponse({ error: "Email service is not configured." }, 500);
  }

  let body: SendEmailRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { to, subject, html, text, from, replyTo } = body;

  // Validate required fields
  if (!to || !subject || (!html && !text)) {
    return jsonResponse(
      { error: "Missing required fields: to, subject, and html or text." },
      400
    );
  }

  const payload = {
    from: from ?? DEFAULT_FROM,
    reply_to: replyTo ?? DEFAULT_REPLY_TO,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  };

  console.log(`[send-email] Sending to: ${JSON.stringify(payload.to)} | Subject: "${subject}"`);

  let resendResponse: Response;
  try {
    resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[send-email] Network error reaching Resend:", err);
    return jsonResponse({ error: "Failed to reach email provider." }, 502);
  }

  const responseData = await resendResponse.json() as ResendSuccessResponse | ResendErrorResponse;

  if (!resendResponse.ok) {
    const errData = responseData as ResendErrorResponse;
    console.error("[send-email] Resend API error:", errData);
    return jsonResponse(
      { error: errData.message ?? "Unknown error from email provider." },
      resendResponse.status
    );
  }

  const successData = responseData as ResendSuccessResponse;
  console.log(`[send-email] Email sent successfully. Resend ID: ${successData.id}`);

  return jsonResponse({ success: true, id: successData.id }, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
