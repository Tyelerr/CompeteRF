// src/views/components/profile/SearchAlertsInline.tsx
// Inline Search Alerts for the profile (replaces the full-screen modal). Renders
// the user's alerts as a flowing list under the My Tournaments / Search Alerts
// toggle (no FlatList — it lives inside the profile ScrollView). Create / edit /
// view-matches reuse the existing /search-alerts/* routes.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { searchAlertService } from "../../../models/services/search-alert.service";
import { SearchAlert } from "../../../models/types/search-alert.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

// Keep the inline area roughly as tall as the My Tournaments view so toggling
// between them doesn't shrink the page and jump the scroll position.
const MIN_HEIGHT = Math.round(Dimensions.get("window").height * 0.7);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

export const SearchAlertsInline = ({ userId }: { userId: number }) => {
  const router = useRouter();
  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setAlerts(await searchAlertService.getUserAlerts(userId));
    } catch {
      setError("Failed to load your search alerts.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Reload when the profile regains focus (e.g. returning from create/edit).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleActive = (a: SearchAlert) => {
    const title = a.is_active ? "Disable Alert?" : "Enable Alert?";
    Alert.alert(title, a.name, [
      { text: "Cancel" },
      {
        text: a.is_active ? "Disable" : "Enable",
        style: a.is_active ? "destructive" : "default",
        onPress: async () => {
          try {
            await searchAlertService.updateAlert(a.id, { is_active: !a.is_active });
            setAlerts((prev) =>
              prev.map((x) => (x.id === a.id ? { ...x, is_active: !x.is_active } : x)),
            );
          } catch {
            Alert.alert("Error", "Failed to update the alert.");
          }
        },
      },
    ]);
  };

  const remove = (a: SearchAlert) => {
    Alert.alert("Delete Alert", `Delete "${a.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await searchAlertService.deleteAlert(a.id);
            setAlerts((prev) => prev.filter((x) => x.id !== a.id));
          } catch {
            Alert.alert("Error", "Failed to delete the alert.");
          }
        },
      },
    ]);
  };

  const go = (path: string) => router.push(path as any);
  const totalMatches = alerts.reduce((s, a) => s + a.match_count, 0);
  const activeCount = alerts.filter((a) => a.is_active).length;

  return (
    <View style={styles.root}>
      {/* Stats */}
      <View style={styles.statsBar}>
        {[
          { v: alerts.length, l: "Total" },
          { v: activeCount, l: "Active" },
          { v: totalMatches, l: "Matches" },
        ].map((s) => (
          <View key={s.l} style={styles.stat}>
            <Text allowFontScaling={false} style={styles.statValue}>
              {s.v}
            </Text>
            <Text allowFontScaling={false} style={styles.statLabel}>
              {s.l}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.createBtn}
        onPress={() => go("/(tabs)/search-alerts/create")}
      >
        <Text allowFontScaling={false} style={styles.createBtnText}>
          + Create New Alert
        </Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text allowFontScaling={false} style={styles.errorText}>
            {error}
          </Text>
          <TouchableOpacity onPress={load}>
            <Text allowFontScaling={false} style={styles.retry}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.empty}>
          <Text allowFontScaling={false} style={styles.emptyTitle}>
            No search alerts yet
          </Text>
          <Text allowFontScaling={false} style={styles.emptyBody}>
            Create an alert to get notified when tournaments match your criteria.
          </Text>
        </View>
      ) : (
        alerts.map((a) => {
          const desc =
            a.description ||
            searchAlertService.generateAlertDescription(a.filter_criteria);
          return (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text allowFontScaling={false} style={styles.alertName} numberOfLines={1}>
                  {a.name}
                </Text>
                <TouchableOpacity
                  style={[styles.onOff, a.is_active ? styles.on : styles.off]}
                  onPress={() => toggleActive(a)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.onOffText, a.is_active ? styles.onText : styles.offText]}
                  >
                    {a.is_active ? "ON" : "OFF"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text allowFontScaling={false} style={styles.alertDesc} numberOfLines={2}>
                {desc}
              </Text>
              <Text allowFontScaling={false} style={styles.matchInfo}>
                {a.match_count} {a.match_count === 1 ? "match" : "matches"}
                {a.last_match_date ? ` · Last: ${formatDate(a.last_match_date)}` : ""}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.outline]}
                  onPress={() => go(`/(tabs)/search-alerts/matches/${a.id}`)}
                >
                  <Text allowFontScaling={false} style={styles.outlineText}>
                    View Matches
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.outline]}
                  onPress={() => go(`/(tabs)/search-alerts/edit/${a.id}`)}
                >
                  <Text allowFontScaling={false} style={styles.outlineText}>
                    Edit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => remove(a)}
                >
                  <Text allowFontScaling={false} style={styles.deleteText}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { marginTop: wxSc(SPACING.sm), minHeight: MIN_HEIGHT },
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: wxSc(SPACING.md),
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: wxSc(SPACING.md),
  },
  stat: { alignItems: "center" },
  statValue: { fontSize: wxMs(FONT_SIZES.xl), fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 2 },
  createBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: wxSc(SPACING.md),
    borderRadius: RADIUS.md,
    alignItems: "center",
    marginBottom: wxSc(SPACING.md),
  },
  createBtnText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.md), fontWeight: "700" },
  center: { alignItems: "center", paddingVertical: wxSc(SPACING.xl), gap: wxSc(SPACING.sm) },
  errorText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm) },
  retry: { color: COLORS.primary, fontWeight: "700", fontSize: wxMs(FONT_SIZES.sm) },
  empty: { alignItems: "center", paddingVertical: wxSc(SPACING.xl), gap: wxSc(SPACING.xs) },
  emptyTitle: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  emptyBody: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    textAlign: "center",
    paddingHorizontal: wxSc(SPACING.lg),
  },
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.md),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: wxSc(SPACING.xs),
  },
  alertName: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, flex: 1, marginRight: wxSc(SPACING.sm) },
  onOff: { paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(2), borderRadius: RADIUS.md },
  on: { backgroundColor: COLORS.primary },
  off: { backgroundColor: COLORS.textMuted + "40" },
  onOffText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  onText: { color: COLORS.white },
  offText: { color: COLORS.textMuted },
  alertDesc: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: wxSc(2) },
  matchInfo: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: wxSc(SPACING.md) },
  actions: { flexDirection: "row", gap: wxSc(SPACING.sm) },
  actionBtn: {
    flex: 1,
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  outline: { borderWidth: 1, borderColor: COLORS.border },
  outlineText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.text },
  deleteBtn: { borderWidth: 1, borderColor: COLORS.error + "60", backgroundColor: COLORS.error + "10" },
  deleteText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.error },
});
