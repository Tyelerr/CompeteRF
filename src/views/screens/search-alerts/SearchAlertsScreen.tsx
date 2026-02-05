import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { searchAlertService } from "../../../models/services/search-alert.service";
import { SearchAlert } from "../../../models/types/search-alert.types";
import { useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Loading } from "../../components/common/loading";

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onViewMatches,
  onEdit,
  onDelete,
}: {
  alert: SearchAlert;
  onViewMatches: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const description =
    alert.description ||
    searchAlertService.generateAlertDescription(alert.filter_criteria);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <View style={styles.alertCard}>
      {/* Top Row: Name + ON/OFF badge */}
      <View style={styles.cardTopRow}>
        <Text style={styles.alertName} numberOfLines={1}>
          {alert.name}
        </Text>
        <View
          style={[
            styles.onOffBadge,
            alert.is_active ? styles.onBadge : styles.offBadge,
          ]}
        >
          <Text
            style={[
              styles.onOffText,
              alert.is_active ? styles.onText : styles.offText,
            ]}
          >
            {alert.is_active ? "ON" : "OFF"}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.alertDescription} numberOfLines={2}>
        {description}
      </Text>

      {/* Match info */}
      <Text style={styles.matchInfo}>
        {alert.match_count} {alert.match_count === 1 ? "match" : "matches"}
        {alert.last_match_date
          ? ` · Last: ${formatDate(alert.last_match_date)}`
          : ""}
      </Text>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionOutline]}
          onPress={onViewMatches}
        >
          <Text style={styles.actionOutlineText}>View Matches</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionOutline]}
          onPress={onEdit}
        >
          <Text style={styles.actionOutlineText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionDelete]}
          onPress={onDelete}
        >
          <Text style={styles.actionDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchAlertsScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();

  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id_auto) {
      loadAlerts();
    }
  }, [profile?.id_auto]);

  const loadAlerts = useCallback(async () => {
    if (!profile?.id_auto) return;
    try {
      setError(null);
      const data = await searchAlertService.getUserAlerts(profile.id_auto);
      setAlerts(data);
    } catch (err) {
      console.error("Error loading alerts:", err);
      setError("Failed to load your search alerts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id_auto]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
  };

  const handleCreate = () => {
    router.push("/search-alerts/create" as any);
  };

  const handleEdit = (alertId: number) => {
    router.push(`/search-alerts/edit/${alertId}` as any);
  };

  const handleViewMatches = (alertId: number) => {
    router.push(`/search-alerts/matches/${alertId}` as any);
  };

  const handleDelete = (alert: SearchAlert) => {
    Alert.alert(
      "Delete Alert",
      `Are you sure you want to delete "${alert.name}"? This will also remove all match history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await searchAlertService.deleteAlert(alert.id);
              setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
            } catch (err) {
              console.error("Error deleting alert:", err);
              Alert.alert("Error", "Failed to delete alert.");
            }
          },
        },
      ],
    );
  };

  // Stats
  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.is_active).length;
  const totalMatches = alerts.reduce((sum, a) => sum + a.match_count, 0);

  if (loading) {
    return <Loading fullScreen message="Loading search alerts..." />;
  }

  const renderAlert = ({ item }: { item: SearchAlert }) => (
    <AlertCard
      alert={item}
      onViewMatches={() => handleViewMatches(item.id)}
      onEdit={() => handleEdit(item.id)}
      onDelete={() => handleDelete(item)}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyTitle}>No Search Alerts Yet</Text>
      <Text style={styles.emptySubtitle}>
        Create an alert to get notified when tournaments match your criteria.
      </Text>
    </View>
  );

  const renderHeader = () => (
    <>
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalAlerts}</Text>
          <Text style={styles.statLabel}>Total Alerts</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{activeAlerts}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalMatches}</Text>
          <Text style={styles.statLabel}>Total Matches</Text>
        </View>
      </View>

      {/* Create Button */}
      <View style={styles.createButtonWrapper}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <Text style={styles.createButtonText}>+ Create New Alert</Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAlerts}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Alerts</Text>
      </View>

      {/* List */}
      <FlatList
        data={alerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          alerts.length === 0 && styles.listContentEmpty,
        ]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  backButton: {
    marginRight: SPACING.md,
  },
  backButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },

  // Stats Bar
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Create Button
  createButtonWrapper: {
    padding: SPACING.md,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  createButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },

  // Error
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    flex: 1,
  },
  retryButton: {
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  retryText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // Alert Card
  alertCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  alertName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  onOffBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  onBadge: {
    backgroundColor: COLORS.primary,
  },
  offBadge: {
    backgroundColor: COLORS.textMuted + "40",
  },
  onOffText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
  },
  onText: {
    color: COLORS.white,
  },
  offText: {
    color: COLORS.textMuted,
  },

  // Description
  alertDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },

  // Match info
  matchInfo: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },

  // Action Row
  actionRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionOutline: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionOutlineText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  actionDelete: {
    borderWidth: 1,
    borderColor: COLORS.error + "60",
    backgroundColor: COLORS.error + "10",
  },
  actionDeleteText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.error,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
