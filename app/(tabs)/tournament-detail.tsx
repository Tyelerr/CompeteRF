import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useTournamentDetail } from "../../src/viewmodels/useTournamentDetail";
import { Button } from "../../src/views/components/common/button";
import { FullScreenImageViewer } from "../../src/views/components/common/FullScreenImageViewer";
import { Loading } from "../../src/views/components/common/loading";

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams();
  const vm = useTournamentDetail(id as string);

  // Image viewer state
  const [showImageViewer, setShowImageViewer] = useState(false);

  // Get tournament image URL (same logic as useBilliards)
  const getTournamentImageUrl = (tournament: any) => {
    const gameTypeImageMap: Record<string, string> = {
      "8-ball": "8-ball.jpeg",
      "9-ball": "9-ball.jpeg",
      "10-ball": "10-ball.jpeg",
      "one-pocket": "One-Pocket.jpeg",
      "straight-pool": "Straight-Pool.jpeg",
      banks: "Banks.jpeg",
    };

    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:")) {
        return tournament.thumbnail.replace("custom:", "");
      } else {
        const imageFile = gameTypeImageMap[tournament.thumbnail];
        if (imageFile) {
          return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
        }
      }
    }

    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) {
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    }

    return null;
  };

  const openImageViewer = () => {
    if (tournament && getTournamentImageUrl(tournament)) {
      setShowImageViewer(true);
    }
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
  };

  if (vm.loading) {
    return <Loading fullScreen message="Loading tournament..." />;
  }

  if (vm.error || !vm.tournament) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={vm.goBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {vm.error || "Tournament not found"}
          </Text>
        </View>
      </View>
    );
  }

  const tournament = vm.tournament;
  const imageUrl = getTournamentImageUrl(tournament);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={vm.goBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Deleted Banner */}
          {vm.isDeleted && (
            <View style={styles.deletedBanner}>
              <Text style={styles.deletedText}>
                🗑️ This tournament has been deleted
              </Text>
            </View>
          )}

          {/* Top Section with Badges, Title and Image */}
          <View style={styles.topSection}>
            {/* Left Side - Badges and Title */}
            <View style={styles.leftContent}>
              {/* Badges */}
              <View style={styles.badges}>
                <View style={styles.gameTypeBadge}>
                  <Text style={styles.gameTypeText}>
                    {tournament.game_type}
                  </Text>
                </View>
                <View style={styles.formatBadge}>
                  <Text style={styles.formatText}>
                    {tournament.tournament_format.replace("_", " ")}
                  </Text>
                </View>
                {tournament.is_recurring && (
                  <View style={styles.recurringBadge}>
                    <Text style={styles.recurringText}>🔄 Weekly</Text>
                  </View>
                )}
              </View>

              <Text style={styles.title}>{tournament.name}</Text>

              {tournament.description && (
                <Text style={styles.description}>{tournament.description}</Text>
              )}
            </View>

            {/* Right Side - Tournament Image */}
            <View style={styles.imageSection}>
              <View style={styles.imageContainer}>
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.tournamentImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Text style={styles.placeholderText}>🎱</Text>
                  </View>
                )}
              </View>

              {/* View Image Button */}
              {imageUrl && (
                <TouchableOpacity
                  style={styles.viewImageButton}
                  onPress={openImageViewer}
                >
                  <Text style={styles.viewImageIcon}>🔍</Text>
                  <Text style={styles.viewImageText}>View Image</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Date & Time</Text>
            <Text style={styles.sectionText}>{vm.formattedDate}</Text>
            <Text style={styles.sectionText}>{vm.formattedTime}</Text>
          </View>

          {/* Entry & Prizes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💰 Entry & Prizes</Text>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Entry Fee:</Text>
              <Text style={styles.feeValue}>{vm.formattedEntryFee}</Text>
            </View>
            {tournament.added_money > 0 && (
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Added Money:</Text>
                <Text style={styles.addedMoney}>${tournament.added_money}</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎱 Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reports to Fargo:</Text>
              <Text style={styles.detailValue}>
                {tournament.reports_to_fargo ? "Yes" : "No"}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Open Tournament:</Text>
              <Text style={styles.detailValue}>
                {tournament.open_tournament ? "Yes" : "No"}
              </Text>
            </View>
            {tournament.max_fargo && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Max Fargo:</Text>
                <Text style={styles.detailValue}>{tournament.max_fargo}</Text>
              </View>
            )}
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Location</Text>
            <Text style={styles.venueName}>{tournament.venues?.venue}</Text>
            <Text style={styles.venueAddress}>
              {tournament.venues?.address}
            </Text>
            <Text style={styles.venueAddress}>
              {tournament.venues?.city}, {tournament.venues?.state}{" "}
              {tournament.venues?.zip_code}
            </Text>

            <View style={styles.venueActions}>
              <Button
                title="📍 Open in Maps"
                onPress={vm.openMaps}
                variant="outline"
                size="sm"
              />
              {tournament.venues?.phone && (
                <Button
                  title="📞 Call Venue"
                  onPress={vm.callVenue}
                  variant="outline"
                  size="sm"
                />
              )}
            </View>
          </View>

          {/* Spacer for tab bar */}
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      {/* Full Screen Image Viewer */}
      <FullScreenImageViewer
        visible={showImageViewer}
        imageUrl={imageUrl}
        title={tournament.name}
        onClose={closeImageViewer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flex: 1,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
  },
  backButton: {
    paddingVertical: SPACING.sm,
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
  },
  content: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  deletedBanner: {
    backgroundColor: COLORS.error,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  deletedText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    textAlign: "center",
  },
  topSection: {
    flexDirection: "row",
    marginBottom: SPACING.lg,
    alignItems: "flex-start",
  },
  leftContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  imageSection: {
    alignItems: "center",
    minWidth: 100,
  },
  imageContainer: {
    marginBottom: SPACING.sm,
  },
  tournamentImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: {
    fontSize: FONT_SIZES.xl + 8,
  },
  viewImageButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 100,
    justifyContent: "center",
  },
  viewImageIcon: {
    fontSize: FONT_SIZES.xs,
    marginRight: SPACING.xs / 2,
  },
  viewImageText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  gameTypeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  formatBadge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  formatText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.xs,
    textTransform: "capitalize",
  },
  recurringBadge: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  recurringText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  sectionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  feeLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  feeValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  addedMoney: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.success,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  detailLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venueAddress: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  venueActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.md,
    textAlign: "center",
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
