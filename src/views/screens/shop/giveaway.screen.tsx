import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { giveawayService } from "../../../models/services/giveaway.service";
import { Giveaway } from "../../../models/types/giveaway.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { formatCurrency } from "../../../utils/helpers";
import { moderateScale, scale } from "../../../utils/scaling";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { Button } from "../../components/common/button";
import { Card } from "../../components/common/card";
import { Loading } from "../../components/common/loading";
import { WebContainer } from "../../components/common/WebContainer";
import { GiveawayEntryModal } from "../../components/shop/giveaway-entry-modal";

const isWeb = Platform.OS === "web";

export const GiveawayScreen = () => {
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
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <Text allowFontScaling={false} style={styles.title}>GIVEAWAYS</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>Enter to win free gear!</Text>
        </View>

        {giveaways?.length === 0 ? (
          <View style={styles.empty}>
            <Text allowFontScaling={false} style={styles.emptyIcon}>🎁</Text>
            <Text allowFontScaling={false} style={styles.emptyText}>No active giveaways right now</Text>
            <Text allowFontScaling={false} style={styles.emptySubtext}>Check back soon!</Text>
          </View>
        ) : (
          <View style={[styles.list, isWeb && styles.listWeb]}>
            {giveaways?.map((giveaway) => (
              <View key={giveaway.id} style={isWeb ? styles.cardWeb : undefined}>
                <Card>
                  {giveaway.image_url && (
                    <Image
                      source={{ uri: giveaway.image_url }}
                      style={[styles.image, isWeb && styles.imageWeb]}
                    />
                  )}
                  <Text allowFontScaling={false} style={styles.giveawayName}>{giveaway.name}</Text>
                  {giveaway.prize_value && (
                    <Text allowFontScaling={false} style={styles.prizeValue}>
                      {formatCurrency(giveaway.prize_value)} Value
                    </Text>
                  )}
                  {giveaway.description && (
                    <Text allowFontScaling={false} style={styles.description}>{giveaway.description}</Text>
                  )}
                  {giveaway.end_date && (
                    <Text allowFontScaling={false} style={styles.endDate}>
                      Ends: {new Date(giveaway.end_date).toLocaleDateString()}
                    </Text>
                  )}
                  <Button
                    title="Enter Now"
                    onPress={() => handleEnterNow(giveaway)}
                    fullWidth
                  />
                </Card>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <GiveawayEntryModal
        visible={entryModalVisible}
        giveaway={selectedGiveaway}
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
    paddingBottom: scale(SPACING.xl),
  },
  header: {
    padding: scale(SPACING.md),
    paddingTop: scale(SPACING.xl),
  },
  headerWeb: {
    paddingTop: scale(SPACING.lg),
    paddingHorizontal: scale(SPACING.md),
    paddingBottom: scale(SPACING.sm),
  },
  title: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginTop: scale(SPACING.xs),
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: scale(SPACING.xl),
    marginTop: scale(SPACING.xxl),
  },
  emptyIcon: {
    fontSize: moderateScale(60),
    marginBottom: scale(SPACING.md),
  },
  emptyText: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: scale(SPACING.sm),
  },
  emptySubtext: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textMuted,
  },
  list: {
    padding: scale(SPACING.md),
    gap: scale(SPACING.md),
  },
  listWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: scale(SPACING.md),
    gap: scale(SPACING.md),
  },
  cardWeb: {
    flex: 1,
    minWidth: 300,
  },
  image: {
    width: "100%",
    height: scale(150),
    borderRadius: RADIUS.md,
    marginBottom: scale(SPACING.md),
    backgroundColor: COLORS.surface,
  },
  imageWeb: {
    height: scale(180),
  },
  giveawayName: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: scale(SPACING.xs),
  },
  prizeValue: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
    marginBottom: scale(SPACING.sm),
  },
  description: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: scale(SPACING.sm),
  },
  endDate: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textMuted,
    marginBottom: scale(SPACING.md),
  },
});
