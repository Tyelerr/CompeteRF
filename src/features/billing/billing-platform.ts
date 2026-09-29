// src/features/billing/billing-platform.ts
// Platform rules for the bar-owner billing screen. Compete's venue plan is billed through
// Stripe, outside Google Play Billing, so the Android app must not offer any in-app way to
// pay for it or restart it: no Stripe hosted-invoice links (an open invoice's hosted page has
// a Pay button) and no Reactivate. Android can still see plan status and billing history,
// open receipts for PAID invoices, cancel, and contact support. Web and iOS are unchanged.

import type { Invoice } from "./billing.types";

export type BillingPlatform = "android" | "ios" | "web" | string;

/** Android may not start, restart or pay for the Stripe-billed plan in-app. */
export const canTransactInApp = (platform: BillingPlatform): boolean => platform !== "android";

/**
 * The link an invoice row may open, or null. Android: only the Stripe receipt of a PAID
 * invoice (view-only). Elsewhere: the hosted invoice page, falling back to the receipt.
 */
export const invoiceLinkFor = (
  invoice: Pick<Invoice, "status" | "hosted_invoice_url" | "receipt_url">,
  platform: BillingPlatform,
): string | null => {
  if (!canTransactInApp(platform)) {
    return invoice.status === "paid" ? invoice.receipt_url ?? null : null;
  }
  return invoice.hosted_invoice_url ?? invoice.receipt_url ?? null;
};
