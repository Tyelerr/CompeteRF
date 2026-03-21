import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { analyticsService } from "../../../models/services/analytics.service";
import { useAuth } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useReport } from "../../../viewmodels/hooks/useReport";
import { useTournamentDetail } from "../../../viewmodels/useTournamentDetail";
import { Button } from "../common/button";
import { FullScreenImageViewer } from "../common/FullScreenImageViewer";
import { Loading } from "../common/loading";
import ReportModal from "../common/ReportModal";

interface TournamentDetailModalProps {
  id: string | null;
  visible: boolean;
  onClose: () => void;
}

export function TournamentDetailModal({
  id,
  visible,
  onClose,
}: TournamentDetailModalProps) {
  const vm = useTournamentDetail(id ?? "");
  const { session, isAdmin } = useAuth();
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

  // Always reset report state before closing so the overlay never persists
  const handleClose = useCallback(() => {
    closeReportModal();
    onClose();
  }, [closeReportModal, onClose]);

  // ── Image URL ──────────────────────────────────────────────────────────────
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
      tournament.game_type?.toLowerCase().includes(key)
    );
    if (partialMatch)
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${gameTypeImageMap[partialMatch]}`;
    return null;
  };

  // ── Director helpers ───────────────────────────────────────────────────────
  const getDirectorName = (profiles: any): string => {
    if (!profiles) return "Unknown";
    const first = profiles.first_name || "";
    const last = profiles.last_name || "";
    const full = [first, last].filter(Boolean).join(" ");
    if (full.trim()) return full;
    if (profiles.user_name) return `@${profiles.user_name}`;
    return "Unknown";
  };

  const getDirectorId = (profiles: any): string | null => {
    if (!profiles?.id_auto) return null;
    return `TD-${String(profiles.id_auto).padStart(6, "0")}`;
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!vm.tournament) return;
    try {
      const chipInfo = chipRanges
        ? "\n\nChip Chart:\n" +
          chipRanges
            .map(
              (r: any) =>
                `${r.label || `${r.minRating}-${r.maxRating}`}: ${r.chips} Chip${r.chips !== 1 ? "s" : ""}`
            )
            .join("\n")
        : "";
      const message =
        `${vm.tournament.name}\n\n` +
        `${vm.formattedDate} at ${vm.formattedTime}\n` +
        `${vm.tournament.venues?.venue || "TBD"}\n` +
        `Entry: ${vm.formattedEntryFee}` +
        chipInfo +
        `\n\n${vm.tournament.venues?.address || ""}, ${vm.tournament.venues?.city || ""}, ${vm.tournament.venues?.state || ""} ${vm.tournament.venues?.zip_code || ""}`;
      await Share.share({ message });
      analyticsService.trackTournamentShared(vm.tournament.id);
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const tournament: any = vm.tournament;
  const imageUrl = tournament ? getTournamentImageUrl(tournament) : null;
  const isChipTournament = tournament?.tournament_format === "chip-tournament";
  const chipRanges =
    isChipTournament &&
    Array.isArray(tournament?.chip_ranges) &&
    tournament.chip_ranges.length > 0
      ? tournament.chip_ranges
      : null;

  const director = tournament?.profiles ?? null;
  const directorName = getDirectorName(director);
  const directorId = getDirectorId(director);

  // ── Inner content ──────────────────────────────────────────────────────────
  const innerContent = (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.headerTitle}>Tournament Details</Text>
        <TouchableOpacity onPress={handleClose} style={s.closeButton}>
          <Text style={s.closeButtonText}>{"\u2715"}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      {vm.loading && (
        <View style={s.loadingWrap}>
          <Loading message="Loading tournament..." />
        </View>
      )}

      {!vm.loading && (vm.error || !tournament) && (
        <View style={s.loadingWrap}>
          <Text style={s.errorText}>{vm.error || "Tournament not found"}</Text>
        </View>
      )}

      {!vm.loading && tournament && (
        <>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {vm.isDeleted && (
              <View style={s.deletedBanner}>
                <Text style={s.deletedText}>This tournament has been deleted</Text>
              </View>
            )}
            {vm.isHidden && isAdmin && (
              <View style={s.hiddenBanner}>
                <Ionicons name="eye-off" size={16} color="#fff" />
                <Text style={s.hiddenText}>HIDDEN — hidden by an admin</Text>
              </View>
            )}

            <View style={s.topSection}>
              <View style={s.leftContent}>
                <View style={s.badges}>
                  <View style={s.idBadge}>
                    <Text style={s.idText}>ID: {tournament.id}</Text>
                  </View>
                  <View style={s.gameTypeBadge}>
                    <Text style={s.gameTypeText}>{tournament.game_type}</Text>
                  </View>
                  <View style={s.formatBadge}>
                    <Text style={s.formatText}>
                      {tournament.tournament_format.replace("_", " ")}
                    </Text>
                  </View>
                  {tournament.is_recurring && (
                    <View style={s.recurringBadge}>
                      <Text style={s.recurringText}>Weekly</Text>
                    </View>
                  )}
                </View>
                <Text style={s.title}>{tournament.name}</Text>
                {tournament.description && (
                  <Text style={s.description}>{tournament.description}</Text>
                )}
              </View>

              <View style={s.imageSection}>
                <View style={s.imageContainer}>
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={s.tournamentImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={s.placeholderImage}>
                      <Text style={s.placeholderText}>{"\uD83C\uDFB1"}</Text>
                    </View>
                  )}
                </View>
                {imageUrl && (
                  <TouchableOpacity
                    style={s.viewImageButton}
                    onPress={() => setShowImageViewer(true)}
                  >
                    <Text style={s.viewImageText}>View</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {chipRanges && (
              <View style={s.chipCard}>
                <Text style={s.chipTitle}>RATING / CHIP CHART</Text>
                {chipRanges.map((range: any, index: number) => (
                  <Text key={index} style={s.chipLine}>
                    {range.label || `${range.minRating}-${range.maxRating}`}:{" "}
                    <Text style={s.chipLineCount}>
                      {range.chips} Chip{range.chips !== 1 ? "s" : ""}
                    </Text>
                  </Text>
                ))}
              </View>
            )}

            <View style={s.section}>
              <Text style={s.sectionTitle}>Date & Time</Text>
              <Text style={s.sectionText}>{vm.formattedDate}</Text>
              <Text style={s.sectionText}>{vm.formattedTime}</Text>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Entry & Prizes</Text>
              <View style={s.row}>
                <Text style={s.label}>Entry Fee:</Text>
                <Text style={s.val}>{vm.formattedEntryFee}</Text>
              </View>
              {tournament.added_money > 0 && (
                <View style={s.row}>
                  <Text style={s.label}>Added Money:</Text>
                  <Text style={[s.val, { color: COLORS.success }]}>
                    ${tournament.added_money}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Details</Text>
              {tournament.table_size && (
                <View style={s.row}>
                  <Text style={s.label}>Table Size:</Text>
                  <Text style={s.val}>{tournament.table_size}</Text>
                </View>
              )}
              <View style={s.row}>
                <Text style={s.label}>Reports to Fargo:</Text>
                <Text style={s.val}>{tournament.reports_to_fargo ? "Yes" : "No"}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Calcutta:</Text>
                <Text style={s.val}>{tournament.calcutta ? "Yes" : "No"}</Text>
              </View>
              {!isChipTournament && (
                <View style={s.row}>
                  <Text style={s.label}>Open Tournament:</Text>
                  <Text style={s.val}>{tournament.open_tournament ? "Yes" : "No"}</Text>
                </View>
              )}
              {tournament.max_fargo && !isChipTournament && (
                <View style={s.row}>
                  <Text style={s.label}>Max Fargo:</Text>
                  <Text style={s.val}>{tournament.max_fargo}</Text>
                </View>
              )}
              {tournament.game_spot && !isChipTournament && (
                <View style={s.row}>
                  <Text style={s.label}>Game Spot:</Text>
                  <Text style={s.val}>{tournament.game_spot}</Text>
                </View>
              )}
              {tournament.race && !isChipTournament && (
                <View style={s.row}>
                  <Text style={s.label}>Race:</Text>
                  <Text style={s.val}>{tournament.race}</Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Tournament Director</Text>
              <View style={s.row}>
                <Text style={s.label}>Name:</Text>
                <Text style={s.val}>{directorName}</Text>
              </View>
              {directorId && (
                <View style={s.row}>
                  <Text style={s.label}>Director ID:</Text>
                  <View style={s.directorIdBadge}>
                    <Text style={s.directorIdText}>{directorId}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Location</Text>
              <Text style={s.venueName}>{tournament.venues?.venue}</Text>
              <Text style={s.venueAddress}>{tournament.venues?.address}</Text>
              <Text style={s.venueAddress}>
                {tournament.venues?.city}, {tournament.venues?.state}{" "}
                {tournament.venues?.zip_code}
              </Text>
              <View style={s.venueActions}>
                <Button
                  title="Open in Maps"
                  onPress={vm.openMaps}
                  variant="outline"
                  size="sm"
                />
                {tournament.venues?.phone && (
                  <Button
                    title="Call Venue"
                    onPress={vm.callVenue}
                    variant="outline"
                    size="sm"
                  />
                )}
              </View>
            </View>

            <Text style={s.disclaimerText}>
              This tournament is organized by{" "}
              {tournament.venues?.venue || "an independent venue"}. Compete is
              not the organizer and is not responsible for tournament operations.
            </Text>
          </ScrollView>

          <View style={s.bottomBar}>
            <TouchableOpacity style={s.shareButton} onPress={handleShare}>
              <Text style={s.shareButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.reportButton}
              onPress={() =>
                openReportModal("tournament", tournament.id.toString())
              }
            >
              <Ionicons name="flag-outline" size={14} color="#E53935" />
              <Text style={s.reportButtonText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </>
  );

  if (Platform.OS === "web") return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={s.mobileBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Card */}
      <View style={s.mobileCardWrapper} pointerEvents="box-none">
        <View style={s.mobileCard}>{innerContent}</View>
      </View>

      {/* Full-screen image viewer — inside Modal so it layers correctly */}
      <FullScreenImageViewer
        visible={showImageViewer}
        imageUrl={imageUrl}
        title={tournament?.name}
        onClose={() => setShowImageViewer(false)}
      />

      {/* ReportModal — MUST be inside the parent Modal so it renders
          above the native modal layer, not behind it */}
      <ReportModal asOverlay
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
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  mobileBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  mobileCardWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  mobileCard: {
    width: "100%",
    maxWidth: 480,
    height: "82%" as any,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
  },
  divider: { height: 1, backgroundColor: COLORS.border },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.md,
    textAlign: "center",
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
  },
  topSection: {
    flexDirection: "row",
    marginBottom: SPACING.md,
    alignItems: "flex-start",
  },
  leftContent: { flex: 1, marginRight: SPACING.sm },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  idBadge: {
    backgroundColor: "#000",
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  idText: { color: COLORS.white, fontSize: FONT_SIZES.xs, fontWeight: "700" },
  gameTypeBadge: {
    backgroundColor: COLORS.primary,
    paddingVertical: 2,
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
    paddingVertical: 2,
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
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  recurringText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  imageSection: { alignItems: "center" },
  imageContainer: { marginBottom: SPACING.xs },
  tournamentImage: { width: 80, height: 80, borderRadius: RADIUS.md },
  placeholderImage: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeholderText: { fontSize: 32 },
  viewImageButton: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    alignItems: "center",
  },
  viewImageText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  sectionText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  label: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  val: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: "500" },
  directorIdBadge: {
    backgroundColor: COLORS.primary + "20",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
  },
  directorIdText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "700",
  },
  venueName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  venueAddress: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  venueActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chipCard: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: 10,
    alignItems: "center",
  },
  chipTitle: {
    fontSize: FONT_SIZES.sm,
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
    paddingVertical: 2,
    textAlign: "center",
  },
  chipLineCount: { fontWeight: "800", color: COLORS.primary },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.md,
    lineHeight: 16,
    opacity: 0.6,
  },
  bottomBar: {
    flexDirection: "row",
    padding: SPACING.md,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === "ios" ? 20 : SPACING.md,
  },
  shareButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  shareButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E53935",
    backgroundColor: "rgba(229, 57, 53, 0.1)",
  },
  reportButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: "#E53935",
  },
  closeBtn: {
    flex: 1,
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  closeBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
  },
});


