// app/(tabs)/admin/bar-owner-billing.tsx

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import {
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
import { Invoice } from "../../../src/features/billing/billing.types";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

const PLAN_FEATURES = [
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

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>
          Loading billing...
        </Text>
      </View>
    );
  }

  const isFounding = vm.subscription?.status === "founding";

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
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, isWeb && styles.backBtnWeb]}
        >
          <Text allowFontScaling={false} style={styles.backText}>
            {"\u2190"} Back
          </Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>
          {"\uD83D\uDCB3"} BILLING
        </Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>
          Manage your subscription
        </Text>
      </View>

      {isFounding ? (
        <FoundingVenueView />
      ) : (
        <StandardBillingView vm={vm} />
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Founding Venue View
// ---------------------------------------------------------------------------

const FoundingVenueView = () => (
  <>
    {/* Founding badge card */}
    <View style={styles.foundingCard}>
      <Text allowFontScaling={false} style={styles.foundingEmoji}>
        {"\uD83C\uDF89"}
      </Text>
      <Text allowFontScaling={false} style={styles.foundingTitle}>
        Founding Venue
      </Text>
      <Text allowFontScaling={false} style={styles.foundingSubtitle}>
        Thank you for being an early partner
      </Text>
    </View>

    {/* Free access card */}
    <SectionHeader title="Your Access" />
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text allowFontScaling={false} style={styles.cardLabel}>Plan</Text>
        <Text allowFontScaling={false} style={styles.cardValue}>Venue Pro</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.cardRow}>
        <Text allowFontScaling={false} style={styles.cardLabel}>Status</Text>
        <View style={[styles.badge, { backgroundColor: "#3D2A00" }]}>
          <Text allowFontScaling={false} style={[styles.badgeText, { color: "#F59E0B" }]}>
            Founding Venue
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.cardRow}>
        <Text allowFontScaling={false} style={styles.cardLabel}>Billing</Text>
        <Text allowFontScaling={false} style={[styles.cardValue, { color: "#4ADE80" }]}>
          Free until further notice
        </Text>
      </View>
    </View>

    {/* Promise card */}
    <SectionHeader title="Our Commitment to You" />
    <View style={styles.card}>
      <View style={styles.promiseRow}>
        <Text allowFontScaling={false} style={styles.promiseIcon}>
          {"\uD83D\uDCEC"}
        </Text>
        <Text allowFontScaling={false} style={styles.promiseText}>
          When we are ready to begin billing, we will notify you at least{" "}
          <Text style={styles.promiseBold}>30 days in advance</Text> — so
          you are never surprised.
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.promiseRow}>
        <Text allowFontScaling={false} style={styles.promiseIcon}>
          {"\u2705"}
        </Text>
        <Text allowFontScaling={false} style={styles.promiseText}>
          You will always have the opportunity to{" "}
          <Text style={styles.promiseBold}>review your plan</Text> before
          any charges begin.
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.promiseRow}>
        <Text allowFontScaling={false} style={styles.promiseIcon}>
          {"\uD83D\uDD12"}
        </Text>
        <Text allowFontScaling={false} style={styles.promiseText}>
          No credit card is required right now. We will reach out when the
          time comes.
        </Text>
      </View>
    </View>

    {/* Plan features */}
    <SectionHeader title={"What\u2019s Included"} />
    <View style={styles.card}>
      {PLAN_FEATURES.map((feature, index) => (
        <View
          key={index}
          style={[
            styles.featureRow,
            index < PLAN_FEATURES.length - 1 && styles.featureRowBorder,
          ]}
        >
          <Text allowFontScaling={false} style={styles.featureCheck}>
            {"\u2713"}
          </Text>
          <Text allowFontScaling={false} style={styles.featureText}>
            {feature}
          </Text>
        </View>
      ))}
    </View>

    {/* Support */}
    <SectionHeader title="Questions?" />
    <View style={styles.card}>
      <Text allowFontScaling={false} style={styles.supportText}>
        Have questions about your account or billing? We are happy to help.
      </Text>
      <TouchableOpacity
        style={styles.supportButton}
        onPress={() => Linking.openURL("mailto:support@thecompeteapp.com")}
      >
        <Text allowFontScaling={false} style={styles.supportButtonText}>
          Contact Support
        </Text>
      </TouchableOpacity>
    </View>
  </>
);

// ---------------------------------------------------------------------------
// Standard Billing View (active, trialing, past_due, etc.)
// ---------------------------------------------------------------------------

const StandardBillingView = ({ vm }: { vm: ReturnType<typeof import("../../../src/viewmodels/useBilling").useBilling> }) => (
  <>
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
        <View style={[styles.warningBanner, { backgroundColor: "#3D2A00" }]}>
          <Text allowFontScaling={false} style={[styles.warningText, { color: "#F59E0B" }]}>
            {"\u26A0\uFE0F"} Your subscription will not renew at the end of this billing cycle. You will have full access until then.
          </Text>
        </View>
      )}
      {vm.subscription?.status === "past_due" && (
        <View style={[styles.warningBanner, { backgroundColor: "#3D2A00" }]}>
          <Text allowFontScaling={false} style={[styles.warningText, { color: "#F59E0B" }]}>
            {"\u26A0\uFE0F"} Your last payment failed. Please update your payment method to avoid losing access.
          </Text>
        </View>
      )}
      {vm.subscription?.status === "unpaid" && (
        <View style={[styles.warningBanner, { backgroundColor: "#5F1E1E" }]}>
          <Text allowFontScaling={false} style={[styles.warningText, { color: "#FF6B6B" }]}>
            {"\uD83D\uDEA8"} Your account has an unpaid balance. Update your payment method immediately to restore full access.
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
            onPress={() => Linking.openURL("mailto:support@thecompeteapp.com?subject=Update Payment Method")}
          >
            <Text allowFontScaling={false} style={styles.secondaryButtonText}>
              Update Payment Method
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text allowFontScaling={false} style={styles.emptyText}>No payment method on file</Text>
          <Text allowFontScaling={false} style={styles.emptySubtext}>
            Contact support to add a payment method.
          </Text>
        </View>
      )}
    </View>

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

    <SectionHeader title={"What\u2019s Included"} />
    <View style={styles.card}>
      {PLAN_FEATURES.map((feature, index) => (
        <View
          key={index}
          style={[styles.featureRow, index < PLAN_FEATURES.length - 1 && styles.featureRowBorder]}
        >
          <Text allowFontScaling={false} style={styles.featureCheck}>{"\u2713"}</Text>
          <Text allowFontScaling={false} style={styles.featureText}>{feature}</Text>
        </View>
      ))}
    </View>
  </>
);

// ---------------------------------------------------------------------------
// Shared sub-components
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
    fontSize: wxMs(FONT_SIZES.md),
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
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  // Founding venue
  foundingCard: {
    margin: SPACING.md,
    marginTop: SPACING.lg,
    backgroundColor: "#3D2A00",
    borderRadius: wxSc(16),
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B44",
  },
  foundingEmoji: {
    fontSize: wxMs(40),
    marginBottom: SPACING.sm,
  },
  foundingTitle: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "800",
    color: "#F59E0B",
    letterSpacing: 0.5,
  },
  foundingSubtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: "#F59E0B99",
    marginTop: SPACING.xs,
    textAlign: "center",
  },

  // Promise rows
  promiseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  promiseIcon: {
    fontSize: wxMs(FONT_SIZES.md),
    width: wxSc(24),
    textAlign: "center",
    marginTop: wxSc(1),
  },
  promiseText: {
    flex: 1,
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    lineHeight: wxMs(FONT_SIZES.sm) * 1.6,
  },
  promiseBold: {
    color: COLORS.text,
    fontWeight: "700",
  },

  // Support
  supportText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.sm,
    lineHeight: wxMs(FONT_SIZES.sm) * 1.5,
  },
  supportButton: {
    borderRadius: wxSc(10),
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  supportButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },

  // Section header
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
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
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  cardValue: {
    fontSize: wxMs(FONT_SIZES.sm),
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
    paddingVertical: wxSc(3),
    borderRadius: wxSc(20),
  },
  badgeText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  warningBanner: {
    borderRadius: wxSc(8),
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  warningText: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "600",
    textAlign: "center",
    lineHeight: wxMs(FONT_SIZES.xs) * 1.6,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: wxMs(FONT_SIZES.xs) * 1.5,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  cardIconWrap: {
    width: wxSc(40),
    height: wxSc(40),
    backgroundColor: COLORS.background,
    borderRadius: wxSc(8),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardIconText: { fontSize: wxMs(20) },
  paymentInfo: { flex: 1, gap: wxSc(2) },
  actionButton: {
    borderRadius: wxSc(10),
    padding: SPACING.md,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: wxSc(10),
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginTop: SPACING.xs,
  },
  secondaryButtonText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  actionNote: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.sm,
    lineHeight: wxMs(FONT_SIZES.xs) * 1.5,
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
  invoiceLeft: { gap: wxSc(2) },
  invoiceDate: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  invoiceAmount: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  invoiceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  invoiceStatus: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
  },
  invoiceIcon: { fontSize: wxMs(FONT_SIZES.md) },
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
    fontSize: wxMs(FONT_SIZES.md),
    color: "#4ADE80",
    fontWeight: "700",
    width: wxSc(20),
    textAlign: "center",
  },
  featureText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    flex: 1,
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});