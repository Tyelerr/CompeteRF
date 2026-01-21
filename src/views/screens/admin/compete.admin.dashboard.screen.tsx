import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";

export const CompeteAdminDashboardScreen = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>COMPETE ADMIN</Text>
        <Text style={styles.subtitle}>Dashboard</Text>
      </View>

      <View style={styles.stats}>
        <Card>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </Card>
        <Card>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Total Venues</Text>
        </Card>
      </View>

      <View style={styles.stats}>
        <Card>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Active Tournaments</Text>
        </Card>
        <Card>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Active Giveaways</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>⚡ QUICK ACTIONS</Text>
      <View style={styles.actions}>
        <Button title="➕ Create Venue" onPress={() => {}} fullWidth />
        <Button title="🎁 Create Giveaway" onPress={() => {}} fullWidth />
        <Button
          title="👥 Manage Users"
          onPress={() => {}}
          variant="outline"
          fullWidth
        />
        <Button
          title="❓ Manage FAQs"
          onPress={() => {}}
          variant="outline"
          fullWidth
        />
      </View>

      <Text style={styles.sectionTitle}>🎫 PENDING APPROVALS</Text>
      <Card>
        <Text style={styles.emptyText}>No pending approvals</Text>
      </Card>

      <Text style={styles.sectionTitle}>📬 SUPPORT TICKETS</Text>
      <Card>
        <Text style={styles.emptyText}>No open tickets</Text>
      </Card>
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
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  stats: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statNumber: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  actions: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
});
