import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// send-sms — DISABLED / NEUTRALIZED (2026-07-30).
//
// This function used to accept an arbitrary client-supplied { to, body } and
// relay it to Telnyx — a spam/billing risk (UI gating is not a security
// boundary). It has been replaced by server-authorized endpoints that derive the
// destination server-side and enforce verification/consent:
//   • sms-send-test            (caller's own verified number)
//   • sms-send-match-ready     (server-resolved match recipient)
//
// It is intentionally kept deployed as a hard-disabled stub so OLDER app builds
// cannot use the old permissive path. It performs NO provider call and returns
// 410 Gone. Delete it from the project once no old clients remain
// (`supabase functions delete send-sms`).
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(
    JSON.stringify({ error: "This endpoint is retired. Update the app." }),
    { status: 410, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
