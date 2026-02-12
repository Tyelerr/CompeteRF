// app/(tabs)/admin/report-management.tsx
// ═══════════════════════════════════════════════════════════
// Admin Report Management Screen
// Allows super_admin and compete_admin to view, review,
// and resolve user-submitted content reports.
//
// UPDATED: Added "Hide Tournament" action button for
//          App Store compliance (remove objectionable content).
// ═══════════════════════════════════════════════════════════

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getReports,
  updateReportStatus,
} from "../../../src/models/services/report.service";
import { tournamentService } from "../../../src/models/services/tournament.service"; // ← NEW
import {
  CONTENT_TYPE_LABELS,
  Report,
  REPORT_REASON_LABELS,
  ReportStatus,
} from "../../../src/models/types/report.types";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";

type FilterStatus = "all" | ReportStatus;

const STATUS_FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Resolved", value: "resolved" },
];

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: "#FF9800",
  reviewed: "#2196F3",
  resolved: "#4CAF50",
};

const STATUS_ICONS: Record<ReportStatus, string> = {
  pending: "time-outline",
  reviewed: "eye-outline",
  resolved: "checkmark-circle-outline",
};

export default function ReportManagementScreen() {
  const router = useRouter();
  const { user } = useAuthContext();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("pending");
  const [totalCount, setTotalCount] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const filters: any = {};
      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }
      filters.limit = 50;

      const result = await getReports(filters);
      setReports(result.data);
      setTotalCount(result.count);
    } catch (error) {
      console.error("[ReportManagement] fetch error:", error);
      Alert.alert("Error", "Failed to load reports.");
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchReports().finally(() => setLoading(false));
  }, [fetchReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  const handleUpdateStatus = async (
    reportId: string,
    newStatus: ReportStatus,
  ) => {
    if (!user?.id) return;

    const statusLabel = newStatus === "reviewed" ? "Reviewed" : "Resolved";

    Alert.alert(
      `Mark as ${statusLabel}?`,
      `This will set the report status to "${statusLabel}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: statusLabel,
          onPress: async () => {
            setProcessingId(reportId);
            try {
              await updateReportStatus(reportId, {
                status: newStatus,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              });
              await fetchReports();
            } catch (error) {
              console.error("[ReportManagement] update error:", error);
              Alert.alert("Error", "Failed to update report status.");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  // ═══════════════════════════════════════════════════════
  // NEW: Hide Tournament + auto-resolve report
  // ═══════════════════════════════════════════════════════
  const handleHideTournament = async (report: Report) => {
    if (!user?.id) return;

    Alert.alert(
      "Hide Tournament?",
      "This will hide the tournament from all public listings and auto-resolve this report. The tournament can be unhidden later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide Tournament",
          style: "destructive",
          onPress: async () => {
            setProcessingId(report.id);
            try {
              // 1. Hide the tournament
              const tournamentId = parseInt(report.content_id, 10);
              await tournamentService.hideTournament(tournamentId);

              // 2. Auto-resolve the report
              await updateReportStatus(report.id, {
                status: "resolved",
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              });

              Alert.alert(
                "Tournament Hidden",
                "The tournament has been hidden from public view and the report has been resolved.",
              );

              await fetchReports();
            } catch (error) {
              console.error("[ReportManagement] hide tournament error:", error);
              Alert.alert(
                "Error",
                "Failed to hide tournament. Please try again.",
              );
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleViewContent = (report: Report) => {
    switch (report.content_type) {
      case "tournament":
        router.push(`/tournament-detail?id=${report.content_id}` as any);
        break;
      case "profile":
        Alert.alert(
          "View Profile",
          `Profile ID: ${report.content_id}\n\nNavigate to user management to view this profile.`,
        );
        break;
      case "giveaway":
        router.push("/(tabs)/admin/giveaway-management" as any);
        break;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CONTENT REPORTS</Text>
        <Text style={styles.headerSubtitle}>
          {totalCount} total · {pendingCount} pending review
        </Text>
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.value}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setStatusFilter(filter.value)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Reports List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {reports.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
              <Text style={styles.emptyTitle}>No Reports</Text>
              <Text style={styles.emptySubtitle}>
                {statusFilter === "all"
                  ? "No reports have been submitted yet."
                  : `No ${statusFilter} reports found.`}
              </Text>
            </View>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.reportCard}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: STATUS_COLORS[report.status] + "20",
                          borderColor: STATUS_COLORS[report.status],
                        },
                      ]}
                    >
                      <Ionicons
                        name={STATUS_ICONS[report.status] as any}
                        size={12}
                        color={STATUS_COLORS[report.status]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          { color: STATUS_COLORS[report.status] },
                        ]}
                      >
                        {report.status.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.contentTypeBadge}>
                      <Text style={styles.contentTypeText}>
                        {CONTENT_TYPE_LABELS[report.content_type]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.dateText}>
                    {formatDate(report.created_at)}
                  </Text>
                </View>

                {/* Reason */}
                <View style={styles.reasonRow}>
                  <Ionicons name="flag" size={16} color="#E53935" />
                  <Text style={styles.reasonText}>
                    {REPORT_REASON_LABELS[
                      report.reason as keyof typeof REPORT_REASON_LABELS
                    ] || report.reason}
                  </Text>
                </View>

                {/* Details */}
                {report.details && (
                  <View style={styles.detailsContainer}>
                    <Text style={styles.detailsLabel}>Details:</Text>
                    <Text style={styles.detailsText}>{report.details}</Text>
                  </View>
                )}

                {/* Meta Info */}
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    Reporter: {report.reporter_id.slice(0, 8)}...
                  </Text>
                  <Text style={styles.metaText}>
                    Content ID: {report.content_id}
                  </Text>
                </View>

                {/* Reviewed Info */}
                {report.reviewed_at && (
                  <View style={styles.reviewedRow}>
                    <Ionicons
                      name="checkmark-done"
                      size={14}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.reviewedText}>
                      Reviewed {formatDate(report.reviewed_at)}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => handleViewContent(report)}
                  >
                    <Ionicons
                      name="eye-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.viewButtonText}>View Content</Text>
                  </TouchableOpacity>

                  {/* ═══ NEW: Hide Tournament button ═══ */}
                  {report.content_type === "tournament" &&
                    report.status !== "resolved" && (
                      <TouchableOpacity
                        style={styles.hideButton}
                        onPress={() => handleHideTournament(report)}
                        disabled={processingId === report.id}
                      >
                        {processingId === report.id ? (
                          <ActivityIndicator size="small" color="#E53935" />
                        ) : (
                          <>
                            <Ionicons
                              name="eye-off-outline"
                              size={14}
                              color="#E53935"
                            />
                            <Text style={styles.hideButtonText}>
                              Hide Tournament
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                  {report.status === "pending" && (
                    <TouchableOpacity
                      style={styles.reviewButton}
                      onPress={() => handleUpdateStatus(report.id, "reviewed")}
                      disabled={processingId === report.id}
                    >
                      {processingId === report.id ? (
                        <ActivityIndicator size="small" color="#2196F3" />
                      ) : (
                        <>
                          <Ionicons
                            name="eye-outline"
                            size={14}
                            color="#2196F3"
                          />
                          <Text style={styles.reviewButtonText}>
                            Mark Reviewed
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {(report.status === "pending" ||
                    report.status === "reviewed") && (
                    <TouchableOpacity
                      style={styles.resolveButton}
                      onPress={() => handleUpdateStatus(report.id, "resolved")}
                      disabled={processingId === report.id}
                    >
                      {processingId === report.id ? (
                        <ActivityIndicator size="small" color="#4CAF50" />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={14}
                            color="#4CAF50"
                          />
                          <Text style={styles.resolveButtonText}>Resolve</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  filterTabTextActive: {
    color: COLORS.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  scrollContent: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  reportCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  contentTypeBadge: {
    backgroundColor: COLORS.primary + "20",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
  },
  contentTypeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.primary,
    textTransform: "uppercase",
  },
  dateText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  reasonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  detailsContainer: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  detailsLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  detailsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  metaText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  reviewedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: SPACING.sm,
  },
  reviewedText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  viewButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.primary,
  },
  // ═══ NEW: Hide Tournament button styles ═══
  hideButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "#E53935",
    backgroundColor: "rgba(229, 57, 53, 0.1)",
  },
  hideButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: "#E53935",
  },
  reviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "#2196F3",
    backgroundColor: "rgba(33, 150, 243, 0.1)",
  },
  reviewButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: "#2196F3",
  },
  resolveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "#4CAF50",
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  resolveButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: "#4CAF50",
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
