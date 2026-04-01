// src/features/billing/billing.service.ts

import { supabase } from '../../lib/supabase';
import { Invoice, PaymentMethod, VenueSubscription } from './billing.types';

export const billingService = {
  async getOwnerPrimaryVenueId(userId: string): Promise<number | null> {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id_auto')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();

    if (profileError || !profile?.id_auto) {
      console.warn('[billingService] getOwnerPrimaryVenueId: profile not found', profileError?.message);
      return null;
    }

    const { data: ownerRow, error: ownerError } = await supabase
      .from('venue_owners')
      .select('venue_id')
      .eq('owner_id', profile.id_auto)
      .is('archived_at', null)
      .order('assigned_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ownerError || !ownerRow?.venue_id) {
      console.warn('[billingService] getOwnerPrimaryVenueId: no venue found', ownerError?.message);
      return null;
    }

    return ownerRow.venue_id;
  },

  async getSubscription(venueId: number): Promise<VenueSubscription | null> {
    const { data, error } = await supabase
      .from('venue_subscriptions')
      .select('*, plan:billing_plans(*)')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[billingService] getSubscription:', error.message);
      return null;
    }
    return data;
  },

  async getPaymentMethod(venueId: number): Promise<PaymentMethod | null> {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[billingService] getPaymentMethod:', error.message);
      return null;
    }
    return data;
  },

  async getInvoices(venueId: number): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('venue_id', venueId)
      .order('invoice_date', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[billingService] getInvoices:', error.message);
      return [];
    }
    return data ?? [];
  },

  async cancelSubscription(subscriptionId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.functions.invoke('cancel-subscription', {
      body: { subscription_id: subscriptionId },
    });
    return { error: error?.message ?? null };
  },

  async reactivateSubscription(subscriptionId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.functions.invoke('reactivate-subscription', {
      body: { subscription_id: subscriptionId },
    });
    return { error: error?.message ?? null };
  },
};