// src/features/billing/billing.types.ts

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'founding';

export type InvoiceStatus = 'paid' | 'open' | 'void' | 'uncollectible';

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  description: string;
  features: string[];
  is_active: boolean;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
}

export interface VenueSubscription {
  id: string;
  venue_id: number;
  plan_id: string;
  plan?: BillingPlan;
  status: SubscriptionStatus;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  venue_id: number;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  provider_payment_method_id: string;
  is_default: boolean;
}

export interface Invoice {
  id: string;
  venue_id: number;
  subscription_id: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  invoice_date: string;
  hosted_invoice_url: string | null;
  receipt_url: string | null;
  provider_invoice_id: string;
}

export interface VenueBillingAccount {
  subscription: VenueSubscription | null;
  paymentMethod: PaymentMethod | null;
  invoices: Invoice[];
}