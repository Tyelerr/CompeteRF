import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { getInitials } from "../../../utils/helpers";
import { moderateScale, scale } from "../../../utils/scaling";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";

export const ProfileScreen = () => {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { width } = useWindowDimensions();

  const isSmallScreen = width < 375;
  const avatarSize = isSmallScreen ? scale(64) : scale(80);
  const avatarRadius = avatarSize / 2;
  const avatarFontSize = isSmallScreen ? moderateScale(FONT_SIZES.xl) : moderateScale(FONT_SIZES.xxl);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[styles.title, isSmallScreen && styles.titleSmall]}>PROFILE</Text>
      </View>

      <View style={[styles.profileSection, isSmallScreen && styles.profileSectionSmall]}>
        <View
          style={[
            styles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarRadius,
              marginBottom: isSmallScreen ? scale(SPACING.sm) : scale(SPACING.md),
            },
          ]}
        >
          <Text allowFontScaling={false} style={[styles.avatarText, { fontSize: avatarFontSize }]}>
            {getInitials(profile?.name || "")}
          </Text>
        </View>

        <Text
          allowFontScaling={false}
          style={[styles.name, isSmallScreen && styles.nameSmall]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {profile?.name}
        </Text>

        <Text allowFontScaling={false} style={styles.username} numberOfLines={1}>
          @{profile?.user_name?.toUpperCase()}
        </Text>

        <Text allowFontScaling={false} style={styles.userId}>User ID: {profile?.id_auto}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1}>
              🎱 {profile?.role?.replace("_", " ")}
            </Text>
          </View>
        </View>

        <Text allowFontScaling={false} style={styles.location} numberOfLines={1}>
          📍 {profile?.home_city || ""} {profile?.home_state}
        </Text>
        <Text allowFontScaling={false} style={styles.memberSince}>
          📅 Member since{" "}
          {new Date(profile?.created_at || "").toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })}
        </Text>

        <View style={styles.editButtonWrapper}>
          <Button title="✏️ Edit Profile" onPress={() => {}} variant="outline" />
        </View>
      </View>

      <View style={styles.menu}>
        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>❤️</Text>
            <Text allowFontScaling={false} style={styles.menuText} numberOfLines={1}>My Favorites</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>🔔</Text>
            <Text allowFontScaling={false} style={styles.menuText} numberOfLines={1}>Search Alerts</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>✉️</Text>
            <Text allowFontScaling={false} style={styles.menuText} numberOfLines={1}>Messages</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => router.push("/(tabs)/notification-preferences" as any)}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>🔔</Text>
            <Text allowFontScaling={false} style={styles.menuText} numberOfLines={1}>Notification Preferences</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>⚙️</Text>
            <Text allowFontScaling={false} style={styles.menuText} numberOfLines={1}>Settings</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={handleSignOut}>
          <View style={styles.menuItem}>
            <Text allowFontScaling={false} style={styles.menuIcon}>🚪</Text>
            <Text allowFontScaling={false} style={[styles.menuText, styles.logoutText]} numberOfLines={1}>Log Out</Text>
            <Text allowFontScaling={false} style={styles.menuArrow}>→</Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    flexGrow: 1,
  },
  header: {
    padding: scale(SPACING.md),
    paddingTop: scale(SPACING.xl),
  },
  title: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
  },
  titleSmall: {
    fontSize: moderateScale(FONT_SIZES.lg),
  },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileSectionSmall: {
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
  },
  avatar: {
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "700",
    color: COLORS.white,
  },
  name: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: "90%",
  },
  nameSmall: {
    fontSize: moderateScale(FONT_SIZES.lg),
  },
  username: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    marginBottom: scale(SPACING.xs),
    textTransform: "uppercase",
  },
  userId: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textMuted,
    marginBottom: scale(SPACING.md),
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: scale(SPACING.md),
    gap: scale(SPACING.xs),
  },
  badge: {
    backgroundColor: COLORS.surface,
    paddingVertical: scale(SPACING.xs),
    paddingHorizontal: scale(SPACING.md),
    borderRadius: RADIUS.full,
    maxWidth: "90%",
  },
  badgeText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
  },
  location: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: scale(SPACING.xs),
    maxWidth: "90%",
    textAlign: "center",
  },
  memberSince: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: scale(SPACING.lg),
    textAlign: "center",
  },
  editButtonWrapper: {
    width: "100%",
    alignItems: "center",
  },
  menu: {
    padding: scale(SPACING.md),
    gap: scale(SPACING.sm),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  menuIcon: {
    fontSize: moderateScale(FONT_SIZES.lg),
    marginRight: scale(SPACING.md),
    width: scale(28),
    textAlign: "center",
  },
  menuText: {
    flex: 1,
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.text,
  },
  menuArrow: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textMuted,
    marginLeft: scale(SPACING.sm),
  },
  logoutText: {
    color: COLORS.error,
  },
});
