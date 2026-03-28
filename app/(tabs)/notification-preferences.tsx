// app/(tabs)/notification-preferences.tsx
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { moderateScale, scale } from "../../src/utils/scaling";
import { useNotificationPreferences } from "../../src/viewmodels/hooks/use.notification.preferences";

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { user } = useAuthContext();
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    devicePermission,
    categories,
    togglePreference,
    openDeviceSettings,
    refresh,
  } = useNotificationPreferences(user?.id);

  const onRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/(tabs)/profile" as any)}>
          <Text allowFontScaling={false} style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>NOTIFICATIONS</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {devicePermission !== "granted" && (
          <TouchableOpacity style={styles.permissionBanner} onPress={openDeviceSettings} activeOpacity={0.7}>
            <View style={styles.permissionContent}>
              <Text allowFontScaling={false} style={styles.permissionIcon}>⚠️</Text>
              <View style={styles.permissionTextContainer}>
                <Text allowFontScaling={false} style={styles.permissionTitle}>Notifications are disabled</Text>
                <Text allowFontScaling={false} style={styles.permissionSubtitle}>Tap here to enable notifications in your device settings</Text>
              </View>
              <Text allowFontScaling={false} style={styles.permissionArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refresh}>
              <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text allowFontScaling={false} style={styles.sectionDescription}>
          {"Choose which notifications you'd like to receive. You can change these at any time."}
        </Text>

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>NOTIFICATION CATEGORIES</Text>
          {categories.map((category, index) => {
            const isEnabled = preferences?.[category.key] ?? true;
            const isLast = index === categories.length - 1;
            return (
              <View key={category.key} style={[styles.preferenceRow, !isLast && styles.preferenceRowBorder]}>
                <View style={styles.preferenceInfo}>
                  <View style={styles.preferenceHeader}>
                    <Text allowFontScaling={false} style={styles.preferenceIcon}>{category.icon}</Text>
                    <Text allowFontScaling={false} style={styles.preferenceLabel}>{category.label}</Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.preferenceDescription}>{category.description}</Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={(value) => togglePreference(category.key, value)}
                  trackColor={{ false: COLORS.border, true: COLORS.primary + "80" }}
                  thumbColor={isEnabled ? COLORS.primary : COLORS.textMuted}
                  disabled={isSaving}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>QUICK ACTIONS</Text>
          <TouchableOpacity style={styles.quickActionRow} onPress={() => categories.forEach((cat) => togglePreference(cat.key, true))} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.quickActionIcon}>✅</Text>
            <Text allowFontScaling={false} style={styles.quickActionText}>Enable all notifications</Text>
          </TouchableOpacity>
          <View style={styles.quickActionDivider} />
          <TouchableOpacity style={styles.quickActionRow} onPress={() => categories.forEach((cat) => togglePreference(cat.key, false))} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.quickActionIcon}>🔇</Text>
            <Text allowFontScaling={false} style={[styles.quickActionText, { color: COLORS.error }]}>Disable all notifications</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text allowFontScaling={false} style={styles.footerText}>
            Even with notifications disabled, you can still view updates in the app. Push notifications require device permissions to be enabled.
          </Text>
          {devicePermission === "granted" && (
            <TouchableOpacity style={styles.deviceSettingsLink} onPress={openDeviceSettings}>
              <Text allowFontScaling={false} style={styles.deviceSettingsText}>Open Device Settings →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginTop: scale(SPACING.md) },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.lg),
    paddingBottom: scale(SPACING.sm),
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  backButton: { width: scale(70) },
  backButtonText: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.primary, fontWeight: "600" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, letterSpacing: 1 },
  permissionBanner: {
    marginHorizontal: scale(SPACING.md), marginTop: scale(SPACING.md),
    backgroundColor: "#FEF3C7", borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: "#F59E0B", overflow: "hidden",
  },
  permissionContent: { flexDirection: "row", alignItems: "center", padding: scale(SPACING.md), gap: scale(SPACING.sm) },
  permissionIcon: { fontSize: moderateScale(24) },
  permissionTextContainer: { flex: 1 },
  permissionTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#92400E" },
  permissionSubtitle: { fontSize: moderateScale(FONT_SIZES.xs), color: "#A16207", marginTop: scale(2) },
  permissionArrow: { fontSize: moderateScale(FONT_SIZES.lg), color: "#A16207" },
  errorBanner: {
    marginHorizontal: scale(SPACING.md), marginTop: scale(SPACING.md),
    backgroundColor: COLORS.error + "15", borderRadius: RADIUS.md,
    padding: scale(SPACING.md), flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
  },
  errorText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.error, flex: 1 },
  retryText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  scrollContent: { flex: 1 },
  sectionDescription: {
    fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary,
    lineHeight: moderateScale(FONT_SIZES.sm) * 1.5,
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.md),
    paddingBottom: scale(SPACING.sm),
  },
  section: {
    marginHorizontal: scale(SPACING.md), marginTop: scale(SPACING.md),
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  sectionTitle: {
    fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700",
    color: COLORS.textMuted, letterSpacing: 1,
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.md),
    paddingBottom: scale(SPACING.sm),
  },
  preferenceRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    gap: scale(SPACING.md),
  },
  preferenceRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  preferenceInfo: { flex: 1 },
  preferenceHeader: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm), marginBottom: scale(4) },
  preferenceIcon: { fontSize: moderateScale(18) },
  preferenceLabel: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  preferenceDescription: {
    fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary,
    lineHeight: moderateScale(FONT_SIZES.xs) * 1.5,
    paddingLeft: scale(26),
  },
  quickActionRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    gap: scale(SPACING.sm),
  },
  quickActionDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: scale(SPACING.md) },
  quickActionIcon: { fontSize: moderateScale(18) },
  quickActionText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "500", color: COLORS.primary },
  footer: {
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.lg),
    paddingBottom: scale(SPACING.md),
  },
  footerText: {
    fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted,
    lineHeight: moderateScale(FONT_SIZES.xs) * 1.6, textAlign: "center",
  },
  deviceSettingsLink: { alignItems: "center", marginTop: scale(SPACING.sm) },
  deviceSettingsText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  bottomSpacer: { height: scale(SPACING.xl * 2) },
});
