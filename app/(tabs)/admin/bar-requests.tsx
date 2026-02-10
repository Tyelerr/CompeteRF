// app/(tabs)/admin/bar-requests.tsx
// ═══════════════════════════════════════════════════════════
// Bar Requests Management Screen (Super Admin only)
// View layer: displays bar requests with status management
// ═══════════════════════════════════════════════════════════

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
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.refreshing}
          onRefresh={vm.onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BAR REQUESTS</Text>
        <Text style={styles.headerSubtitle}>Venue recommendations from users</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.pending + "20" }]}>
          <Text style={[styles.statNumber, { color: STATUS_COLORS.pending }]}>
            {vm.pendingCount}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.contacted + "20" }]}>
          <Text style={[styles.statNumber, { color: STATUS_COLORS.contacted }]}>
            {vm.contactedCount}
          </Text>
          <Text style={styles.statLabel}>Contacted</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.approved + "20" }]}>
          <Text style={[styles.statNumber, { color: STATUS_COLORS.approved }]}>
            {vm.approvedCount}
          </Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: STATUS_COLORS.rejected + "20" }]}>
          <Text style={[styles.statNumber, { color: STATUS_COLORS.rejected }]}>
            {vm.rejectedCount}
          </Text>
          <Text style={styles.statLabel}>Rejected</Text>
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
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No requests found</Text>
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

// ——————————————————————————————————————————
// REQUEST CARD COMPONENT
// ——————————————————————————————————————————

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
            style={[
              styles.statusText,
              { color: STATUS_COLORS[request.status] },
            ]}
          >
            {STATUS_LABELS[request.status]}
          </Text>
        </View>
        <Text style={styles.timeAgo}>{timeAgo(request.created_at)}</Text>
      </View>

      {/* Venue Info */}
      <Text style={styles.venueName}>{request.venue_name}</Text>
      {request.address && (
        <TouchableOpacity onPress={openMaps}>
          <Text style={styles.venueDetail}>📍 {request.address}</Text>
        </TouchableOpacity>
      )}
      {request.city && request.state && (
        <Text style={styles.venueDetail}>
          {request.city}, {request.state} {request.zip_code}
        </Text>
      )}
      {request.phone && (
        <TouchableOpacity onPress={callVenue}>
          <Text style={[styles.venueDetail, { color: COLORS.primary }]}>
            📞 {request.phone}
          </Text>
        </TouchableOpacity>
      )}

      {/* Submitter Notes */}
      {request.submitter_notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>User notes:</Text>
          <Text style={styles.notesText}>{request.submitter_notes}</Text>
        </View>
      )}

      {/* Admin Notes Toggle */}
      <TouchableOpacity
        style={styles.adminNotesToggle}
        onPress={() => setShowNotes(!showNotes)}
      >
        <Text style={styles.adminNotesToggleText}>
          {showNotes ? "Hide Admin Notes ▲" : "Admin Notes ▼"}
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
              <Text style={styles.actionBtnText}>Contacted</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.rejected }]}
              onPress={() => handleStatusChange("rejected")}
            >
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}
        {request.status === "contacted" && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.approved }]}
              onPress={() => handleStatusChange("approved")}
            >
              <Text style={styles.actionBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.rejected }]}
              onPress={() => handleStatusChange("rejected")}
            >
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}
        {(request.status === "rejected" || request.status === "approved") && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: STATUS_COLORS.pending }]}
            onPress={() => handleStatusChange("pending")}
          >
            <Text style={styles.actionBtnText}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ——————————————————————————————————————————
// STYLES
// ——————————————————————————————————————————

const styles = StyleSheet.create({
  container: {
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
    fontSize: FONT_SIZES.md,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
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
    borderRadius: 10,
    padding: SPACING.sm,
    alignItems: "center",
  },
  statNumber: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  filtersScroll: {
    maxHeight: 50,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  filterTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: FONT_SIZES.sm,
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
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: 12,
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
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  timeAgo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  venueDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notesBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  notesLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: "600",
    marginBottom: 4,
  },
  notesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  adminNotesToggle: {
    marginTop: SPACING.sm,
  },
  adminNotesToggleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  adminNotesInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
    minHeight: 50,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
  },
});
