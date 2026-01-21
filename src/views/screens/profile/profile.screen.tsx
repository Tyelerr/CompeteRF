import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { getInitials } from "../../../utils/helpers";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";

export const ProfileScreen = () => {
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PROFILE</Text>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(profile?.name || "")}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.username}>@{profile?.user_name}</Text>
        <Text style={styles.userId}>User ID: {profile?.id_auto}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              🎱 {profile?.role?.replace("_", " ")}
            </Text>
          </View>
        </View>

        <Text style={styles.location}>
          📍 {profile?.home_city || ""} {profile?.home_state}
        </Text>
        <Text style={styles.memberSince}>
          📅 Member since{" "}
          {new Date(profile?.created_at || "").toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })}
        </Text>

        <Button title="✏️ Edit Profile" onPress={() => {}} variant="outline" />
      </View>

      <View style={styles.menu}>
        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>❤️</Text>
            <Text style={styles.menuText}>My Favorites</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔍</Text>
            <Text style={styles.menuText}>Saved Searches</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>✉️</Text>
            <Text style={styles.menuText}>Messages</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuText}>Notification Preferences</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={() => {}}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>⚙️</Text>
            <Text style={styles.menuText}>Settings</Text>
            <Text style={styles.menuArrow}>→</Text>
          </View>
        </Card>

        <Card onPress={handleSignOut}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuText, styles.logoutText]}>Log Out</Text>
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
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  profileSection: {
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  avatarText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.white,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text,
  },
  username: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  userId: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: SPACING.md,
  },
  badge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  memberSince: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  menu: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuIcon: {
    fontSize: FONT_SIZES.lg,
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  menuArrow: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  logoutText: {
    color: COLORS.error,
  },
});
