import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth, useAuthContext } from "../../../providers/AuthProvider";
import { useFavorites } from "../../../viewmodels/hooks/use.favorites";
import { COLORS } from "../../../theme/colors";
import { RADIUS } from "../../../theme/spacing";
import { useReport } from "../../../viewmodels/hooks/useReport";
import { useSelfRegistration } from "../../../viewmodels/hooks/use.self.registration";
import { usePendingTeamInvite } from "../../../viewmodels/hooks/use.team.invite";
import { useTournamentDetail } from "../../../viewmodels/useTournamentDetail";
import { describeRace } from "../../../utils/bracket.utils";
import { Button } from "../../components/common/button";
import { FullScreenImageViewer } from "../../components/common/FullScreenImageViewer";
import ReportModal from "../../components/common/ReportModal";
import { TeamRegisterModal } from "../../components/tournament/TeamRegisterModal";
import { TeamInviteModal } from "../../components/tournament/TeamInviteModal";

// Web-only component - no scaling needed
const moderateScale = (v: number) => v;
const scale = (v: number) => v;

interface Props { id: string; onClose: () => void; }

const getImageUrl = (t: any): string | null => {
  const map: Record<string, string> = { "8-ball": "8-ball.jpeg", "9-ball": "9-ball.jpeg", "10-ball": "10-ball.jpeg", "one-pocket": "One-Pocket.jpeg", "straight-pool": "Straight-Pool.jpeg", banks: "Banks.jpeg" };
  const base = "https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/";
  if (t.thumbnail?.startsWith("custom:")) return t.thumbnail.replace("custom:", "");
  if (t.thumbnail && map[t.thumbnail]) return base + map[t.thumbnail];
  if (map[t.game_type]) return base + map[t.game_type];
  const partial = Object.keys(map).find((k) => t.game_type?.toLowerCase().includes(k));
  return partial ? base + map[partial] : null;
};

export function WebTournamentDetailOverlay({ id, onClose }: Props) {
  const router = useRouter();
  const vm = useTournamentDetail(id);
  const { session } = useAuth() as any;
  const { profile } = useAuthContext();
  const { isFavorited, toggleFavorite, isToggling } = useFavorites(profile?.id_auto);
  const [showImg, setShowImg] = useState(false);
  const report = useReport({ userId: session?.user?.id });

  // Self-registration — reuses the SAME shared hooks/state/handlers the mobile modal
  // (TournamentDetailModal) uses. No registration logic, validation, or handlers are
  // duplicated: this only calls reg.register / reg.unregister from useSelfRegistration.
  const reg = useSelfRegistration(vm.tournament?.id, profile?.id_auto);
  const teamInvite = usePendingTeamInvite(vm.tournament?.id, profile?.id_auto);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [showUnregisterConfirm, setShowUnregisterConfirm] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showTeamInvite, setShowTeamInvite] = useState(false);
  const [regFargo, setRegFargo] = useState("");
  const [fargoMode, setFargoMode] = useState<"enter" | "none">("enter");

  // Re-sync registration/invite state when the overlay opens for a tournament.
  useEffect(() => {
    reg.refresh();
    teamInvite.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.tournament?.id]);

  const handleRegisterPress = () => {
    if (!profile?.id_auto) {
      Alert.alert("Log In Required", "Create a free account or log in to register for tournaments.");
      return;
    }
    setShowRegisterConfirm(true);
  };
  const handleConfirmRegister = async () => {
    const digits = regFargo.replace(/\D/g, "");
    const fargo = fargoMode === "none" || digits === "" ? null : parseInt(digits, 10);
    try {
      await reg.register(fargo);
      setShowRegisterConfirm(false);
      setRegFargo("");
    } catch {
      Alert.alert("Error", "Couldn't complete registration. Please try again.");
    }
  };
  const handleConfirmUnregister = async () => {
    try {
      await reg.unregister();
      await reg.refresh();
      setShowUnregisterConfirm(false);
    } catch {
      Alert.alert("Error", "Couldn't unregister. Please try again.");
    }
  };

  if (vm.loading) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap}>
          <View style={s.dialog}>
            <View style={s.header}>
              <TouchableOpacity onPress={onClose} style={s.backBtn}><Text allowFontScaling={false} style={s.backBtnText}>{"\u2190"} Back</Text></TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={s.closeBtn}><Text allowFontScaling={false} style={s.closeBtnText}>{"\u2715"}</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text allowFontScaling={false} style={{ color: COLORS.textSecondary }}>Loading...</Text>
            </View>
          </View>
        </View>
      </>
    );
  }

  if (!vm.tournament) return null;
  const t: any = vm.tournament;
  const imageUrl = getImageUrl(t);
  // External tournaments link out to their bracket; Compete tournaments open the
  // read-only spectator view once they've started.
  const isExternal = t.bracket_source === "external";
  const hasStarted =
    t.live_state === "in_progress" ||
    t.live_state === "finished" ||
    t.status === "completed";
  const viewTournament = () => {
    onClose();
    // Format-aware: chip tournaments open their dedicated read-only live view.
    router.push(
      (t.tournament_format === "chip-tournament"
        ? `/chip-live/${t.id}`
        : `/live-tournament/${t.id}`) as any,
    );
  };
  const openExternalBracket = () => {
    if (typeof window !== "undefined") window.open(t.external_bracket_url, "_blank");
  };
  const isChip = t.tournament_format === "chip-tournament";
  // Authoritative race display from live_settings (not the stale `race` column).
  const raceDisplay = !isChip
    ? describeRace((t as any).live_settings, t.tournament_format ?? "")
    : null;
  const chipRanges = isChip && Array.isArray(t.chip_ranges) && t.chip_ranges.length > 0 ? t.chip_ranges : null;
  // Which registration buttons appear — mirrors the mobile modal's logic exactly.
  const canRegister = t.live_state === "registration_open";
  const isTeamFormat = String(t.game_type ?? "").includes("scotch-doubles");
  const playerName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    (profile as any)?.name ||
    (profile?.user_name ? `@${profile.user_name}` : "Player");

  return (
    <>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.dialogWrap}>
        <View style={s.dialog}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.backBtn}><Text allowFontScaling={false} style={s.backBtnText}>{"\u2190"} Back</Text></TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}><Text allowFontScaling={false} style={s.closeBtnText}>{"\u2715"}</Text></TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <View style={s.content}>
              <View style={s.topRow}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <View style={s.badges}>
                    <View style={s.idBadge}><Text allowFontScaling={false} style={s.idText}>ID: {t.id}</Text></View>
                    <View style={s.gameBadge}><Text allowFontScaling={false} style={s.gameText}>{t.game_type?.toUpperCase()}</Text></View>
                    <View style={s.fmtBadge}><Text allowFontScaling={false} style={s.fmtText}>{t.tournament_format?.replace("_", " ")}</Text></View>
                    {t.is_recurring && <View style={s.fmtBadge}><Text allowFontScaling={false} style={s.fmtText}>{"\uD83D\uDD04"} Weekly</Text></View>}
                  </View>
                  <Text allowFontScaling={false} style={s.title}>{t.name}</Text>
                  {t.description && <Text allowFontScaling={false} style={s.desc}>{t.description}</Text>}
                </View>
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  {profile?.id_auto && (
                    <TouchableOpacity onPress={() => toggleFavorite(t.id)} disabled={isToggling} style={{ padding: 8, justifyContent: "center", marginRight: 4 }}>
                      <Ionicons name={isFavorited(t.id) ? "heart" : "heart-outline"} size={48} color={isFavorited(t.id) ? "#E53935" : COLORS.textSecondary} />
                    </TouchableOpacity>
                  )}
                  <View style={{ alignItems: "center" }}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={s.img} resizeMode="cover" />
                    ) : (
                      <View style={s.imgPlaceholder}><Text allowFontScaling={false} style={{ fontSize: 32 }}>{"\uD83C\uDFB1"}</Text></View>
                    )}
                    {imageUrl && (
                      <TouchableOpacity style={s.viewImgBtn} onPress={() => setShowImg(true)}>
                        <Text allowFontScaling={false} style={s.viewImgText}>{"\uD83D\uDD0D"} View Image</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {chipRanges && (
                <View style={s.section}>
                  <Text allowFontScaling={false} style={s.sectionTitle}>{"\uD83C\uDFA0"} CHIP CHART</Text>
                  {chipRanges.map((r: any, i: number) => (
                    <Text allowFontScaling={false} key={i} style={{ color: COLORS.text, textAlign: "center", paddingVertical: 2 }}>
                      {r.label || (r.minRating + "\u2013" + r.maxRating)}:{" "}
                      <Text style={{ color: COLORS.primary, fontWeight: "700" }}>{r.chips} Chip{r.chips !== 1 ? "s" : ""}</Text>
                    </Text>
                  ))}
                </View>
              )}

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>{"\uD83D\uDCC5"} Date & Time</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedDate}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedTime}</Text>
              </View>

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>{"\uD83D\uDCB0"} Entry & Prizes</Text>
                <View style={s.row}>
                  <Text allowFontScaling={false} style={s.label}>Entry Fee:</Text>
                  <Text allowFontScaling={false} style={s.val}>{vm.formattedEntryFee}</Text>
                </View>
                {t.added_money > 0 && (
                  <View style={s.row}>
                    <Text allowFontScaling={false} style={s.label}>Added Money:</Text>
                    <Text allowFontScaling={false} style={{ color: COLORS.success, fontWeight: "600" }}>${t.added_money}</Text>
                  </View>
                )}
              </View>

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>{"\uD83C\uDFB1"} Details</Text>
                {t.table_size && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Table Size:</Text><Text allowFontScaling={false} style={s.val}>{t.table_size}</Text></View>}
                <View style={s.row}><Text allowFontScaling={false} style={s.label}>Reports to Fargo:</Text><Text allowFontScaling={false} style={s.val}>{t.reports_to_fargo ? "Yes" : "No"}</Text></View>
                <View style={s.row}><Text allowFontScaling={false} style={s.label}>Calcutta:</Text><Text allowFontScaling={false} style={s.val}>{t.calcutta ? "Yes" : "No"}</Text></View>
                {!isChip && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Open Tournament:</Text><Text allowFontScaling={false} style={s.val}>{t.open_tournament ? "Yes" : "No"}</Text></View>}
                {t.max_fargo && !isChip && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Max Fargo:</Text><Text allowFontScaling={false} style={s.val}>{t.max_fargo}</Text></View>}
                {!isChip && (
                  raceDisplay ? (
                    <>
                      <View style={s.row}><Text allowFontScaling={false} style={s.label}>Race:</Text><Text allowFontScaling={false} style={s.val}>{raceDisplay.summary}</Text></View>
                      {raceDisplay.groups.map((g) => (
                        <View key={g.label} style={s.row}><Text allowFontScaling={false} style={s.label}>{g.label}</Text><Text allowFontScaling={false} style={s.val}>{`${g.range} · ${g.race}`}</Text></View>
                      ))}
                      {raceDisplay.rows.map((r) => (
                        <View key={r.label} style={s.row}><Text allowFontScaling={false} style={s.label}>{r.label}</Text><Text allowFontScaling={false} style={s.val}>{r.value}</Text></View>
                      ))}
                    </>
                  ) : t.race ? (
                    <View style={s.row}><Text allowFontScaling={false} style={s.label}>Race:</Text><Text allowFontScaling={false} style={s.val}>{t.race}</Text></View>
                  ) : null
                )}
              </View>

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>{"\uD83D\uDCCD"} Location</Text>
                <Text allowFontScaling={false} style={{ color: COLORS.text, fontWeight: "600", marginBottom: 4 }}>{t.venues?.venue}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{t.venues?.address}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{t.venues?.city}, {t.venues?.state} {t.venues?.zip_code}</Text>
                {t.venues?.phone && <Text allowFontScaling={false} style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 6 }}>{"\uD83D\uDCDE"} {t.venues.phone}</Text>}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Button title="Open in Maps" onPress={vm.openMaps} variant="outline" size="sm" />
                </View>
              </View>

              {/* View Tournament / Register / Report / Close now live in the fixed footer
                  below so they stay visible while this content scrolls. */}
              <Text allowFontScaling={false} style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 16, opacity: 0.6 }}>
                This tournament is organized by {t.venues?.venue || "an independent venue"}. Compete is not the organizer.
              </Text>
              <View style={{ height: 8 }} />
            </View>
          </ScrollView>

          {/* Fixed footer \u2014 separated from the scroll body by a top border, matching the
              modal background. Mirrors the mobile modal's sticky action stack: primary
              action, then registration action, then Report / Close. */}
          <View style={s.footer}>
            {isExternal && t.external_bracket_url ? (
              <TouchableOpacity style={s.viewTournamentBtn} onPress={openExternalBracket}>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text allowFontScaling={false} style={s.viewTournamentText}>View Bracket</Text>
              </TouchableOpacity>
            ) : hasStarted ? (
              <TouchableOpacity style={s.viewTournamentBtn} onPress={viewTournament}>
                <Ionicons name="eye-outline" size={18} color="#fff" />
                <Text allowFontScaling={false} style={s.viewTournamentText}>View Tournament</Text>
              </TouchableOpacity>
            ) : null}

            {canRegister && (isTeamFormat ? (
              teamInvite.invite ? (
                <TouchableOpacity style={s.registerBtn} onPress={() => setShowTeamInvite(true)}>
                  <Text allowFontScaling={false} style={s.registerBtnText}>View Team Invite</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={s.registerBtn}
                  onPress={() => {
                    if (!profile?.id_auto) { Alert.alert("Log In Required", "Create a free account or log in to register a team."); return; }
                    setShowTeamModal(true);
                  }}
                >
                  <Text allowFontScaling={false} style={s.registerBtnText}>Register Team</Text>
                </TouchableOpacity>
              )
            ) : reg.isRegistered ? (
              <TouchableOpacity style={s.registeredPill} onPress={() => setShowUnregisterConfirm(true)} disabled={reg.loading || reg.unregistering} activeOpacity={0.8}>
                <Text allowFontScaling={false} style={s.registeredPillText}>{"\u2713"} Registered</Text>
                <Text allowFontScaling={false} style={s.registeredPillHint}>Click to Unregister</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.registerBtn} onPress={handleRegisterPress} disabled={reg.loading}>
                <Text allowFontScaling={false} style={s.registerBtnText}>Register for Tournament</Text>
              </TouchableOpacity>
            ))}

            <View style={s.footerSecondaryRow}>
              <TouchableOpacity style={s.reportBtn} onPress={() => report.openReportModal("tournament", t.id.toString())}>
                <Ionicons name="flag-outline" size={14} color="#E53935" />
                <Text allowFontScaling={false} style={{ color: "#E53935", fontSize: 13, fontWeight: "600", marginLeft: 4 }}>Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.closeActionBtn} onPress={onClose}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{"\u2715"} Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Register confirm (Fargo enter/none) — same flow/handlers as the mobile modal. */}
      {showRegisterConfirm && (
        <View style={s.confirmOverlay}>
          <Pressable style={s.confirmBackdrop} onPress={() => setShowRegisterConfirm(false)} />
          <View style={s.confirmCard}>
            <Text allowFontScaling={false} style={s.confirmTitle}>REGISTER FOR TOURNAMENT</Text>
            <Text allowFontScaling={false} style={s.confirmName}>{t.name}</Text>

            <Text allowFontScaling={false} style={s.confirmFieldLabel}>Player Name</Text>
            <View style={s.readonlyField} pointerEvents="none">
              <Text allowFontScaling={false} style={s.readonlyValue} numberOfLines={1}>{playerName}</Text>
            </View>

            <View style={s.segment}>
              <TouchableOpacity style={[s.segmentBtn, fargoMode === "enter" && s.segmentBtnOn]} activeOpacity={0.85} onPress={() => setFargoMode("enter")}>
                <Text allowFontScaling={false} style={[s.segmentText, fargoMode === "enter" && s.segmentTextOn]}>Enter Fargo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.segmentBtn, fargoMode === "none" && s.segmentBtnOn]} activeOpacity={0.85} onPress={() => setFargoMode("none")}>
                <Text allowFontScaling={false} style={[s.segmentText, fargoMode === "none" && s.segmentTextOn]}>No Fargo</Text>
              </TouchableOpacity>
            </View>

            {fargoMode === "enter" ? (
              <View style={s.fargoBlock}>
                <Text allowFontScaling={false} style={s.confirmFieldLabel}>Fargo Rating</Text>
                <View style={s.confirmFargoField}>
                  <TextInput
                    allowFontScaling={false}
                    style={s.confirmFargoInput}
                    value={regFargo}
                    onChangeText={(v) => setRegFargo(v.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    placeholder="500"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={4}
                  />
                </View>
                <Text allowFontScaling={false} style={s.confirmFargoHint}>Your Fargo will be verified by the Tournament Director.</Text>
              </View>
            ) : (
              <View style={s.noFargoBlock}>
                <Text allowFontScaling={false} style={s.noFargoText}>The Tournament Director will confirm your Fargo status or eligibility to play.</Text>
              </View>
            )}

            <View style={s.confirmButtons}>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setShowRegisterConfirm(false)} disabled={reg.registering}>
                <Text allowFontScaling={false} style={s.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmConfirm} onPress={handleConfirmRegister} disabled={reg.registering}>
                <Text allowFontScaling={false} style={s.confirmConfirmText}>{reg.registering ? "Registering..." : "Register"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Unregister confirm — same soft-cancel handler as the mobile modal. */}
      {showUnregisterConfirm && (
        <View style={s.confirmOverlay}>
          <Pressable style={s.confirmBackdrop} onPress={() => setShowUnregisterConfirm(false)} />
          <View style={s.confirmCard}>
            <Text allowFontScaling={false} style={s.confirmTitle}>UNREGISTER</Text>
            <Text allowFontScaling={false} style={s.confirmName}>Unregister from this tournament?</Text>
            <Text allowFontScaling={false} style={s.unregisterBody}>You will be removed from the tournament registration list.</Text>
            <View style={s.confirmButtons}>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setShowUnregisterConfirm(false)} disabled={reg.unregistering}>
                <Text allowFontScaling={false} style={s.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.unregisterConfirmBtn} onPress={handleConfirmUnregister} disabled={reg.unregistering}>
                <Text allowFontScaling={false} style={s.unregisterConfirmText}>{reg.unregistering ? "Unregistering..." : "Unregister"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <FullScreenImageViewer visible={showImg} imageUrl={imageUrl} title={t.name} onClose={() => setShowImg(false)} />
      <ReportModal visible={report.isModalVisible} onClose={report.closeReportModal} contentType={report.contentType} reason={report.reason} onReasonChange={report.setReason} details={report.details} onDetailsChange={report.setDetails} onSubmit={report.handleSubmit} isSubmitting={report.isSubmitting} />
      <TeamRegisterModal visible={showTeamModal} tournament={t} playerId={profile?.id_auto} onClose={() => setShowTeamModal(false)} />
      <TeamInviteModal visible={showTeamInvite} invite={teamInvite.invite} busy={teamInvite.busy} onAccept={teamInvite.accept} onDecline={teamInvite.decline} onClose={() => setShowTeamInvite(false)} />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "box-none" as any },
  dialog: { width: 720, maxWidth: "92%" as any, maxHeight: "88vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.background },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backBtnText: { color: COLORS.primary, fontSize: 14 },
  closeBtn: { backgroundColor: COLORS.error, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  // Flex within the dialog column (header + scroll + fixed footer). minHeight:0 lets it
  // shrink below its content and scroll internally so the footer never moves.
  scroll: { flex: 1, minHeight: 0 as any },
  content: { padding: 20 },
  // Fixed footer: separated from the scroll body by a top border, same modal background.
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background, gap: 8 },
  footerSecondaryRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  registerBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  registerBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  registeredPill: { alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: COLORS.success + "20", borderColor: COLORS.success, borderWidth: 1, borderRadius: 8, paddingVertical: 10 },
  registeredPillText: { color: COLORS.success, fontSize: 15, fontWeight: "700" },
  registeredPillHint: { color: COLORS.success, fontSize: 11, fontWeight: "600", opacity: 0.85 },
  topRow: { flexDirection: "row", marginBottom: 16 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  idBadge: { backgroundColor: "#000", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  idText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  gameBadge: { backgroundColor: COLORS.primary, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  gameText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  fmtBadge: { backgroundColor: COLORS.surface, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  fmtText: { color: COLORS.text, fontSize: 11 },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  desc: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  img: { width: 140, height: 140, borderRadius: 8 },
  imgPlaceholder: { width: 140, height: 140, borderRadius: 8, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  viewImgBtn: { marginTop: 8, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  viewImgText: { color: COLORS.primary, fontSize: 11, fontWeight: "600" },
  section: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginBottom: 8 },
  sectionText: { fontSize: 14, color: COLORS.textSecondary },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 14, color: COLORS.textSecondary },
  val: { fontSize: 14, color: COLORS.text },
  viewTournamentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, marginTop: 4, marginBottom: 4 },
  viewTournamentText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  reportBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: "#E53935", backgroundColor: "rgba(229,57,53,0.1)" },
  closeActionBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 6, backgroundColor: COLORS.error, alignItems: "center" },

  // Register / Unregister confirm dialogs (web) — centered card over a dark backdrop.
  confirmOverlay: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2100, alignItems: "center", justifyContent: "center", padding: 24 },
  confirmBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  confirmCard: { width: 460, maxWidth: "92%" as any, backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: 20, paddingVertical: 20, shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  confirmTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  confirmName: { fontSize: 20, fontWeight: "800", color: COLORS.primaryLight, lineHeight: 26 },
  confirmFieldLabel: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary, marginTop: 16, marginBottom: 6 },
  readonlyField: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  readonlyValue: { fontSize: 15, fontWeight: "600", color: COLORS.textSecondary },
  segment: { flexDirection: "row", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, padding: 3, marginTop: 16 },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 999 },
  segmentBtnOn: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary },
  segmentTextOn: { color: "#fff" },
  fargoBlock: { minHeight: 110 },
  confirmFargoField: { flexDirection: "row", alignItems: "center", width: 120, height: 48, backgroundColor: COLORS.surfaceLight, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14 },
  confirmFargoInput: { flex: 1, height: "100%" as any, color: COLORS.text, fontSize: 15, fontWeight: "600", ...( { outlineStyle: "none" } as object) },
  confirmFargoHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 10 },
  noFargoBlock: { minHeight: 110, alignItems: "center", justifyContent: "center" },
  noFargoText: { fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 20 },
  confirmButtons: { flexDirection: "row", gap: 8, marginTop: 16 },
  confirmCancel: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: "transparent", borderWidth: 1, borderColor: COLORS.borderLight },
  confirmCancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },
  confirmConfirm: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.primary },
  confirmConfirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  unregisterBody: { fontSize: 14, color: COLORS.textSecondary, marginTop: 10, lineHeight: 20 },
  unregisterConfirmBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.error },
  unregisterConfirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});