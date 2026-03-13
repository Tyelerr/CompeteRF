import { useQuery } from "@tanstack/react-query";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { giveawayService } from "../../../models/services/giveaway.service";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency } from "../../../utils/helpers";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";
import { Loading } from "../../components/common/loading";
import { WebContainer } from "../../components/common/WebContainer";

const isWeb = Platform.OS === "web";

export const GiveawayScreen = () => {
  const { data: giveaways, isLoading } = useQuery({
    queryKey: ["giveaways", "active"],
    queryFn: () => giveawayService.getActiveGiveaways(),
  });

  if (isLoading) {
    return <Loading fullScreen message="Loading giveaways..." />;
  }

  return (
    <WebContainer>
      <ScrollView
        style={styles.container}
        contentContainerStyle={isWeb ? styles.contentContainerWeb : undefined}
      >
        {/* Header — web skips extra paddingTop since nav handles safe area */}
        <View style={[styles.header, isWeb && styles.headerWeb]}>
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
          <View style={[styles.list, isWeb && styles.listWeb]}>
            {giveaways?.map((giveaway) => (
              <Card key={giveaway.id} style={isWeb ? styles.cardWeb : undefined}>
                {giveaway.image_url && (
                  <Image
                    source={{ uri: giveaway.image_url }}
                    style={[styles.image, isWeb && styles.imageWeb]}
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
    </WebContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Web: constrain width and center content
  contentContainerWeb: {
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
    paddingBottom: SPACING.xl,
  },

  // ----- Header -----
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
  // Web: nav already accounts for safe area, just need a comfortable gap
  headerWeb: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  // ----- Empty State -----
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

  // ----- List -----
  list: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  // Web: two-column grid
  listWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },

  // ----- Card -----
  // Web: each card takes ~half width minus gap
  cardWeb: {
    flex: 1,
    minWidth: 300,
  },

  // ----- Image -----
  image: {
    width: "100%",
    height: 150,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  imageWeb: {
    height: 180,
  },

  // ----- Card Content -----
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
