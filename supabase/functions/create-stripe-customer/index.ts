import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server misconfiguration." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: { venue_id: number; email: string; name: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { venue_id, email, name } = body;
  if (!venue_id || !email) return jsonResponse({ error: "Missing venue_id or email." }, 400);

  // Check if customer already exists
  const { data: existing } = await supabase
    .from("venue_subscriptions")
    .select("provider_customer_id")
    .eq("venue_id", venue_id)
    .limit(1)
    .maybeSingle();

  if (existing?.provider_customer_id && existing.provider_customer_id !== "cus_test_placeholder") {
    return jsonResponse({ customer_id: existing.provider_customer_id }, 200);
  }

  // Create Stripe customer
  const stripeRes = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ email, name: name ?? email, "metadata[venue_id]": String(venue_id) }),
  });

  const customer = await stripeRes.json();
  if (!stripeRes.ok) {
    console.error("[create-stripe-customer] Stripe error:", customer);
    return jsonResponse({ error: customer.error?.message ?? "Stripe error." }, 500);
  }

  console.log(`[create-stripe-customer] Created customer ${customer.id} for venue ${venue_id}`);

  // Save customer id to DB
  await supabase
    .from("venue_subscriptions")
    .update({ provider_customer_id: customer.id })
    .eq("venue_id", venue_id);

  return jsonResponse({ customer_id: customer.id }, 200);
});