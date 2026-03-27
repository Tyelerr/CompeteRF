import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { analyticsService } from "../../src/models/services/analytics.service";
import { useAuth } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useReport } from "../../src/viewmodels/hooks/useReport";
import { useFavorites } from "../../src/viewmodels/hooks/use.favorites";
import { useTournamentDetail } from "../../src/viewmodels/useTournamentDetail";
import { Button } from "../../src/views/components/common/button";
import { FullScreenImageViewer } from "../../src/views/components/common/FullScreenImageViewer";
import { Loading } from "../../src/views/components/common/loading";
import ReportModal from "../../src/views/components/common/ReportModal";
import { useAuthContext } from "../../src/providers/AuthProvider";

const isWeb = Platform.OS === "web";

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams();
  const vm = useTournamentDetail(id as string);
  const { session, isAdmin } = useAuth();
  const { profile } = useAuthContext();
  const { isFavorited, toggleFavorite, isToggling } = useFavorites(profile?.id_auto);
  const {
    isModalVisible,
    openReportModal,
    closeReportModal,
    reason,
    setReason,
    details,
    setDetails,
    handleSubmit,
    isSubmitting,
    contentType,
  } = useReport({ userId: session?.user?.id });

  const [showImageViewer, setShowImageViewer] = useState(false);

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
        if (imageFile)
          return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
      }
    }
    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile)
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    const partialMatch = Object.keys(gameTypeImageMap).find((key) =>
      tournament.game_type?.toLowerCase().includes(key),
    );
    if (partialMatch)
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${gameTypeImageMap[partialMatch]}`;
    return null;
  };

  const handleShare = async () => {
    if (!tournament) return;
    try {
      // FIX: use competerf:///tournament-detail?id= so Expo Router can resolve
      // the route to app/(tabs)/tournament-detail.tsx via search params.
      // The previous competerf://tournament/123 had no matching route file.
      const deepLink = `competerf:///tournament-detail?id=${tournament.id}`;
      const message =
        `\uD83C\uDFB1 ${tournament.name}\n` +
        `\uD83D\uDCC5 ${vm.formattedDate} \u2022 ${vm.formattedTime}\n` +
        `\uD83D\uDCB0 ${vm.formattedEntryFee}\n\n` +
        deepLink;
      await Share.share({ message });
      analyticsService.trackTournamentShared(tournament.id);
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  if (vm.loading) return <Loading fullScreen message="Loading tournament..." />;

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

  const tournament: any = vm.tournament;
  const imageUrl = getTournamentImageUrl(tournament);
  const isChipTournament = tournament.tournament_format === "chip-tournament";
  const chipRanges =
    isChipTournament &&
    Array.isArray(tournament.chip_ranges) &&
    tournament.chip_ranges.length > 0
      ? tournament.chip_ranges
      : null;

  const favorited = isFavorited(tournament.id);

  const content = (
    <ScrollView
      style={isWeb ? wStyles.scrollView : styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {!isWeb && (
        <View style={styles.header}>
          <TouchableOpacity onPress={vm.goBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.content, isWeb && wStyles.content]}>
        {vm.isDeleted && (
          <View style={styles.deletedBanner}>
            <Text style={styles.deletedText}>
              🗑️ This tournament has been deleted
            </Text>
          </View>
        )}
        {vm.isHidden && isAdmin && (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off" size={16} color="#fff" />
            <Text style={styles.hiddenText}>
              HIDDEN – This tournament has been hidden by an admin
            </Text>
          </View>
        )}

        {/* Top Section */}
        <View style={[styles.topSection, isWeb && wStyles.topSection]}>
          <View style={styles.leftContent}>
            <View style={styles.badges}>
              <View style={styles.idBadge}>
                <Text style={styles.idText}>ID: {tournament.id}</Text>
              </View>
              <View style={styles.gameTypeBadge}>
                <Text style={styles.gameTypeText}>{tournament.game_type}</Text>
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
              {vm.isHidden && isAdmin && (
                <View style={styles.hiddenInlineBadge}>
                  <Text style={styles.hiddenInlineText}>HIDDEN</Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, isWeb && wStyles.title]}>
              {tournament.name}
            </Text>
            {tournament.description && (
              <Text style={styles.description}>{tournament.description}</Text>
            )}
          </View>

          {/* Image + Heart */}
          <View style={[styles.imageSection, isWeb && wStyles.imageSection]}>
            <View style={styles.imageContainer}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={[
                    styles.tournamentImage,
                    isWeb && wStyles.tournamentImage,
                  ]}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.placeholderImage,
                    isWeb && wStyles.tournamentImage,
                  ]}
                >
                  <Text style={styles.placeholderText}>🎱</Text>
                </View>
              )}
            </View>
            {imageUrl && (
              <TouchableOpacity
                style={styles.viewImageButton}
                onPress={() => setShowImageViewer(true)}
              >
                <Text style={styles.viewImageIcon}>🔍</Text>
                <Text style={styles.viewImageText}>View Image</Text>
              </TouchableOpacity>
            )}
            {/* ADDED: Heart button — always visible, prompts login if needed */}
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(tournament.id)}
              disabled={isToggling}
              activeOpacity={0.7}
            >
              <Ionicons
                name={favorited ? "heart" : "heart-outline"}
                size={44}
                color={favorited ? "#E53935" : COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Chip chart */}
        {chipRanges && (
          <View style={styles.chipCard}>
            <Text style={styles.chipTitle}>RATING / CHIP CHART</Text>
            {chipRanges.map((range: any, index: number) => (
              <Text key={index} style={styles.chipLine}>
                {range.label || `${range.minRating}–${range.maxRating}`}:{" "}
                <Text style={styles.chipLineCount}>
                  {range.chips} Chip{range.chips !== 1 ? "s" : ""}
                </Text>
              </Text>
            ))}
          </View>
        )}

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
          {tournament.table_size && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Table Size:</Text>
              <Text style={styles.detailValue}>{tournament.table_size}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reports to Fargo:</Text>
            <Text style={styles.detailValue}>
              {tournament.reports_to_fargo ? "Yes" : "No"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Calcutta:</Text>
            <Text style={styles.detailValue}>
              {tournament.calcutta ? "Yes" : "No"}
            </Text>
          </View>
          {!isChipTournament && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Open Tournament:</Text>
              <Text style={styles.detailValue}>
                {tournament.open_tournament ? "Yes" : "No"}
              </Text>
            </View>
          )}
          {tournament.max_fargo && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Max Fargo:</Text>
              <Text style={styles.detailValue}>{tournament.max_fargo}</Text>
            </View>
          )}
          {tournament.game_spot && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Game Spot:</Text>
              <Text style={styles.detailValue}>{tournament.game_spot}</Text>
            </View>
          )}
          {tournament.race && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Race:</Text>
              <Text style={styles.detailValue}>{tournament.race}</Text>
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Location</Text>
          <Text style={styles.venueName}>{tournament.venues?.venue}</Text>
          <Text style={styles.venueAddress}>{tournament.venues?.address}</Text>
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

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>📤 Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() =>
              openReportModal("tournament", tournament.id.toString())
            }
          >
            <Ionicons name="flag-outline" size={14} color="#E53935" />
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={vm.goBack}>
            <Text style={styles.closeButtonText}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimerText}>
          This tournament is organized by{" "}
          {tournament.venues?.venue || "an independent venue"}. Compete is not
          the organizer and is not responsible for tournament operations.
        </Text>
        <View style={styles.bottomSpacer} />
      </View>
    </ScrollView>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={wStyles.backdrop}
          activeOpacity={1}
          onPress={vm.goBack}
        />
        <View style={wStyles.dialogWrap}>
          <View style={wStyles.dialog}>
            <View style={wStyles.dialogHeader}>
              <TouchableOpacity onPress={vm.goBack} style={wStyles.backBtn}>
                <Text style={wStyles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={vm.goBack} style={wStyles.closeBtn}>
                <Text style={wStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            {content}
          </View>
        </View>
        <FullScreenImageViewer
          visible={showImageViewer}
          imageUrl={imageUrl}
          title={tournament.name}
          onClose={() => setShowImageViewer(false)}
        />
        <ReportModal
          visible={isModalVisible}
          onClose={closeReportModal}
          contentType={contentType}
          reason={reason}
          onReasonChange={setReason}
          details={details}
          onDetailsChange={setDetails}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </>
    );
  }

  return (
    <View style={styles.container}>
      {content}
      <FullScreenImageViewer
        visible={showImageViewer}
        imageUrl={imageUrl}
        title={tournament.name}
        onClose={() => setShowImageViewer(false)}
      />
      <ReportModal
        visible={isModalVisible}
        onClose={closeReportModal}
        contentType={contentType}
        reason={reason}
        onReasonChange={setReason}
        details={details}
        onDetailsChange={setDetails}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flex: 1 },
  header: { padding: SPACING.md, paddingTop: SPACING.xl + SPACING.lg },
  backButton: { paddingVertical: SPACING.sm },
  backText: { color: COLORS.primary, fontSize: FONT_SIZES.md },
  content: { padding: SPACING.md, paddingTop: 0 },
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
  hiddenBanner: {
    backgroundColor: "#E53935",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  hiddenText: {
    color: "#fff",
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    textAlign: "center",
  },
  hiddenInlineBadge: {
    backgroundColor: "#E53935",
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  hiddenInlineText: { color: "#fff", fontSize: FONT_SIZES.xs, fontWeight: "700" },
  topSection: {
    flexDirection: "row",
    marginBottom: SPACING.lg,
    alignItems: "flex-start",
  },
  leftContent: { flex: 1, marginRight: SPACING.md },
  imageSection: { alignItems: "center", minWidth: 100 },
  imageContainer: { marginBottom: SPACING.sm },
  tournamentImage: { width: 100, height: 100, borderRadius: RADIUS.md },
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
  placeholderText: { fontSize: FONT_SIZES.xl + 8 },
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
  viewImageIcon: { fontSize: FONT_SIZES.xs, marginRight: SPACING.xs / 2 },
  viewImageText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  favoriteButton: {
    marginTop: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  idBadge: {
    backgroundColor: "#000",
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  idText: { color: COLORS.white, fontSize: FONT_SIZES.xs, fontWeight: "700" },
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
  recurringText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs },
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
  sectionText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  feeLabel: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  feeValue: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  addedMoney: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.success },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  detailLabel: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  detailValue: { fontSize: FONT_SIZES.md, color: COLORS.text },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venueAddress: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
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
  bottomSpacer: { height: SPACING.xl * 2 },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.md,
    lineHeight: 16,
    opacity: 0.6,
  },
  chipCard: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  chipTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  chipLine: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 3,
    textAlign: "center",
  },
  chipLineCount: { fontWeight: "800", color: COLORS.primary },
  bottomActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  shareButton: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
  },
  shareButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.primary,
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "#E53935",
    backgroundColor: "rgba(229, 57, 53, 0.1)",
  },
  reportButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: "#E53935",
  },
  closeButton: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.error,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.white,
  },
});

const wStyles = StyleSheet.create({
  backdrop: {
    position: "fixed" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 1000,
  },
  dialogWrap: {
    position: "fixed" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    pointerEvents: "box-none" as any,
  },
  dialog: {
    width: 720,
    maxWidth: "92%" as any,
    maxHeight: "88vh" as any,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    paddingTop: 16,
    backgroundColor: COLORS.background,
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backBtnText: { color: COLORS.primary, fontSize: FONT_SIZES.sm },
  closeBtn: {
    backgroundColor: COLORS.error,
    width: 28, height: 28,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: FONT_SIZES.sm, fontWeight: "700" },
  scrollView: { maxHeight: "calc(88vh - 50px)" as any },
  content: { padding: SPACING.lg },
  topSection: { flexDirection: "row", gap: SPACING.lg },
  title: { fontSize: FONT_SIZES.xl },
  imageSection: { alignItems: "center", minWidth: 140 },
  tournamentImage: { width: 140, height: 140, borderRadius: RADIUS.md },
});
