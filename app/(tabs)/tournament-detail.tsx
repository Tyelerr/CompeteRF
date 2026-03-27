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
import { moderateScale, scale } from "../../src/utils/scaling";
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
    isModalVisible, openReportModal, closeReportModal,
    reason, setReason, details, setDetails,
    handleSubmit, isSubmitting, contentType,
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
        if (imageFile) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
      }
    }
    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    const partialMatch = Object.keys(gameTypeImageMap).find((key) => tournament.game_type?.toLowerCase().includes(key));
    if (partialMatch) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${gameTypeImageMap[partialMatch]}`;
    return null;
  };

  const handleShare = async () => {
    if (!tournament) return;
    try {
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
            <Text allowFontScaling={false} style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={styles.errorText}>{vm.error || "Tournament not found"}</Text>
        </View>
      </View>
    );
  }

  const tournament: any = vm.tournament;
  const imageUrl = getTournamentImageUrl(tournament);
  const isChipTournament = tournament.tournament_format === "chip-tournament";
  const chipRanges = isChipTournament && Array.isArray(tournament.chip_ranges) && tournament.chip_ranges.length > 0
    ? tournament.chip_ranges : null;
  const favorited = isFavorited(tournament.id);

  const content = (
    <ScrollView style={isWeb ? wStyles.scrollView : styles.scrollContent} showsVerticalScrollIndicator={false}>
      {!isWeb && (
        <View style={styles.header}>
          <TouchableOpacity onPress={vm.goBack} style={styles.backButton}>
            <Text allowFontScaling={false} style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.content, isWeb && wStyles.content]}>
        {vm.isDeleted && (
          <View style={styles.deletedBanner}>
            <Text allowFontScaling={false} style={styles.deletedText}>{"\uD83D\uDDD1\uFE0F"} This tournament has been deleted</Text>
          </View>
        )}
        {vm.isHidden && isAdmin && (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off" size={scale(16)} color="#fff" />
            <Text allowFontScaling={false} style={styles.hiddenText}>HIDDEN – This tournament has been hidden by an admin</Text>
          </View>
        )}

        <View style={[styles.topSection, isWeb && wStyles.topSection]}>
          <View style={styles.leftContent}>
            <View style={styles.badges}>
              <View style={styles.idBadge}>
                <Text allowFontScaling={false} style={styles.idText}>ID: {tournament.id}</Text>
              </View>
              <View style={styles.gameTypeBadge}>
                <Text allowFontScaling={false} style={styles.gameTypeText}>{tournament.game_type}</Text>
              </View>
              <View style={styles.formatBadge}>
                <Text allowFontScaling={false} style={styles.formatText}>{tournament.tournament_format.replace("_", " ")}</Text>
              </View>
              {tournament.is_recurring && (
                <View style={styles.recurringBadge}>
                  <Text allowFontScaling={false} style={styles.recurringText}>{"\uD83D\uDD04"} Weekly</Text>
                </View>
              )}
              {vm.isHidden && isAdmin && (
                <View style={styles.hiddenInlineBadge}>
                  <Text allowFontScaling={false} style={styles.hiddenInlineText}>HIDDEN</Text>
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={[styles.title, isWeb && wStyles.title]}>{tournament.name}</Text>
            {tournament.description && (
              <Text allowFontScaling={false} style={styles.description}>{tournament.description}</Text>
            )}
          </View>

          <View style={[styles.imageSection, isWeb && wStyles.imageSection]}>
            <View style={styles.imageContainer}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={[styles.tournamentImage, isWeb && wStyles.tournamentImage]} resizeMode="cover" />
              ) : (
                <View style={[styles.placeholderImage, isWeb && wStyles.tournamentImage]}>
                  <Text allowFontScaling={false} style={styles.placeholderText}>{"\uD83C\uDFB1"}</Text>
                </View>
              )}
            </View>
            {imageUrl && (
              <TouchableOpacity style={styles.viewImageButton} onPress={() => setShowImageViewer(true)}>
                <Text allowFontScaling={false} style={styles.viewImageIcon}>{"\uD83D\uDD0D"}</Text>
                <Text allowFontScaling={false} style={styles.viewImageText}>View Image</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(tournament.id)}
              disabled={isToggling}
              activeOpacity={0.7}
            >
              <Ionicons name={favorited ? "heart" : "heart-outline"} size={scale(44)} color={favorited ? "#E53935" : COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {chipRanges && (
          <View style={styles.chipCard}>
            <Text allowFontScaling={false} style={styles.chipTitle}>RATING / CHIP CHART</Text>
            {chipRanges.map((range: any, index: number) => (
              <Text allowFontScaling={false} key={index} style={styles.chipLine}>
                {range.label || `${range.minRating}–${range.maxRating}`}:{" "}
                <Text allowFontScaling={false} style={styles.chipLineCount}>{range.chips} Chip{range.chips !== 1 ? "s" : ""}</Text>
              </Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83D\uDCC5"} Date & Time</Text>
          <Text allowFontScaling={false} style={styles.sectionText}>{vm.formattedDate}</Text>
          <Text allowFontScaling={false} style={styles.sectionText}>{vm.formattedTime}</Text>
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83D\uDCB0"} Entry & Prizes</Text>
          <View style={styles.feeRow}>
            <Text allowFontScaling={false} style={styles.feeLabel}>Entry Fee:</Text>
            <Text allowFontScaling={false} style={styles.feeValue}>{vm.formattedEntryFee}</Text>
          </View>
          {tournament.added_money > 0 && (
            <View style={styles.feeRow}>
              <Text allowFontScaling={false} style={styles.feeLabel}>Added Money:</Text>
              <Text allowFontScaling={false} style={styles.addedMoney}>${tournament.added_money}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83C\uDFB1"} Details</Text>
          {tournament.table_size && (
            <View style={styles.detailRow}>
              <Text allowFontScaling={false} style={styles.detailLabel}>Table Size:</Text>
              <Text allowFontScaling={false} style={styles.detailValue}>{tournament.table_size}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text allowFontScaling={false} style={styles.detailLabel}>Reports to Fargo:</Text>
            <Text allowFontScaling={false} style={styles.detailValue}>{tournament.reports_to_fargo ? "Yes" : "No"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text allowFontScaling={false} style={styles.detailLabel}>Calcutta:</Text>
            <Text allowFontScaling={false} style={styles.detailValue}>{tournament.calcutta ? "Yes" : "No"}</Text>
          </View>
          {!isChipTournament && (
            <View style={styles.detailRow}>
              <Text allowFontScaling={false} style={styles.detailLabel}>Open Tournament:</Text>
              <Text allowFontScaling={false} style={styles.detailValue}>{tournament.open_tournament ? "Yes" : "No"}</Text>
            </View>
          )}
          {tournament.max_fargo && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text allowFontScaling={false} style={styles.detailLabel}>Max Fargo:</Text>
              <Text allowFontScaling={false} style={styles.detailValue}>{tournament.max_fargo}</Text>
            </View>
          )}
          {tournament.game_spot && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text allowFontScaling={false} style={styles.detailLabel}>Game Spot:</Text>
              <Text allowFontScaling={false} style={styles.detailValue}>{tournament.game_spot}</Text>
            </View>
          )}
          {tournament.race && !isChipTournament && (
            <View style={styles.detailRow}>
              <Text allowFontScaling={false} style={styles.detailLabel}>Race:</Text>
              <Text allowFontScaling={false} style={styles.detailValue}>{tournament.race}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>{"\uD83D\uDCCD"} Location</Text>
          <Text allowFontScaling={false} style={styles.venueName}>{tournament.venues?.venue}</Text>
          <Text allowFontScaling={false} style={styles.venueAddress}>{tournament.venues?.address}</Text>
          <Text allowFontScaling={false} style={styles.venueAddress}>
            {tournament.venues?.city}, {tournament.venues?.state} {tournament.venues?.zip_code}
          </Text>
          <View style={styles.venueActions}>
            <Button title={"\uD83D\uDCCD Open in Maps"} onPress={vm.openMaps} variant="outline" size="sm" />
            {tournament.venues?.phone && (
              <Button title={"\uD83D\uDCDE Call Venue"} onPress={vm.callVenue} variant="outline" size="sm" />
            )}
          </View>
        </View>

        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text allowFontScaling={false} style={styles.shareButtonText}>{"\uD83D\uDCE4"} Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={() => openReportModal("tournament", tournament.id.toString())}>
            <Ionicons name="flag-outline" size={scale(14)} color="#E53935" />
            <Text allowFontScaling={false} style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={vm.goBack}>
            <Text allowFontScaling={false} style={styles.closeButtonText}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        <Text allowFontScaling={false} style={styles.disclaimerText}>
          This tournament is organized by {tournament.venues?.venue || "an independent venue"}. Compete is not the organizer and is not responsible for tournament operations.
        </Text>
        <View style={styles.bottomSpacer} />
      </View>
    </ScrollView>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={wStyles.backdrop} activeOpacity={1} onPress={vm.goBack} />
        <View style={wStyles.dialogWrap}>
          <View style={wStyles.dialog}>
            <View style={wStyles.dialogHeader}>
              <TouchableOpacity onPress={vm.goBack} style={wStyles.backBtn}>
                <Text allowFontScaling={false} style={wStyles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={vm.goBack} style={wStyles.closeBtn}>
                <Text allowFontScaling={false} style={wStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            {content}
          </View>
        </View>
        <FullScreenImageViewer visible={showImageViewer} imageUrl={imageUrl} title={tournament.name} onClose={() => setShowImageViewer(false)} />
        <ReportModal visible={isModalVisible} onClose={closeReportModal} contentType={contentType} reason={reason} onReasonChange={setReason} details={details} onDetailsChange={setDetails} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </>
    );
  }

  return (
    <View style={styles.container}>
      {content}
      <FullScreenImageViewer visible={showImageViewer} imageUrl={imageUrl} title={tournament.name} onClose={() => setShowImageViewer(false)} />
      <ReportModal visible={isModalVisible} onClose={closeReportModal} contentType={contentType} reason={reason} onReasonChange={setReason} details={details} onDetailsChange={setDetails} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flex: 1 },
  header: { padding: scale(SPACING.md), paddingTop: scale(SPACING.xl + SPACING.lg) },
  backButton: { paddingVertical: scale(SPACING.sm) },
  backText: { color: COLORS.primary, fontSize: moderateScale(FONT_SIZES.md) },
  content: { padding: scale(SPACING.md), paddingTop: 0 },
  deletedBanner: { backgroundColor: COLORS.error, padding: scale(SPACING.md), borderRadius: RADIUS.md, marginBottom: scale(SPACING.md) },
  deletedText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", textAlign: "center" },
  hiddenBanner: { backgroundColor: "#E53935", padding: scale(SPACING.md), borderRadius: RADIUS.md, marginBottom: scale(SPACING.md), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: scale(SPACING.xs) },
  hiddenText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },
  hiddenInlineBadge: { backgroundColor: "#E53935", paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  hiddenInlineText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700" },
  topSection: { flexDirection: "row", marginBottom: scale(SPACING.lg), alignItems: "flex-start" },
  leftContent: { flex: 1, marginRight: scale(SPACING.md) },
  imageSection: { alignItems: "center", minWidth: scale(100) },
  imageContainer: { marginBottom: scale(SPACING.sm) },
  tournamentImage: { width: scale(100), height: scale(100), borderRadius: RADIUS.md },
  placeholderImage: { width: scale(100), height: scale(100), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  placeholderText: { fontSize: moderateScale(FONT_SIZES.xl + 8) },
  viewImageButton: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), flexDirection: "row", alignItems: "center", minWidth: scale(100), justifyContent: "center" },
  viewImageIcon: { fontSize: moderateScale(FONT_SIZES.xs), marginRight: scale(SPACING.xs / 2) },
  viewImageText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  favoriteButton: { marginTop: scale(SPACING.md), alignItems: "center", justifyContent: "center", width: "100%" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: scale(SPACING.sm), marginBottom: scale(SPACING.md) },
  idBadge: { backgroundColor: "#000", paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  idText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700" },
  gameTypeBadge: { backgroundColor: COLORS.primary, paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  gameTypeText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", textTransform: "uppercase" },
  formatBadge: { backgroundColor: COLORS.surface, paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  formatText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.xs), textTransform: "capitalize" },
  recurringBadge: { backgroundColor: COLORS.surface, paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  recurringText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.xs) },
  title: { fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  description: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.lg), lineHeight: moderateScale(22) },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: scale(SPACING.md), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.sm) },
  sectionText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  feeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: scale(SPACING.xs) },
  feeLabel: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  feeValue: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  addedMoney: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.success },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: scale(SPACING.xs) },
  detailLabel: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  detailValue: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  venueName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  venueAddress: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  venueActions: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.md) },
  errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: scale(SPACING.lg) },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.md), textAlign: "center" },
  bottomSpacer: { height: scale(SPACING.xl * 2) },
  disclaimerText: { fontSize: moderateScale(11), color: COLORS.textSecondary, textAlign: "center", marginTop: scale(SPACING.lg), marginHorizontal: scale(SPACING.md), lineHeight: moderateScale(16), opacity: 0.6 },
  chipCard: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginBottom: scale(SPACING.md) },
  chipTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, textAlign: "center", letterSpacing: 1, marginBottom: scale(SPACING.sm) },
  chipLine: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, paddingVertical: scale(3), textAlign: "center" },
  chipLineCount: { fontWeight: "800", color: COLORS.primary },
  bottomActions: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.sm) },
  shareButton: { flex: 1, paddingVertical: scale(SPACING.sm + 2), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary + "15", alignItems: "center" },
  shareButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.primary },
  reportButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: scale(4), paddingVertical: scale(SPACING.sm + 2), paddingHorizontal: scale(SPACING.md), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: "#E53935", backgroundColor: "rgba(229, 57, 53, 0.1)" },
  reportButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: "#E53935" },
  closeButton: { flex: 1, paddingVertical: scale(SPACING.sm + 2), borderRadius: RADIUS.sm, backgroundColor: COLORS.error, alignItems: "center" },
  closeButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.white },
});

const wStyles = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 1000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 1001, alignItems: "center", justifyContent: "center", padding: scale(24), pointerEvents: "box-none" as any },
  dialog: { width: 720, maxWidth: "92%" as any, maxHeight: "88vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  dialogHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingVertical: scale(12), paddingTop: scale(16), backgroundColor: COLORS.background },
  backBtn: { paddingVertical: scale(4), paddingHorizontal: scale(8) },
  backBtnText: { color: COLORS.primary, fontSize: moderateScale(FONT_SIZES.sm) },
  closeBtn: { backgroundColor: COLORS.error, width: scale(28), height: scale(28), borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  scrollView: { maxHeight: "calc(88vh - 50px)" as any },
  content: { padding: scale(SPACING.lg) },
  topSection: { flexDirection: "row", gap: scale(SPACING.lg) },
  title: { fontSize: moderateScale(FONT_SIZES.xl) },
  imageSection: { alignItems: "center", minWidth: scale(140) },
  tournamentImage: { width: scale(140), height: scale(140), borderRadius: RADIUS.md },
});
