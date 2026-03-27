// app/(tabs)/admin/bar-requests.tsx
// Bar Requests Management Screen (Super Admin only)

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useBarRequests } from "../../../src/viewmodels/hooks/use.bar.requests";
import {
  BarRequest,
  BarRequestStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from "../../../src/models/types/bar-request.types";
import { useState } from "react";

const isWeb = Platform.OS === "web";

const STATUS_FILTERS: { label: string; value: BarRequestStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Contacted", value: "contacted" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export default function BarRequestsScreen() {
  const router = useRouter();
  const vm = useBarRequests();

  if (vm.loading) {
    return (
      <View style={styles.center}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}/>
          )
        }
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>BAR REQUESTS</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>Venue recommendations from users</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.pending + "20" }]}>
          <Text allowFontScaling={false} style={[styles.statNumber, { color: STATUS_COLORS.pending }]}>
            {vm.pendingCount}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.contacted + "20" }]}>
          <Text allowFontScaling={false} style={[styles.statNumber, { color: STATUS_COLORS.contacted }]}>
            {vm.contactedCount}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Contacted</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.approved + "20" }]}>
          <Text allowFontScaling={false} style={[styles.statNumber, { color: STATUS_COLORS.approved }]}>
            {vm.approvedCount}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Approved</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.rejected + "20" }]}>
          <Text allowFontScaling={false} style={[styles.statNumber, { color: STATUS_COLORS.rejected }]}>
            {vm.rejectedCount}
          </Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Rejected</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterTab,
              vm.statusFilter === f.value && styles.filterTabActive,
            ]}
            onPress={() => vm.setStatusFilter(f.value)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.filterTabText,
                vm.statusFilter === f.value && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Request Cards */}
      {vm.requests.length === 0 ? (
        <View style={styles.empty}>
          <Text allowFontScaling={false} style={styles.emptyIcon}>{"\uD83D\uDCCB"}</Text>
          <Text allowFontScaling={false} style={styles.emptyText}>No requests found</Text>
        </View>
      ) : (
        vm.requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onUpdateStatus={vm.updateStatus}
          />
        ))
      )}

      <View style={{ height: SPACING.xl * 2 }} />
    </ScrollView>
  );
}

const RequestCard = ({
  request,
  onUpdateStatus,
}: {
  request: BarRequest;
  onUpdateStatus: (id: number, status: BarRequestStatus, notes?: string) => Promise<void>;
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || "");

  const handleStatusChange = (newStatus: BarRequestStatus) => {
    const label = STATUS_LABELS[newStatus];
    Alert.alert(
      `Mark as ${label}?`,
      `Update this request to "${label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          onPress: () => onUpdateStatus(request.id, newStatus, adminNotes || undefined),
        },
      ],
    );
  };

  const openMaps = () => {
    const query = encodeURIComponent(
      `${request.venue_name} ${request.address || ""} ${request.city || ""} ${request.state || ""}`,
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const callVenue = () => {
    if (request.phone) {
      Linking.openURL(`tel:${request.phone}`);
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  return (
    <View style={styles.card}>
      {/* Status Badge */}
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[request.status] + "20" },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.statusText,
              { color: STATUS_COLORS[request.status] },
            ]}
          >
            {STATUS_LABELS[request.status]}
          </Text>
        </View>
        <Text allowFontScaling={false} style={styles.timeAgo}>{timeAgo(request.created_at)}</Text>
      </View>

      {/* Venue Info */}
      <Text allowFontScaling={false} style={styles.venueName}>{request.venue_name}</Text>
      {request.address && (
        <TouchableOpacity onPress={openMaps}>
          <Text allowFontScaling={false} style={styles.venueDetail}>{"\uD83D\uDCCD"} {request.address}</Text>
        </TouchableOpacity>
      )}
      {request.city && request.state && (
        <Text allowFontScaling={false} style={styles.venueDetail}>
          {request.city}, {request.state} {request.zip_code}
        </Text>
      )}
      {request.phone && (
        <TouchableOpacity onPress={callVenue}>
          <Text allowFontScaling={false} style={[styles.venueDetail, { color: COLORS.primary }]}>
            {"\uD83D\uDCDE"} {request.phone}
          </Text>
        </TouchableOpacity>
      )}

      {/* Submitter Notes */}
      {request.submitter_notes && (
        <View style={styles.notesBox}>
          <Text allowFontScaling={false} style={styles.notesLabel}>User notes:</Text>
          <Text allowFontScaling={false} style={styles.notesText}>{request.submitter_notes}</Text>
        </View>
      )}

      {/* Admin Notes Toggle */}
      <TouchableOpacity
        style={styles.adminNotesToggle}
        onPress={() => setShowNotes(!showNotes)}
      >
        <Text allowFontScaling={false} style={styles.adminNotesToggleText}>
          {showNotes ? "\Hide Admin Notes \u25B2" : "Admin Notes \u25BC"}
        </Text>
      </TouchableOpacity>

      {showNotes && (
        <TextInput
          style={styles.adminNotesInput}
          placeholder="Add notes about this request..."
          placeholderTextColor={COLORS.textMuted}
          value={adminNotes}
          onChangeText={setAdminNotes}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {request.status === "pending" && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.contacted }]}
              onPress={() => handleStatusChange("contacted")}
            >
              <Text allowFontScaling={false} style={styles.actionBtnText}>Contacted</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.rejected }]}
              onPress={() => handleStatusChange("rejected")}
            >
              <Text allowFontScaling={false} style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}
        {request.status === "contacted" && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.approved }]}
              onPress={() => handleStatusChange("approved")}
            >
              <Text allowFontScaling={false} style={styles.actionBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.rejected }]}
              onPress={() => handleStatusChange("rejected")}
            >
              <Text allowFontScaling={false} style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}
        {(request.status === "rejected" || request.status === "approved") && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.pending }]}
            onPress={() => handleStatusChange("pending")}
          >
            <Text allowFontScaling={false} style={styles.actionBtnText}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: moderateScale(FONT_SIZES.md),
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backText: {
    color: COLORS.primary,
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "600",
    marginBottom: SPACING.sm,
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
  statsRow: {
    flexDirection: "row",
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  statBadge: {
    flex: 1,
    borderRadius: scale(10),
    padding: SPACING.sm,
    alignItems: "center",
  },
  statNumber: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
  },
  statLabel: {
    fontSize: moderateScale(10),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  filtersScroll: {
    maxHeight: scale(50),
  },
  filtersContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  filterTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: scale(20),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  filterTabTextActive: {
    color: "#fff",
  },
  empty: {
    alignItems: "center",
    paddingVertical: SPACING.xl * 2,
  },
  emptyIcon: {
    fontSize: moderateScale(40),
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textMuted,
  },
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: scale(12),
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(4),
    borderRadius: scale(6),
  },
  statusText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "700",
    textTransform: "uppercase",
  },
  timeAgo: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
  },
  venueName: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: scale(4),
  },
  venueDetail: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  notesBox: {
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  notesLabel: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "600",
    marginBottom: scale(4),
  },
  notesText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
  },
  adminNotesToggle: {
    marginTop: SPACING.sm,
  },
  adminNotesToggleText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "600",
  },
  adminNotesInput: {
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
    minHeight: scale(50),
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
  },
});


