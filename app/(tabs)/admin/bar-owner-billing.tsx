// app/(tabs)/admin/bar-owner-billing.tsx

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useBilling } from "../../../src/viewmodels/useBilling";
import { stripeService } from "../../../src/features/billing/stripe.service";
import { Invoice } from "../../../src/features/billing/billing.types";
import { useCallback, useState } from "react";

const isWeb = Platform.OS === "web";

// Lazy-load Stripe hooks only in a real native build (not Expo Go)
let useStripeHooks: () => {
  presentPaymentSheet: () => Promise<{ error?: { code: string; message: string } }>;
  initPaymentSheet: (params: any) => Promise<{ error?: { message: string } }>;
} = () => ({
  presentPaymentSheet: async () => ({ error: { code: "NotSupported", message: "Payment sheet requires a development build." } }),
  initPaymentSheet: async () => ({ error: undefined }),
});

try {
  const stripe = require("@stripe/stripe-react-native");
  useStripeHooks = () => {
    const { presentPaymentSheet } = stripe.useStripe();
    const { initPaymentSheet } = stripe.useInitPaymentSheet();
    return { presentPaymentSheet, initPaymentSheet };
  };
} catch {
  // Expo Go — use stubs above
}

const DEFAULT_PLAN_FEATURES = [
  "Unlimited venue listings",
  "Tournament management",
  "Analytics dashboard",
  "Director management",
  "Priority support",
  "Giveaway tools",
];

const INVOICE_STATUS_COLOR: Record<string, string> = {
  paid:          "#4ADE80",
  open:          "#F59E0B",
  void:          "#9CA3AF",
  uncollectible: "#FF6B6B",
};

export default function BarOwnerBillingScreen() {
  const router = useRouter();
  const vm = useBilling();
  const { presentPaymentSheet, initPaymentSheet } = useStripeHooks();
  const [paymentSheetLoading, setPaymentSheetLoading] = useState(false);

  const handleUpdatePaymentMethod = useCallback(async () => {
    if (isWeb) {
      Alert.alert("Update Payment Method", "Please use the mobile app to update your payment method.");
      return;
    }

    const customerId = vm.subscription?.provider_customer_id;
    if (!customerId || customerId === "cus_test_placeholder") {
      Alert.alert("Not Ready", "Your billing account is not fully set up yet. Please contact support.");
      return;
    }

    setPaymentSheetLoading(true);
    try {
      const clientSecret = await stripeService.createSetupIntent(customerId);
      if (!clientSecret) {
        Alert.alert("Error", "Could not initialize payment setup. Please try again.");
        return;
      }

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: "CompeteRF",
        style: "alwaysDark",
      });

      if (initError) {
        Alert.alert("Error", initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== "Canceled") {
          Alert.alert("Error", presentError.message);
        }
      } else {
        Alert.alert("Success", "Your payment method has been updated.");
        vm.onRefresh();
      }
    } finally {
      setPaymentSheetLoading(false);
    }
  }, [vm, initPaymentSheet, presentPaymentSheet]);

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading billing...</Text>
      </View>
    );
  }

  const features = vm.planFeatures.length > 0 ? vm.planFeatures : DEFAULT_PLAN_FEATURES;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        )
      }
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, isWeb && styles.backBtnWeb]}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>{"\uD83D\uDCB3"} BILLING</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>Manage your subscription</Text>
      </View>

      {/* Subscription Summary */}
      <SectionHeader title="Subscription" />
      <View style={styles.card}>
        <CardRow label="Plan" value={vm.planName} />
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text allowFontScaling={false} style={styles.cardLabel}>Status</Text>
          <View style={[styles.badge, { backgroundColor: vm.statusBgColor }]}>
            <Text allowFontScaling={false} style={[styles.badgeText, { color: vm.statusColor }]}>
              {vm.statusLabel}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <CardRow label="Price" value={vm.formattedPrice} />
        {vm.isTrialing && (
          <>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <Text allowFontScaling={false} style={styles.cardLabel}>Trial Ends</Text>
              <Text allowFontScaling={false} style={[styles.cardValue, { color: "#4A9EFF" }]}>
                {vm.trialEndDate}
              </Text>
            </View>
          </>
        )}
        {vm.hasSubscription && !vm.isCanceled && (
          <>
            <View style={styles.divider} />
            <CardRow
              label={vm.isCancelAtPeriodEnd ? "Access Until" : "Next Billing"}
              value={vm.nextBillingDate}
            />
          </>
        )}
        {vm.isCancelAtPeriodEnd && (
          <View style={styles.warningBanner}>
            <Text allowFontScaling={false} style={styles.warningText}>
              {"\u26A0\uFE0F"} Subscription set to cancel at end of period
            </Text>
          </View>
        )}
        {!vm.hasSubscription && (
          <View style={styles.emptyState}>
            <Text allowFontScaling={false} style={styles.emptyText}>No active subscription</Text>
            <Text allowFontScaling={false} style={styles.emptySubtext}>
              Contact support to get started with a plan.
            </Text>
          </View>
        )}
      </View>

      {/* Payment Method */}
      <SectionHeader title="Payment Method" />
      <View style={styles.card}>
        {vm.paymentMethod ? (
          <>
            <View style={styles.paymentRow}>
              <View style={styles.cardIconWrap}>
                <Text allowFontScaling={false} style={styles.cardIconText}>{"\uD83D\uDCB3"}</Text>
              </View>
              <View style={styles.paymentInfo}>
                <Text allowFontScaling={false} style={styles.cardValue}>
                  {vm.paymentMethod.brand.charAt(0).toUpperCase() + vm.paymentMethod.brand.slice(1)}{" "}
                  {"\u2022\u2022\u2022\u2022"} {vm.paymentMethod.last4}
                </Text>
                <Text allowFontScaling={false} style={styles.cardLabel}>
                  Expires {vm.paymentMethod.exp_month}/{vm.paymentMethod.exp_year}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleUpdatePaymentMethod}
              disabled={paymentSheetLoading}
            >
              <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                {paymentSheetLoading ? "Loading..." : "Update Payment Method"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text allowFontScaling={false} style={styles.emptyText}>No payment method on file</Text>
            <Text allowFontScaling={false} style={styles.emptySubtext}>
              A payment method is required to activate your subscription.
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleUpdatePaymentMethod}
              disabled={paymentSheetLoading}
            >
              <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                {paymentSheetLoading ? "Loading..." : "Add Payment Method"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Subscription Actions */}
      {vm.hasSubscription && (
        <>
          <SectionHeader title="Manage Subscription" />
          <View style={styles.card}>
            {vm.isCanceled || vm.isCancelAtPeriodEnd ? (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#1E4D2B" }]}
                onPress={vm.handleReactivateSubscription}
                disabled={vm.actionLoading}
              >
                <Text allowFontScaling={false} style={[styles.actionButtonText, { color: "#4ADE80" }]}>
                  {vm.actionLoading ? "Processing..." : "\u21BA Reactivate Subscription"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#3D1010" }]}
                onPress={vm.handleCancelSubscription}
                disabled={vm.actionLoading}
              >
                <Text allowFontScaling={false} style={[styles.actionButtonText, { color: "#FF6B6B" }]}>
                  {vm.actionLoading ? "Processing..." : "Cancel Subscription"}
                </Text>
              </TouchableOpacity>
            )}
            <Text allowFontScaling={false} style={styles.actionNote}>
              {vm.isCancelAtPeriodEnd
                ? "Reactivating will resume billing at the next renewal date."
                : "Canceling keeps your access active through the current billing period."}
            </Text>
          </View>
        </>
      )}

      {/* Billing History */}
      <SectionHeader title="Billing History" />
      <View style={styles.card}>
        {vm.invoices.length > 0 ? (
          vm.invoices.map((invoice, index) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              amount={vm.formatInvoiceAmount(invoice)}
              date={vm.formatInvoiceDate(invoice)}
              isLast={index === vm.invoices.length - 1}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text allowFontScaling={false} style={styles.emptyText}>No invoices yet</Text>
            <Text allowFontScaling={false} style={styles.emptySubtext}>
              Charges will appear here after your first billing cycle.
            </Text>
          </View>
        )}
      </View>

      {/* Plan Features */}
      <SectionHeader title={"What\u2019s Included"} />
      <View style={styles.card}>
        {features.map((feature, index) => (
          <View
            key={index}
            style={[styles.featureRow, index < features.length - 1 && styles.featureRowBorder]}
          >
            <Text allowFontScaling={false} style={styles.featureCheck}>{"\u2713"}</Text>
            <Text allowFontScaling={false} style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SectionHeader = ({ title }: { title: string }) => (
  <View style={styles.sectionHeader}>
    <Text allowFontScaling={false} style={styles.sectionTitle}>{title}</Text>
  </View>
);

const CardRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.cardRow}>
    <Text allowFontScaling={false} style={styles.cardLabel}>{label}</Text>
    <Text allowFontScaling={false} style={styles.cardValue}>{value}</Text>
  </View>
);

interface InvoiceRowProps {
  invoice: Invoice;
  amount: string;
  date: string;
  isLast: boolean;
}

const InvoiceRow = ({ invoice, amount, date, isLast }: InvoiceRowProps) => {
  const hasLink = !!(invoice.hosted_invoice_url || invoice.receipt_url);
  return (
    <TouchableOpacity
      style={[styles.invoiceRow, !isLast && styles.invoiceRowBorder]}
      onPress={() => {
        const url = invoice.hosted_invoice_url ?? invoice.receipt_url;
        if (url) Linking.openURL(url);
      }}
      disabled={!hasLink}
      activeOpacity={hasLink ? 0.7 : 1}
    >
      <View style={styles.invoiceLeft}>
        <Text allowFontScaling={false} style={styles.invoiceDate}>{date}</Text>
        <Text allowFontScaling={false} style={styles.invoiceAmount}>{amount}</Text>
      </View>
      <View style={styles.invoiceRight}>
        <Text
          allowFontScaling={false}
          style={[styles.invoiceStatus, { color: INVOICE_STATUS_COLOR[invoice.status] ?? "#9CA3AF" }]}
        >
          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
        </Text>
        {hasLink && (
          <Text allowFontScaling={false} style={styles.invoiceIcon}>{"\uD83D\uDCC4"}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: SPACING.lg },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    top: SPACING.xl + SPACING.lg,
    zIndex: 1,
  },
  backBtnWeb: { top: SPACING.lg },
  backText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.xs,
  },
  cardLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  cardValue: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(3),
    borderRadius: scale(20),
  },
  badgeText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  warningBanner: {
    backgroundColor: "#3D2A00",
    borderRadius: scale(8),
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  warningText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: "#F59E0B",
    fontWeight: "600",
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: moderateScale(FONT_SIZES.xs) * 1.5,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  cardIconWrap: {
    width: scale(40),
    height: scale(40),
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIconText: { fontSize: moderateScale(20) },
  paymentInfo: { flex: 1, gap: scale(2) },
  actionButton: {
    borderRadius: scale(10),
    padding: SPACING.md,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: scale(10),
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginTop: SPACING.xs,
  },
  secondaryButtonText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  actionNote: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.sm,
    lineHeight: moderateScale(FONT_SIZES.xs) * 1.5,
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  invoiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  invoiceLeft: { gap: scale(2) },
  invoiceDate: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  invoiceAmount: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  invoiceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  invoiceStatus: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "700",
  },
  invoiceIcon: { fontSize: moderateScale(FONT_SIZES.md) },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  featureRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  featureCheck: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: "#4ADE80",
    fontWeight: "700",
    width: scale(20),
    textAlign: "center",
  },
  featureText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    flex: 1,
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});