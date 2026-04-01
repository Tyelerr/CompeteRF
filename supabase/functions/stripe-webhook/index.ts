import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) return jsonResponse({ error: "Server misconfiguration." }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let event: any;
  try {
    event = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  console.log(`[stripe-webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {

      // -----------------------------------------------------------------------
      // Subscription updated (status change, renewal, cancellation scheduled)
      // -----------------------------------------------------------------------
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        const venueId = sub.metadata?.venue_id ? parseInt(sub.metadata.venue_id) : null;
        if (!venueId) { console.warn("[stripe-webhook] No venue_id in subscription metadata"); break; }

        await supabase.from("venue_subscriptions").update({
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          provider_subscription_id: sub.id,
          updated_at: new Date().toISOString(),
        }).eq("venue_id", venueId);

        console.log(`[stripe-webhook] Updated subscription for venue ${venueId} — status: ${sub.status}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription canceled
      // -----------------------------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const venueId = sub.metadata?.venue_id ? parseInt(sub.metadata.venue_id) : null;
        if (!venueId) break;

        await supabase.from("venue_subscriptions").update({
          status: "canceled",
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }).eq("venue_id", venueId);

        console.log(`[stripe-webhook] Subscription canceled for venue ${venueId}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Invoice paid — record in invoices table
      // -----------------------------------------------------------------------
      case "invoice.payment_succeeded": {
        const inv = event.data.object;
        const venueId = inv.metadata?.venue_id
          ? parseInt(inv.metadata.venue_id)
          : inv.subscription_details?.metadata?.venue_id
          ? parseInt(inv.subscription_details.metadata.venue_id)
          : null;

        if (!venueId) { console.warn("[stripe-webhook] No venue_id on invoice"); break; }

        const { data: subRow } = await supabase
          .from("venue_subscriptions")
          .select("id")
          .eq("venue_id", venueId)
          .limit(1)
          .maybeSingle();

        await supabase.from("invoices").upsert({
          venue_id: venueId,
          subscription_id: subRow?.id ?? null,
          amount: inv.amount_paid,
          currency: inv.currency,
          status: "paid",
          invoice_date: new Date(inv.created * 1000).toISOString(),
          hosted_invoice_url: inv.hosted_invoice_url ?? null,
          receipt_url: inv.receipt_url ?? null,
          provider_invoice_id: inv.id,
        }, { onConflict: "provider_invoice_id" });

        console.log(`[stripe-webhook] Invoice ${inv.id} recorded as paid for venue ${venueId}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Invoice payment failed — mark past_due
      // -----------------------------------------------------------------------
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const venueId = inv.metadata?.venue_id ? parseInt(inv.metadata.venue_id) : null;
        if (!venueId) break;

        await supabase.from("venue_subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("venue_id", venueId);

        await supabase.from("invoices").upsert({
          venue_id: venueId,
          amount: inv.amount_due,
          currency: inv.currency,
          status: "open",
          invoice_date: new Date(inv.created * 1000).toISOString(),
          hosted_invoice_url: inv.hosted_invoice_url ?? null,
          receipt_url: null,
          provider_invoice_id: inv.id,
        }, { onConflict: "provider_invoice_id" });

        console.log(`[stripe-webhook] Payment failed for venue ${venueId} — marked past_due`);
        break;
      }

      // -----------------------------------------------------------------------
      // Payment method attached — save last4, brand, expiry
      // -----------------------------------------------------------------------
      case "payment_method.attached": {
        const pm = event.data.object;
        const customerId = pm.customer;
        if (!customerId) break;

        const { data: subRow } = await supabase
          .from("venue_subscriptions")
          .select("venue_id")
          .eq("provider_customer_id", customerId)
          .limit(1)
          .maybeSingle();

        if (!subRow?.venue_id) break;

        await supabase.from("payment_methods").upsert({
          venue_id: subRow.venue_id,
          brand: pm.card?.brand ?? "unknown",
          last4: pm.card?.last4 ?? "0000",
          exp_month: pm.card?.exp_month ?? 0,
          exp_year: pm.card?.exp_year ?? 0,
          provider_payment_method_id: pm.id,
          is_default: true,
        }, { onConflict: "provider_payment_method_id" });

        console.log(`[stripe-webhook] Payment method ${pm.id} saved for venue ${subRow.venue_id}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return jsonResponse({ error: "Webhook handler error." }, 500);
  }

  return jsonResponse({ received: true }, 200);
});