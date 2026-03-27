// app/(tabs)/notification-preferences.tsx
// ═══════════════════════════════════════════════════════════
// Notification Preferences Screen
// Users can toggle notification categories on/off
// ═══════════════════════════════════════════════════════════

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
  Platform,
} from "react-native";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { moderateScale, scale } from "../../../src/utils/scaling";
import { useNotificationPreferences } from "../../../src/viewmodels/hooks/use.notification.preferences";

const isWeb = Platform.OS === "web";

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

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

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
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>NOTIFICATIONS</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={false}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}/>
          )
        }
      >
        {/* Device Permission Banner */}
        {devicePermission !== "granted" && (
          <TouchableOpacity
            style={styles.permissionBanner}
            onPress={openDeviceSettings}
            activeOpacity={0.7}
          >
            <View style={styles.permissionContent}>
              <Text allowFontScaling={false} style={styles.permissionIcon}>⚠️</Text>
              <View style={styles.permissionTextContainer}>
                <Text allowFontScaling={false} style={styles.permissionTitle}>
                  Notifications are disabled
                </Text>
                <Text allowFontScaling={false} style={styles.permissionSubtitle}>
                  Tap here to enable notifications in your device settings
                </Text>
              </View>
              <Text allowFontScaling={false} style={styles.permissionArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Error State */}
        {error && (
          <View style={styles.errorBanner}>
            <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refresh}>
              <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <Text allowFontScaling={false} style={styles.sectionDescription}>
          Choose which notifications you{"'"}d like to receive. You can change
          these
        </Text>

        {/* Notification Categories */}
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>NOTIFICATION CATEGORIES</Text>

          {categories.map((category, index) => {
            const isEnabled = preferences?.[category.key] ?? true;
            const isLast = index === categories.length - 1;

            return (
              <View
                key={category.key}
                style={[
                  styles.preferenceRow,
                  !isLast && styles.preferenceRowBorder,
                ]}
              >
                <View style={styles.preferenceInfo}>
                  <View style={styles.preferenceHeader}>
                    <Text allowFontScaling={false} style={styles.preferenceIcon}>{category.icon}</Text>
                    <Text allowFontScaling={false} style={styles.preferenceLabel}>{category.label}</Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.preferenceDescription}>
                    {category.description}
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={(value) =>
                    togglePreference(category.key, value)
                  }
                  trackColor={{
                    false: COLORS.border,
                    true: COLORS.primary + "80",
                  }}
                  thumbColor={isEnabled ? COLORS.primary : COLORS.textMuted}
                  disabled={isSaving}
                />
              </View>
            );
          })}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>QUICK ACTIONS</Text>

          <TouchableOpacity
            style={styles.quickActionRow}
            onPress={() => {
              categories.forEach((cat) => togglePreference(cat.key, true));
            }}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={styles.quickActionIcon}>✅</Text>
            <Text allowFontScaling={false} style={styles.quickActionText}>Enable all notifications</Text>
          </TouchableOpacity>

          <View style={styles.quickActionDivider} />

          <TouchableOpacity
            style={styles.quickActionRow}
            onPress={() => {
              categories.forEach((cat) => togglePreference(cat.key, false));
            }}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={styles.quickActionIcon}>🔇</Text>
            <Text allowFontScaling={false} style={[styles.quickActionText, { color: COLORS.error }]}>
              Disable all notifications
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info Footer */}
        <View style={styles.footer}>
          <Text allowFontScaling={false} style={styles.footerText}>
            Even with notifications disabled, you can still view updates in the
            app. Push notifications require device permissions to be enabled.
          </Text>
          {devicePermission === "granted" && (
            <TouchableOpacity
              style={styles.deviceSettingsLink}
              onPress={openDeviceSettings}
            >
              <Text allowFontScaling={false} style={styles.deviceSettingsText}>
                Open Device Settings →
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  // Web centering
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backButton: {
    width: scale(70),
  },
  backButtonText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },

  // ── Permission Banner ──
  permissionBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: "#FEF3C7",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "#F59E0B",
    overflow: "hidden",
  },
  permissionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  permissionIcon: {
    fontSize: moderateScale(24),
  },
  permissionTextContainer: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "700",
    color: "#92400E",
  },
  permissionSubtitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: "#A16207",
    marginTop: scale(2),
  },
  permissionArrow: {
    fontSize: moderateScale(FONT_SIZES.lg),
    color: "#A16207",
  },

  // ── Error ──
  errorBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: COLORS.error + "15",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.error,
    flex: 1,
  },
  retryText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Content ──
  scrollContent: {
    flex: 1,
  },
  sectionDescription: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },

  // ── Section ──
  section: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },

  // ── Preference Row ──
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  preferenceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  preferenceInfo: {
    flex: 1,
  },
  preferenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: scale(4),
  },
  preferenceIcon: {
    fontSize: moderateScale(18),
  },
  preferenceLabel: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.text,
  },
  preferenceDescription: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    lineHeight: 16,
    paddingLeft: scale(26),
  },

  // ── Quick Actions ──
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  quickActionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  quickActionIcon: {
    fontSize: moderateScale(18),
  },
  quickActionText: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "500",
    color: COLORS.primary,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  footerText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  deviceSettingsLink: {
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  deviceSettingsText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "600",
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
