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
  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) return jsonResponse({ error: "Server misconfiguration." }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: { subscription_id: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const { subscription_id } = body;
  if (!subscription_id) return jsonResponse({ error: "Missing subscription_id." }, 400);

  const { data: sub, error: subError } = await supabase
    .from("venue_subscriptions")
    .select("provider_subscription_id")
    .eq("id", subscription_id)
    .limit(1)
    .maybeSingle();

  if (subError || !sub) return jsonResponse({ error: "Subscription not found." }, 404);

  // If real Stripe subscription exists, reactivate in Stripe
  if (sub.provider_subscription_id && sub.provider_subscription_id !== "sub_test_placeholder") {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.provider_subscription_id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ cancel_at_period_end: "false" }),
      }
    );

    const result = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error("[reactivate-subscription] Stripe error:", result);
      return jsonResponse({ error: result.error?.message ?? "Stripe error." }, 500);
    }
    console.log(`[reactivate-subscription] Stripe subscription ${sub.provider_subscription_id} reactivated`);
  }

  const { error: updateError } = await supabase
    .from("venue_subscriptions")
    .update({ cancel_at_period_end: false, status: "active", updated_at: new Date().toISOString() })
    .eq("id", subscription_id);

  if (updateError) {
    console.error("[reactivate-subscription] DB update error:", updateError);
    return jsonResponse({ error: "Failed to update subscription." }, 500);
  }

  console.log(`[reactivate-subscription] Subscription ${subscription_id} reactivated`);
  return jsonResponse({ success: true }, 200);
});