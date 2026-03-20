import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { getInitials } from "../../../utils/helpers";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";

export const ProfileScreen = () => {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { width } = useWindowDimensions();

  const isSmallScreen = width < 375;
  const avatarSize = isSmallScreen ? 64 : 80;
  const avatarRadius = avatarSize / 2;
  const avatarFontSize = isSmallScreen ? FONT_SIZES.xl : FONT_SIZES.xxl;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>PROFILE</Text>
      </View>

      <View style={[styles.profileSection, isSmallScreen && styles.profileSectionSmall]}>
        <View
          style={[
            styles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarRadius,
              marginBottom: isSmallScreen ? SPACING.sm : SPACING.md,
            },
          ]}
        >
          <Text style={[styles.avatarText, { fontSize: avatarFontSize }]}>
            {getInitials(profile?.name || "")}
          </Text>
        </View>

        <Text
          style={[styles.name, isSmallScreen && styles.nameSmall]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {profile?.name}
        </Text>

        <Text style={styles.username} numberOfLines={1}>
          @{profile?.user_name?.toUpperCase()}
        </Text>

        <Text style={styles.userId}>User ID: {profile?.id_auto}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              🎱 {profile?.role?.replace("_", " ")}
            </Text>
          </View>
        </View>

        <Text style={styles.location} numberOfLines={1}>
          📍 {profile?.home_city || ""} {profile?.home_state}
        </Text>
        <Text style={styles.memberSince}>
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
            <Text style={styles.menuIcon}>❤️</Text>
            <Text style={styles.menuText} numberOfLines={1}>My Favorites</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔍</Text>
            <Text style={styles.menuText} numberOfLines={1}>Search Alerts</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>✉️</Text>
            <Text style={styles.menuText} numberOfLines={1}>Messages</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card
          onPress={() => router.push("/(tabs)/notification-preferences" as any)}
        >
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuText} numberOfLines={1}>Notification Preferences</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>⚙️</Text>
            <Text style={styles.menuText} numberOfLines={1}>Settings</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={handleSignOut}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuText, styles.logoutText]} numberOfLines={1}>Log Out</Text>
            <Text style={styles.menuArrow}>→</Text>
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
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  titleSmall: {
    fontSize: FONT_SIZES.lg,
  },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileSectionSmall: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
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
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: "90%",
  },
  nameSmall: {
    fontSize: FONT_SIZES.lg,
  },
  username: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
    textTransform: "uppercase",
  },
  userId: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  badge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    maxWidth: "90%",
  },
  badgeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    maxWidth: "90%",
    textAlign: "center",
  },
  memberSince: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: "center",
  },
  editButtonWrapper: {
    width: "100%",
    alignItems: "center",
  },
  menu: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  menuIcon: {
    fontSize: FONT_SIZES.lg,
    marginRight: SPACING.md,
    width: 28,
    textAlign: "center",
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  menuArrow: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  logoutText: {
    color: COLORS.error,
  },
});
