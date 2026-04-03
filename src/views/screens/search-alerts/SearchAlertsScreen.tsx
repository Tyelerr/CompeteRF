import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { searchAlertService } from "../../../models/services/search-alert.service";
import { SearchAlert } from "../../../models/types/search-alert.types";
import { useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { Loading } from "../../components/common/loading";

const isWeb = Platform.OS === "web";

function AlertCard({ alert, onViewMatches, onEdit, onDelete, onToggleActive }: { alert: SearchAlert; onViewMatches: () => void; onEdit: () => void; onDelete: () => void; onToggleActive: () => void }) {
  const description = alert.description || searchAlertService.generateAlertDescription(alert.filter_criteria);
  const formatDate = (dateString: string) => {
    const [y, m, d] = dateString.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  };

  const matchText = alert.match_count + (alert.match_count === 1 ? " match" : " matches") + (alert.last_match_date ? " \u00B7 Last: " + formatDate(alert.last_match_date) : "");

  return (
    <View style={styles.alertCard}>
      <View style={styles.cardTopRow}>
        <Text allowFontScaling={false} style={styles.alertName} numberOfLines={1}>{alert.name}</Text>
        <TouchableOpacity style={[styles.onOffBadge, alert.is_active ? styles.onBadge : styles.offBadge]} onPress={onToggleActive}>
          <Text allowFontScaling={false} style={[styles.onOffText, alert.is_active ? styles.onText : styles.offText]}>{alert.is_active ? "ON" : "OFF"}</Text>
        </TouchableOpacity>
      </View>
      <Text allowFontScaling={false} style={styles.alertDescription} numberOfLines={2}>{description}</Text>
      <Text allowFontScaling={false} style={styles.matchInfo}>{matchText}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionButton, styles.actionOutline]} onPress={onViewMatches}>
          <Text allowFontScaling={false} style={styles.actionOutlineText}>View Matches</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.actionOutline]} onPress={onEdit}>
          <Text allowFontScaling={false} style={styles.actionOutlineText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.actionDelete]} onPress={onDelete}>
          <Text allowFontScaling={false} style={styles.actionDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SearchAlertsScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();
  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (profile?.id_auto) loadAlerts(); }, [profile?.id_auto]);

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

  const handleRefresh = async () => { setRefreshing(true); await loadAlerts(); };
  const handleCreate = () => router.push("/(tabs)/search-alerts/create" as any);
  const handleEdit = (alertId: number) => router.push(("/(tabs)/search-alerts/edit/" + alertId) as any);
  const handleViewMatches = (alertId: number) => router.push(("/(tabs)/search-alerts/matches/" + alertId) as any);

  const handleToggleActive = (alert: SearchAlert) => {
    const isActive = alert.is_active;
    const title = isActive ? "Disable Alert?" : "Enable Alert?";
    const message = isActive
      ? '"' + alert.name + '" will stop matching new tournaments until re-enabled.'
      : '"' + alert.name + '" will start matching new tournaments again.';
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isActive ? "Disable" : "Enable",
        style: isActive ? "destructive" : "default",
        onPress: async () => {
          try {
            await searchAlertService.updateAlert(alert.id, { is_active: !isActive });
            setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, is_active: !isActive } : a));
          } catch {
            Alert.alert("Error", "Failed to " + (isActive ? "disable" : "enable") + " alert.");
          }
        },
      },
    ]);
  };

  const handleDelete = (alert: SearchAlert) => {
    const msg = 'Are you sure you want to delete "' + alert.name + '"? This will also remove all match history.';
    Alert.alert("Delete Alert", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await searchAlertService.deleteAlert(alert.id);
          setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
        } catch (err) {
          console.error("Error deleting alert:", err);
          Alert.alert("Error", "Failed to delete alert.");
        }
      }},
    ]);
  };

  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.is_active).length;
  const totalMatches = alerts.reduce((sum, a) => sum + a.match_count, 0);

  if (loading) return <Loading fullScreen message="Loading search alerts..." />;

  const renderAlert = ({ item }: { item: SearchAlert }) => (
    <AlertCard
      alert={item}
      onViewMatches={() => handleViewMatches(item.id)}
      onEdit={() => handleEdit(item.id)}
      onDelete={() => handleDelete(item)}
      onToggleActive={() => handleToggleActive(item)}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text allowFontScaling={false} style={styles.emptyIcon}>{"\uD83D\uDD14"}</Text>
      <Text allowFontScaling={false} style={styles.emptyTitle}>No Search Alerts Yet</Text>
      <Text allowFontScaling={false} style={styles.emptySubtitle}>Create an alert to get notified when tournaments match your criteria.</Text>
    </View>
  );

  const renderHeader = () => (
    <>
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{totalAlerts}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Total Alerts</Text>
        </View>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{activeAlerts}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statItem}>
          <Text allowFontScaling={false} style={styles.statValue}>{totalMatches}</Text>
          <Text allowFontScaling={false} style={styles.statLabel}>Total Matches</Text>
        </View>
      </View>
      <View style={styles.createButtonWrapper}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <Text allowFontScaling={false} style={styles.createButtonText}>+ Create New Alert</Text>
        </TouchableOpacity>
      </View>
      {error && (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAlerts}>
            <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.pageWrapper, isWeb && styles.pageWrapperWeb]}>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.push("/(tabs)/profile" as any)}>
            <Text allowFontScaling={false} style={styles.backButtonText}>{"\u2039"} Back</Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.headerTitle}>Search Alerts</Text>
        </View>
        <FlatList
          data={alerts}
          renderItem={renderAlert}
          keyExtractor={(item) => item.id.toString()}
          style={styles.list}
          contentContainerStyle={[styles.listContent, alerts.length === 0 && styles.listContentEmpty]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  pageWrapper: { flex: 1 },
  pageWrapperWeb: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.xl + SPACING.lg), paddingBottom: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  backButton: { marginRight: scale(SPACING.md) },
  backButtonText: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.primary, fontWeight: "600" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text },
  statsBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: scale(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard },
  statItem: { alignItems: "center" },
  statValue: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.primary },
  statLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(2) },
  createButtonWrapper: { padding: scale(SPACING.md) },
  createButton: { backgroundColor: COLORS.primary, paddingVertical: scale(SPACING.md), borderRadius: RADIUS.md, alignItems: "center" },
  createButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  errorContainer: { backgroundColor: COLORS.error + "20", padding: scale(SPACING.md), marginHorizontal: scale(SPACING.md), marginBottom: scale(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), flex: 1 },
  retryButton: { backgroundColor: COLORS.error, paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.sm },
  retryText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  list: { flex: 1 },
  listContent: { paddingBottom: scale(SPACING.xl) },
  listContentEmpty: { flexGrow: 1 },
  alertCard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: scale(SPACING.lg), marginHorizontal: scale(SPACING.md), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: scale(SPACING.sm) },
  alertName: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, flex: 1, marginRight: scale(SPACING.sm) },
  onOffBadge: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.xs), borderRadius: RADIUS.md },
  onBadge: { backgroundColor: COLORS.primary },
  offBadge: { backgroundColor: COLORS.textMuted + "40" },
  onOffText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  onText: { color: COLORS.white },
  offText: { color: COLORS.textMuted },
  alertDescription: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, lineHeight: moderateScale(20), marginBottom: scale(SPACING.xs) },
  matchInfo: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, marginBottom: scale(SPACING.lg) },
  actionRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  actionButton: { flex: 1, paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  actionOutline: { borderWidth: 1, borderColor: COLORS.border },
  actionOutlineText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  actionDelete: { borderWidth: 1, borderColor: COLORS.error + "60", backgroundColor: COLORS.error + "10" },
  actionDeleteText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.error },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: scale(SPACING.xl * 2), paddingHorizontal: scale(SPACING.lg) },
  emptyIcon: { fontSize: moderateScale(60), marginBottom: scale(SPACING.md) },
  emptyTitle: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.text, fontWeight: "600", marginBottom: scale(SPACING.sm), textAlign: "center" },
  emptySubtitle: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", lineHeight: moderateScale(20) },
});