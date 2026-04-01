// src/viewmodels/useBilling.ts

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { billingService } from '../features/billing/billing.service';
import { Invoice, PaymentMethod, SubscriptionStatus, VenueSubscription } from '../features/billing/billing.types';
import { useAuthContext } from '../providers/AuthProvider';

type StatusConfig = { label: string; color: string; bgColor: string };

const STATUS_CONFIG: Record<SubscriptionStatus, StatusConfig> = {
  active:    { label: 'Active',          color: '#4ADE80', bgColor: '#1E4D2B' },
  trialing:  { label: 'Trial',           color: '#4A9EFF', bgColor: '#1E3A5F' },
  past_due:  { label: 'Past Due',        color: '#F59E0B', bgColor: '#3D2A00' },
  unpaid:    { label: 'Unpaid',          color: '#FF6B6B', bgColor: '#5F1E1E' },
  canceled:  { label: 'Canceled',        color: '#9CA3AF', bgColor: '#1F2937' },
  founding:  { label: 'Founding Venue',  color: '#F59E0B', bgColor: '#3D2A00' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatPrice(plan?: VenueSubscription['plan']): string {
  if (!plan) return 'Custom';
  if (plan.price_monthly === null) return 'Custom';
  if (plan.price_monthly === 0) return 'Free';
  return '$' + plan.price_monthly + '/mo';
}

export function useBilling() {
  const { user } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [venueId, setVenueId] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<VenueSubscription | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      console.log('[useBilling] load called - user:', user?.id ?? 'NULL');

      if (!user) {
        console.log('[useBilling] no user, aborting');
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      setError(null);

      try {
        console.log('[useBilling] resolving venueId, cached:', venueId);
        const vid = venueId ?? (await billingService.getOwnerPrimaryVenueId(user.id));
        console.log('[useBilling] resolved venueId:', vid);

        if (!vid) {
          console.log('[useBilling] no venueId found, aborting');
          setLoading(false);
          setRefreshing(false);
          return;
        }
        if (!venueId) setVenueId(vid);

        const [sub, pm, inv] = await Promise.all([
          billingService.getSubscription(vid),
          billingService.getPaymentMethod(vid),
          billingService.getInvoices(vid),
        ]);

        console.log('[useBilling] sub:', JSON.stringify(sub));
        console.log('[useBilling] pm:', JSON.stringify(pm));
        console.log('[useBilling] invoices count:', inv.length);

        setSubscription(sub);
        setPaymentMethod(pm);
        setInvoices(inv);
      } catch (e: any) {
        console.log('[useBilling] caught error:', e?.message);
        setError(e?.message ?? 'Failed to load billing info.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, venueId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleCancelSubscription = useCallback(async () => {
    if (!subscription) return;
    Alert.alert(
      'Cancel Subscription',
      'Your access will continue until the end of the current billing period. Are you sure?',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const { error: err } = await billingService.cancelSubscription(subscription.id);
            setActionLoading(false);
            if (err) {
              Alert.alert('Error', err);
            } else {
              Alert.alert('Subscription Canceled', 'Your access continues through the current billing period.');
              load(true);
            }
          },
        },
      ],
    );
  }, [subscription, load]);

  const handleReactivateSubscription = useCallback(async () => {
    if (!subscription) return;
    setActionLoading(true);
    const { error: err } = await billingService.reactivateSubscription(subscription.id);
    setActionLoading(false);
    if (err) {
      Alert.alert('Error', err);
    } else {
      Alert.alert('Reactivated', 'Your subscription has been reactivated.');
      load(true);
    }
  }, [subscription, load]);

  const status = subscription?.status ?? null;
  const statusConfig = status ? STATUS_CONFIG[status] : null;

  const isActive =
    subscription?.status === 'active' ||
    subscription?.status === 'trialing' ||
    subscription?.status === 'founding';

  return {
    loading,
    refreshing,
    actionLoading,
    subscription,
    paymentMethod,
    invoices,
    error,
    onRefresh,
    handleCancelSubscription,
    handleReactivateSubscription,
    statusLabel:         statusConfig?.label   ?? 'No Plan',
    statusColor:         statusConfig?.color   ?? '#9CA3AF',
    statusBgColor:       statusConfig?.bgColor ?? '#1F2937',
    planName:            subscription?.plan?.name ?? 'No Active Plan',
    formattedPrice:      formatPrice(subscription?.plan),
    planFeatures:        subscription?.plan?.features ?? [],
    nextBillingDate:     formatDate(subscription?.current_period_end ?? null),
    trialEndDate:        formatDate(subscription?.trial_end ?? null),
    isTrialing:          subscription?.status === 'trialing',
    isCanceled:          subscription?.status === 'canceled',
    isCancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    isActive,
    hasSubscription:     subscription !== null,
    formatInvoiceAmount: (inv: Invoice) => formatAmount(inv.amount, inv.currency),
    formatInvoiceDate:   (inv: Invoice) => formatDate(inv.invoice_date),
  };
}