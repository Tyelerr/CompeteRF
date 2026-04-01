import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return jsonResponse({ error: "Server misconfiguration." }, 500);

  let body: { customer_id: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { customer_id } = body;
  if (!customer_id) return jsonResponse({ error: "Missing customer_id." }, 400);

  const stripeRes = await fetch("https://api.stripe.com/v1/setup_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      customer: customer_id,
      "payment_method_types[]": "card",
    }),
  });

  const intent = await stripeRes.json();
  if (!stripeRes.ok) {
    console.error("[create-setup-intent] Stripe error:", intent);
    return jsonResponse({ error: intent.error?.message ?? "Stripe error." }, 500);
  }

  console.log(`[create-setup-intent] Created setup intent ${intent.id} for customer ${customer_id}`);
  return jsonResponse({ client_secret: intent.client_secret }, 200);
});