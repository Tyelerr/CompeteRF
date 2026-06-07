import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Image, Modal, Platform, ScrollView, Share, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { analyticsService } from "../../../models/services/analytics.service";
import { useAuth, useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useFavorites } from "../../../viewmodels/hooks/use.favorites";
import { useReport } from "../../../viewmodels/hooks/useReport";
import { useSelfRegistration } from "../../../viewmodels/hooks/use.self.registration";
import { useTournamentDetail } from "../../../viewmodels/useTournamentDetail";
import { Button } from "../common/button";
import { FullScreenImageViewer } from "../common/FullScreenImageViewer";
import { Loading } from "../common/loading";
import ReportModal from "../common/ReportModal";

interface TournamentDetailModalProps {
  onReport?: (contentType: any, contentId: string) => void;
  id: string | null;
  visible: boolean;
  onClose: () => void;
}

export function TournamentDetailModal({ id, visible, onClose }: TournamentDetailModalProps) {
  const router = useRouter();
  const vm = useTournamentDetail(id ?? "");
  const { session, isAdmin } = useAuth();
  const { isModalVisible, openReportModal, closeReportModal, reason, setReason, details, setDetails, handleSubmit, isSubmitting, contentType } = useReport({ userId: session?.user?.id });
  const [showImageViewer, setShowImageViewer] = useState(false);
  const { profile } = useAuthContext();
  const { isFavorited, toggleFavorite, isToggling } = useFavorites(profile?.id_auto);

  // Self-registration (player registers themselves from this modal).
  const reg = useSelfRegistration(vm.tournament?.id, profile?.id_auto);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);

  // The modal stays mounted (only `visible` toggles), so re-fetch the player's
  // registration each time it opens — otherwise a TD removing the player leaves
  // a stale "✓ Registered" state and blocks re-registering.
  useEffect(() => {
    if (visible) reg.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reg.refresh]);

  const handleClose = useCallback(() => { closeReportModal(); onClose(); }, [closeReportModal, onClose]);

  const handleRegisterPress = () => {
    if (!profile?.id_auto) {
      Alert.alert("Log In Required", "Create a free account or log in to register for tournaments.");
      return;
    }
    setShowRegisterConfirm(true);
  };

  const handleConfirmRegister = async () => {
    try {
      await reg.register();
      setShowRegisterConfirm(false);
      Alert.alert("You're registered", "You're registered for this tournament.");
    } catch {
      Alert.alert("Error", "Couldn't complete registration. Please try again.");
    }
  };

  const getTournamentImageUrl = (tournament: any) => {
    const gameTypeImageMap: Record<string, string> = {
      "8-ball": "8-ball.jpeg", "9-ball": "9-ball.jpeg", "10-ball": "10-ball.jpeg",
      "one-pocket": "One-Pocket.jpeg", "straight-pool": "Straight-Pool.jpeg", banks: "Banks.jpeg",
    };
    if (tournament.thumbnail) {
      if (tournament.thumbnail.startsWith("custom:")) return tournament.thumbnail.replace("custom:", "");
      const imageFile = gameTypeImageMap[tournament.thumbnail];
      if (imageFile) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    }
    const imageFile = gameTypeImageMap[tournament.game_type];
    if (imageFile) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${imageFile}`;
    const partialMatch = Object.keys(gameTypeImageMap).find((key) => tournament.game_type?.toLowerCase().includes(key));
    if (partialMatch) return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${gameTypeImageMap[partialMatch]}`;
    return null;
  };

  const getDirectorName = (profiles: any): string => {
    if (!profiles) return "Unknown";
    const full = [profiles.first_name || "", profiles.last_name || ""].filter(Boolean).join(" ");
    if (full.trim()) return full;
    if (profiles.user_name) return `@${profiles.user_name}`;
    return "Unknown";
  };

  const getDirectorId = (profiles: any): string | null => {
    if (!profiles?.id_auto) return null;
    return `TD-${String(profiles.id_auto).padStart(6, "0")}`;
  };

  const handleShare = async () => {
    if (!vm.tournament) return;
    try {
      const deepLink = `competerf:///tournament-detail?id=${vm.tournament.id}`;
      const message = `🎱 ${vm.tournament.name}\n📅 ${vm.formattedDate} • ${vm.formattedTime}\n💰 ${vm.formattedEntryFee}\n\n${deepLink}`;
      await Share.share({ message });
      analyticsService.trackTournamentShared(vm.tournament.id);
    } catch (error) { console.error("Share error:", error); }
  };

  const tournament: any = vm.tournament;
  const imageUrl = tournament ? getTournamentImageUrl(tournament) : null;
  const isChipTournament = tournament?.tournament_format === "chip-tournament";
  const chipRanges = isChipTournament && Array.isArray(tournament?.chip_ranges) && tournament.chip_ranges.length > 0 ? tournament.chip_ranges : null;
  const director = tournament?.profiles ?? null;
  const directorName = getDirectorName(director);
  const directorId = getDirectorId(director);
  // Registration is open through Compete (players self-register as preregistered).
  const canRegister = tournament?.live_state === "registration_open";
  // Once a tournament has started (or finished), anyone can open the read-only
  // spectator view (bracket / matches / players).
  const hasStarted =
    tournament?.live_state === "in_progress" ||
    tournament?.live_state === "finished" ||
    tournament?.status === "completed";

  const handleViewTournament = () => {
    if (!tournament) return;
    handleClose();
    router.push(`/live-tournament/${tournament.id}` as any);
  };

  const innerContent = (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text allowFontScaling={false} style={s.headerTitle}>Tournament Details</Text>
        <TouchableOpacity onPress={handleClose} style={s.closeButton}>
          <Text allowFontScaling={false} style={s.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      {vm.loading && <View style={s.loadingWrap}><Loading message="Loading tournament..." /></View>}
      {!vm.loading && (vm.error || !tournament) && (
        <View style={s.loadingWrap}>
          <Text allowFontScaling={false} style={s.errorText}>{vm.error || "Tournament not found"}</Text>
        </View>
      )}

      {!vm.loading && tournament && (
        <>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {vm.isDeleted && (
              <View style={s.deletedBanner}>
                <Text allowFontScaling={false} style={s.deletedText}>This tournament has been deleted</Text>
              </View>
            )}
            {vm.isHidden && isAdmin && (
              <View style={s.hiddenBanner}>
                <Ionicons name="eye-off" size={16} color="#fff" />
                <Text allowFontScaling={false} style={s.hiddenText}>HIDDEN — hidden by an admin</Text>
              </View>
            )}

            <View style={s.topSection}>
              <View style={s.leftContent}>
                <View style={s.badges}>
                  <View style={s.idBadge}><Text allowFontScaling={false} style={s.idText}>ID: {tournament.id}</Text></View>
                  <View style={s.gameTypeBadge}><Text allowFontScaling={false} style={s.gameTypeText}>{tournament.game_type}</Text></View>
                  <View style={s.formatBadge}><Text allowFontScaling={false} style={s.formatText}>{tournament.tournament_format.replace("_", " ")}</Text></View>
                  {tournament.is_recurring && <View style={s.recurringBadge}><Text allowFontScaling={false} style={s.recurringText}>Weekly</Text></View>}
                </View>
                <Text allowFontScaling={false} style={s.title}>{tournament.name}</Text>
                {tournament.description && <Text allowFontScaling={false} style={s.description}>{tournament.description}</Text>}
              </View>
              <View style={s.imageSection}>
                <View style={s.imageContainer}>
                  {imageUrl ? <Image source={{ uri: imageUrl }} style={s.tournamentImage} resizeMode="cover" /> : (
                    <View style={s.placeholderImage}>
                      <Text allowFontScaling={false} style={s.placeholderText}>🎱</Text>
                    </View>
                  )}
                </View>
                {imageUrl && (
                  <TouchableOpacity style={s.viewImageButton} onPress={() => setShowImageViewer(true)}>
                    <Text allowFontScaling={false} style={s.viewImageText}>View</Text>
                  </TouchableOpacity>
                )}
                {profile?.id_auto && tournament && (
                  <TouchableOpacity style={s.favoriteButton} onPress={() => toggleFavorite(tournament.id)} disabled={isToggling} activeOpacity={0.7}>
                    <Ionicons name={isFavorited(tournament.id) ? "heart" : "heart-outline"} size={44} color={isFavorited(tournament.id) ? "#E53935" : COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {chipRanges && (
              <View style={s.chipCard}>
                <Text allowFontScaling={false} style={s.chipTitle}>RATING / CHIP CHART</Text>
                {chipRanges.map((range: any, index: number) => (
                  <Text allowFontScaling={false} key={index} style={s.chipLine}>
                    {range.label || `${range.minRating}-${range.maxRating}`}:{" "}
                    <Text style={s.chipLineCount}>{range.chips} Chip{range.chips !== 1 ? "s" : ""}</Text>
                  </Text>
                ))}
              </View>
            )}

            <View style={s.section}>
              <Text allowFontScaling={false} style={s.sectionTitle}>Date & Time</Text>
              <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedDate}</Text>
              <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedTime}</Text>
            </View>

            <View style={s.section}>
              <Text allowFontScaling={false} style={s.sectionTitle}>Entry & Prizes</Text>
              <View style={s.row}>
                <Text allowFontScaling={false} style={s.label}>Entry Fee:</Text>
                <Text allowFontScaling={false} style={s.val}>{vm.formattedEntryFee}</Text>
              </View>
              {tournament.added_money > 0 && (
                <View style={s.row}>
                  <Text allowFontScaling={false} style={s.label}>Added Money:</Text>
                  <Text allowFontScaling={false} style={[s.val, { color: COLORS.success }]}>${tournament.added_money}</Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <Text allowFontScaling={false} style={s.sectionTitle}>Details</Text>
              {tournament.table_size && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Table Size:</Text><Text allowFontScaling={false} style={s.val}>{tournament.table_size}</Text></View>}
              <View style={s.row}><Text allowFontScaling={false} style={s.label}>Reports to Fargo:</Text><Text allowFontScaling={false} style={s.val}>{tournament.reports_to_fargo ? "Yes" : "No"}</Text></View>
              <View style={s.row}><Text allowFontScaling={false} style={s.label}>Calcutta:</Text><Text allowFontScaling={false} style={s.val}>{tournament.calcutta ? "Yes" : "No"}</Text></View>
              {!isChipTournament && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Open Tournament:</Text><Text allowFontScaling={false} style={s.val}>{tournament.open_tournament ? "Yes" : "No"}</Text></View>}
              {tournament.max_fargo && !isChipTournament && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Max Fargo:</Text><Text allowFontScaling={false} style={s.val}>{tournament.max_fargo}</Text></View>}
              {tournament.game_spot && !isChipTournament && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Game Spot:</Text><Text allowFontScaling={false} style={s.val}>{tournament.game_spot}</Text></View>}
              {tournament.race && !isChipTournament && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Race:</Text><Text allowFontScaling={false} style={s.val}>{tournament.race}</Text></View>}
            </View>

            <View style={s.section}>
              <Text allowFontScaling={false} style={s.sectionTitle}>Tournament Director</Text>
              <View style={s.row}><Text allowFontScaling={false} style={s.label}>Name:</Text><Text allowFontScaling={false} style={s.val}>{directorName}</Text></View>
              {directorId && (
                <View style={s.row}>
                  <Text allowFontScaling={false} style={s.label}>Director ID:</Text>
                  <View style={s.directorIdBadge}><Text allowFontScaling={false} style={s.directorIdText}>{directorId}</Text></View>
                </View>
              )}
            </View>

            <View style={s.section}>
              <Text allowFontScaling={false} style={s.sectionTitle}>Location</Text>
              <Text allowFontScaling={false} style={s.venueName}>{tournament.venues?.venue}</Text>
              <Text allowFontScaling={false} style={s.venueAddress}>{tournament.venues?.address}</Text>
              <Text allowFontScaling={false} style={s.venueAddress}>{tournament.venues?.city}, {tournament.venues?.state} {tournament.venues?.zip_code}</Text>
              <View style={s.venueActions}>
                <Button title="Open in Maps" onPress={vm.openMaps} variant="outline" size="sm" />
                {tournament.venues?.phone && <Button title="Call Venue" onPress={vm.callVenue} variant="outline" size="sm" />}
              </View>
            </View>

            <Text allowFontScaling={false} style={s.disclaimerText}>
              This tournament is organized by {tournament.venues?.venue || "an independent venue"}. Compete is not the organizer and is not responsible for tournament operations.
            </Text>
          </ScrollView>

          {hasStarted && (
            <View style={s.registerContainer}>
              <TouchableOpacity style={s.viewTournamentButton} onPress={handleViewTournament}>
                <Ionicons name="eye-outline" size={18} color="#fff" />
                <Text allowFontScaling={false} style={s.viewTournamentText}>View Tournament</Text>
              </TouchableOpacity>
            </View>
          )}

          {canRegister && (
            <View style={s.registerContainer}>
              {reg.isRegistered ? (
                <View style={s.registeredPill}>
                  <Text allowFontScaling={false} style={s.registeredPillText}>✓ Registered</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.registerButton} onPress={handleRegisterPress} disabled={reg.loading}>
                  <Text allowFontScaling={false} style={s.registerButtonText}>Register for Tournament</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={s.bottomBar}>
            <TouchableOpacity style={s.shareButton} onPress={handleShare}>
              <Text allowFontScaling={false} style={s.shareButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reportButton} onPress={() => openReportModal("tournament", tournament.id.toString())}>
              <Ionicons name="flag-outline" size={14} color="#E53935" />
              <Text allowFontScaling={false} style={s.reportButtonText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Text allowFontScaling={false} style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

          {showRegisterConfirm && (
            <View style={s.confirmOverlay}>
              <TouchableOpacity
                style={s.confirmBackdrop}
                activeOpacity={1}
                onPress={() => !reg.registering && setShowRegisterConfirm(false)}
              />
              <View style={s.confirmCard}>
                <Text allowFontScaling={false} style={s.confirmTitle}>Register for Tournament?</Text>
                <Text allowFontScaling={false} style={s.confirmBody}>You are registering for:</Text>
                <Text allowFontScaling={false} style={s.confirmName}>{tournament.name}</Text>
                <Text allowFontScaling={false} style={s.confirmBody}>
                  Your account will be added to the tournament registration list.
                </Text>
                <View style={s.confirmButtons}>
                  <TouchableOpacity
                    style={s.confirmCancel}
                    onPress={() => setShowRegisterConfirm(false)}
                    disabled={reg.registering}
                  >
                    <Text allowFontScaling={false} style={s.confirmCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.confirmConfirm}
                    onPress={handleConfirmRegister}
                    disabled={reg.registering}
                  >
                    <Text allowFontScaling={false} style={s.confirmConfirmText}>
                      {reg.registering ? "Registering..." : "Register"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </>
  );

  if (Platform.OS === "web") return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <TouchableOpacity style={s.mobileBackdrop} activeOpacity={1} onPress={handleClose} />
      <View style={s.mobileCardWrapper} pointerEvents="box-none">
        <View style={s.mobileCard}>{innerContent}</View>
      </View>
      <FullScreenImageViewer visible={showImageViewer} imageUrl={imageUrl} title={tournament?.name} onClose={() => setShowImageViewer(false)} />
      <ReportModal asOverlay visible={isModalVisible} onClose={closeReportModal} contentType={contentType} reason={reason} onReasonChange={setReason} details={details} onDetailsChange={setDetails} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Modal>
  );
}

const s = StyleSheet.create({
  mobileBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  mobileCardWrapper: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(20) },
  mobileCard: { width: "100%", maxWidth: 480, height: "82%" as any, backgroundColor: COLORS.background, borderRadius: scale(20), borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.md), paddingBottom: scale(SPACING.sm) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: moderateScale(20), fontWeight: "700" },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.border },
  scroll: { flex: 1 },
  scrollContent: { padding: scale(SPACING.md), paddingBottom: scale(SPACING.lg) },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.md), textAlign: "center" },
  deletedBanner: { backgroundColor: COLORS.error, padding: scale(SPACING.md), borderRadius: RADIUS.md, marginBottom: scale(SPACING.md) },
  deletedText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", textAlign: "center" },
  hiddenBanner: { backgroundColor: "#E53935", padding: scale(SPACING.md), borderRadius: RADIUS.md, marginBottom: scale(SPACING.md), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: scale(SPACING.xs) },
  hiddenText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  topSection: { flexDirection: "row", marginBottom: scale(SPACING.md), alignItems: "flex-start" },
  leftContent: { flex: 1, marginRight: scale(SPACING.sm) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: scale(SPACING.xs), marginBottom: scale(SPACING.sm) },
  idBadge: { backgroundColor: "#000", paddingVertical: 2, paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  idText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700" },
  gameTypeBadge: { backgroundColor: COLORS.primary, paddingVertical: 2, paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  gameTypeText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", textTransform: "uppercase" },
  formatBadge: { backgroundColor: COLORS.surface, paddingVertical: 2, paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  formatText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.xs), textTransform: "capitalize" },
  recurringBadge: { backgroundColor: COLORS.surface, paddingVertical: 2, paddingHorizontal: scale(SPACING.sm), borderRadius: RADIUS.sm },
  recurringText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.xs) },
  title: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  description: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(20) },
  imageSection: { alignItems: "center" },
  imageContainer: { marginBottom: scale(SPACING.xs) },
  tournamentImage: { width: scale(80), height: scale(80), borderRadius: RADIUS.md },
  placeholderImage: { width: scale(80), height: scale(80), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  placeholderText: { fontSize: moderateScale(32) },
  viewImageButton: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary, borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 3, paddingHorizontal: scale(SPACING.sm), alignItems: "center" },
  viewImageText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  favoriteButton: { marginTop: scale(SPACING.md), alignItems: "center", justifyContent: "center", width: "100%" as any },
  section: { backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(14), marginBottom: scale(10), borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.sm) },
  sectionText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: scale(SPACING.xs) },
  label: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  val: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500" },
  directorIdBadge: { backgroundColor: COLORS.primary + "20", borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 2, paddingHorizontal: scale(SPACING.sm) },
  directorIdText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "700" },
  venueName: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  venueAddress: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  venueActions: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.sm) },
  chipCard: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginBottom: scale(10), alignItems: "center" },
  chipTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, textAlign: "center", letterSpacing: 1, marginBottom: scale(SPACING.sm) },
  chipLine: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, paddingVertical: 2, textAlign: "center" },
  chipLineCount: { fontWeight: "800", color: COLORS.primary },
  disclaimerText: { fontSize: moderateScale(11), color: COLORS.textSecondary, textAlign: "center", marginTop: scale(SPACING.md), lineHeight: moderateScale(16), opacity: 0.6 },
  registerContainer: { paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.md) },
  viewTournamentButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: scale(SPACING.xs), backgroundColor: COLORS.primary, borderRadius: scale(12), paddingVertical: scale(SPACING.md) },
  viewTournamentText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  registerButton: { backgroundColor: COLORS.primary, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center" },
  registerButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  registeredPill: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: scale(SPACING.xs), backgroundColor: COLORS.success + "20", borderColor: COLORS.success, borderWidth: 1, borderRadius: scale(12), paddingVertical: scale(SPACING.md) },
  registeredPillText: { color: COLORS.success, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  confirmOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", padding: scale(SPACING.lg) },
  confirmBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  confirmCard: { width: "100%", backgroundColor: COLORS.surface, borderRadius: scale(16), borderWidth: 1, borderColor: COLORS.border, padding: scale(SPACING.lg) },
  confirmTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  confirmBody: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(20) },
  confirmName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginVertical: scale(SPACING.sm), textAlign: "center" },
  confirmButtons: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.lg) },
  confirmCancel: { flex: 1, paddingVertical: scale(SPACING.md), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  confirmCancelText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  confirmConfirm: { flex: 1, paddingVertical: scale(SPACING.md), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.primary },
  confirmConfirmText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  bottomBar: { flexDirection: "row", padding: scale(SPACING.md), gap: scale(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: Platform.OS === "ios" ? 20 : scale(SPACING.md) },
  shareButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center", borderWidth: 1, borderColor: COLORS.primary },
  shareButtonText: { color: COLORS.primary, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  reportButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.md), borderRadius: scale(12), borderWidth: 1, borderColor: "#E53935", backgroundColor: "rgba(229, 57, 53, 0.1)" },
  reportButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: "#E53935" },
  closeBtn: { flex: 1, backgroundColor: COLORS.error, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center" },
  closeBtnText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
});
