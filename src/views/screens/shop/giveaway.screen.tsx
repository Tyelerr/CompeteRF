import { useQuery } from "@tanstack/react-query";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { giveawayService } from "../../../models/services/giveaway.service";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency } from "../../../utils/helpers";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";
import { Loading } from "../../components/common/loading";

export const GiveawayScreen = () => {
  const { data: giveaways, isLoading } = useQuery({
    queryKey: ["giveaways", "active"],
    queryFn: () => giveawayService.getActiveGiveaways(),
  });

  if (isLoading) {
    return <Loading fullScreen message="Loading giveaways..." />;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GIVEAWAYS</Text>
        <Text style={styles.subtitle}>Enter to win free gear!</Text>
      </View>

      {giveaways?.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎁</Text>
          <Text style={styles.emptyText}>No active giveaways right now</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {giveaways?.map((giveaway) => (
            <Card key={giveaway.id}>
              {giveaway.image_url && (
                <Image
                  source={{ uri: giveaway.image_url }}
                  style={styles.image}
                />
              )}
              <Text style={styles.giveawayName}>{giveaway.name}</Text>
              {giveaway.prize_value && (
                <Text style={styles.prizeValue}>
                  {formatCurrency(giveaway.prize_value)} Value
                </Text>
              )}
              {giveaway.description && (
                <Text style={styles.description}>{giveaway.description}</Text>
              )}
              {giveaway.end_date && (
                <Text style={styles.endDate}>
                  Ends: {new Date(giveaway.end_date).toLocaleDateString()}
                </Text>
              )}
              <Button title="Enter Now" onPress={() => {}} fullWidth />
            </Card>
          ))}
        </View>
      )}
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
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    marginTop: SPACING.xxl,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  image: {
    width: "100%",
    height: 150,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  giveawayName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  prizeValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  endDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
});
