// src/features/billing/stripe.service.ts
// Wraps all Supabase edge function calls related to Stripe.
// The app never calls Stripe directly — only through these edge functions.

import { supabase } from '../../lib/supabase';

export const stripeService = {
  async createCustomer(venueId: number, email: string, name: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('create-stripe-customer', {
      body: { venue_id: venueId, email, name },
    });
    if (error) {
      console.warn('[stripeService] createCustomer error:', error.message);
      return null;
    }
    return data?.customer_id ?? null;
  },

  async createSetupIntent(customerId: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('create-setup-intent', {
      body: { customer_id: customerId },
    });
    if (error) {
      console.warn('[stripeService] createSetupIntent error:', error.message);
      return null;
    }
    return data?.client_secret ?? null;
  },
};