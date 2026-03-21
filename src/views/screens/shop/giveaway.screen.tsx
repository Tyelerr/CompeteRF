import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { giveawayService } from "../../../models/services/giveaway.service";
import { Giveaway } from "../../../models/types/giveaway.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency } from "../../../utils/helpers";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";
import { Loading } from "../../components/common/loading";
import { WebContainer } from "../../components/common/WebContainer";
import { GiveawayEntryModal } from "../../components/shop/giveaway-entry-modal";

const isWeb = Platform.OS === "web";

export const GiveawayScreen = () => {
  // Read directly from Zustand store so userId is always the live value —
  // not a snapshot captured inside a stale React context render.
  const profile = useAuthStore((s) => s.profile);

  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [entryModalVisible, setEntryModalVisible] = useState(false);

  const { data: giveaways, isLoading, refetch } = useQuery({
    queryKey: ["giveaways", "active"],
    queryFn: () => giveawayService.getActiveGiveaways(),
  });

  const handleEnterNow = (giveaway: Giveaway) => {
    setSelectedGiveaway(giveaway);
    setEntryModalVisible(true);
  };

  const handleModalClose = () => {
    setEntryModalVisible(false);
    setSelectedGiveaway(null);
  };

  const handleEntrySuccess = (_giveawayId: number) => {
    // Refetch so the card can reflect entered state if needed
    refetch();
    handleModalClose();
  };

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
                <Button
                  title="Enter Now"
                  onPress={() => handleEnterNow(giveaway)}
                  fullWidth
                />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Entry modal — rendered once at screen level so it always has
          the live profile in scope, not a per-card stale closure */}
      <GiveawayEntryModal
        visible={entryModalVisible}
        giveaway={selectedGiveaway}
        userId={profile?.id_auto ?? 0}
        onClose={handleModalClose}
        onSuccess={handleEntrySuccess}
      />
    </WebContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainerWeb: {
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
    paddingBottom: SPACING.xl,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl,
  },
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
  listWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  cardWeb: {
    flex: 1,
    minWidth: 300,
  },
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
