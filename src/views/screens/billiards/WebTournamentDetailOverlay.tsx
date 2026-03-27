import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS } from "../../../theme/spacing";
import { moderateScale, scale } from "../../../utils/scaling";
import { useReport } from "../../../viewmodels/hooks/useReport";
import { useTournamentDetail } from "../../../viewmodels/useTournamentDetail";
import { Button } from "../../components/common/button";
import { FullScreenImageViewer } from "../../components/common/FullScreenImageViewer";
import ReportModal from "../../components/common/ReportModal";

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
  const vm = useTournamentDetail(id);
  const { session } = useAuth() as any;
  const [showImg, setShowImg] = useState(false);
  const report = useReport({ userId: session?.user?.id });

  if (vm.loading) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap}>
          <View style={s.dialog}>
            <View style={s.header}>
              <TouchableOpacity onPress={onClose} style={s.backBtn}><Text allowFontScaling={false} style={s.backBtnText}>← Back</Text></TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={s.closeBtn}><Text allowFontScaling={false} style={s.closeBtnText}>✕</Text></TouchableOpacity>
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
  const isChip = t.tournament_format === "chip-tournament";
  const chipRanges = isChip && Array.isArray(t.chip_ranges) && t.chip_ranges.length > 0 ? t.chip_ranges : null;

  return (
    <>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.dialogWrap}>
        <View style={s.dialog}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.backBtn}><Text allowFontScaling={false} style={s.backBtnText}>← Back</Text></TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}><Text allowFontScaling={false} style={s.closeBtnText}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <View style={s.content}>
              <View style={s.topRow}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <View style={s.badges}>
                    <View style={s.idBadge}><Text allowFontScaling={false} style={s.idText}>ID: {t.id}</Text></View>
                    <View style={s.gameBadge}><Text allowFontScaling={false} style={s.gameText}>{t.game_type?.toUpperCase()}</Text></View>
                    <View style={s.fmtBadge}><Text allowFontScaling={false} style={s.fmtText}>{t.tournament_format?.replace("_", " ")}</Text></View>
                    {t.is_recurring && <View style={s.fmtBadge}><Text allowFontScaling={false} style={s.fmtText}>🔄 Weekly</Text></View>}
                  </View>
                  <Text allowFontScaling={false} style={s.title}>{t.name}</Text>
                  {t.description && <Text allowFontScaling={false} style={s.desc}>{t.description}</Text>}
                </View>
                <View style={{ alignItems: "center" }}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={s.img} resizeMode="cover" />
                  ) : (
                    <View style={s.imgPlaceholder}><Text allowFontScaling={false} style={{ fontSize: moderateScale(32) }}>🎱</Text></View>
                  )}
                  {imageUrl && (
                    <TouchableOpacity style={s.viewImgBtn} onPress={() => setShowImg(true)}>
                      <Text allowFontScaling={false} style={s.viewImgText}>🔍 View Image</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {chipRanges && (
                <View style={s.section}>
                  <Text allowFontScaling={false} style={s.sectionTitle}>🎰 CHIP CHART</Text>
                  {chipRanges.map((r: any, i: number) => (
                    <Text allowFontScaling={false} key={i} style={{ color: COLORS.text, textAlign: "center", paddingVertical: 2 }}>
                      {r.label || `${r.minRating}–${r.maxRating}`}:{" "}
                      <Text style={{ color: COLORS.primary, fontWeight: "700" }}>{r.chips} Chip{r.chips !== 1 ? "s" : ""}</Text>
                    </Text>
                  ))}
                </View>
              )}

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>📅 Date & Time</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedDate}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{vm.formattedTime}</Text>
              </View>

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>💰 Entry & Prizes</Text>
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
                <Text allowFontScaling={false} style={s.sectionTitle}>🎱 Details</Text>
                {t.table_size && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Table Size:</Text><Text allowFontScaling={false} style={s.val}>{t.table_size}</Text></View>}
                <View style={s.row}><Text allowFontScaling={false} style={s.label}>Reports to Fargo:</Text><Text allowFontScaling={false} style={s.val}>{t.reports_to_fargo ? "Yes" : "No"}</Text></View>
                <View style={s.row}><Text allowFontScaling={false} style={s.label}>Calcutta:</Text><Text allowFontScaling={false} style={s.val}>{t.calcutta ? "Yes" : "No"}</Text></View>
                {!isChip && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Open Tournament:</Text><Text allowFontScaling={false} style={s.val}>{t.open_tournament ? "Yes" : "No"}</Text></View>}
                {t.max_fargo && !isChip && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Max Fargo:</Text><Text allowFontScaling={false} style={s.val}>{t.max_fargo}</Text></View>}
                {t.race && !isChip && <View style={s.row}><Text allowFontScaling={false} style={s.label}>Race:</Text><Text allowFontScaling={false} style={s.val}>{t.race}</Text></View>}
              </View>

              <View style={s.section}>
                <Text allowFontScaling={false} style={s.sectionTitle}>📍 Location</Text>
                <Text allowFontScaling={false} style={{ color: COLORS.text, fontWeight: "600", marginBottom: 4 }}>{t.venues?.venue}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{t.venues?.address}</Text>
                <Text allowFontScaling={false} style={s.sectionText}>{t.venues?.city}, {t.venues?.state} {t.venues?.zip_code}</Text>
                {t.venues?.phone && <Text allowFontScaling={false} style={{ color: COLORS.textSecondary, fontSize: moderateScale(13), marginTop: 6 }}>📞 {t.venues.phone}</Text>}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Button title="📍 Open in Maps" onPress={vm.openMaps} variant="outline" size="sm" />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                <TouchableOpacity style={s.reportBtn} onPress={() => report.openReportModal("tournament", t.id.toString())}>
                  <Ionicons name="flag-outline" size={14} color="#E53935" />
                  <Text allowFontScaling={false} style={{ color: "#E53935", fontSize: moderateScale(13), fontWeight: "600", marginLeft: 4 }}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.closeActionBtn} onPress={onClose}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: moderateScale(13), fontWeight: "600" }}>✕ Close</Text>
                </TouchableOpacity>
              </View>

              <Text allowFontScaling={false} style={{ fontSize: moderateScale(11), color: COLORS.textMuted, textAlign: "center", marginTop: 16, opacity: 0.6 }}>
                This tournament is organized by {t.venues?.venue || "an independent venue"}. Compete is not the organizer.
              </Text>
              <View style={{ height: 24 }} />
            </View>
          </ScrollView>
        </View>
      </View>

      <FullScreenImageViewer visible={showImg} imageUrl={imageUrl} title={t.name} onClose={() => setShowImg(false)} />
      <ReportModal visible={report.isModalVisible} onClose={report.closeReportModal} contentType={report.contentType} reason={report.reason} onReasonChange={report.setReason} details={report.details} onDetailsChange={report.setDetails} onSubmit={report.handleSubmit} isSubmitting={report.isSubmitting} />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "box-none" as any },
  dialog: { width: 720, maxWidth: "92%" as any, maxHeight: "88vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: scale(14), backgroundColor: COLORS.background },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backBtnText: { color: COLORS.primary, fontSize: moderateScale(14) },
  closeBtn: { backgroundColor: COLORS.error, width: scale(28), height: scale(28), borderRadius: 6, alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#fff", fontSize: moderateScale(14), fontWeight: "700" },
  scroll: { maxHeight: "calc(88vh - 56px)" as any },
  content: { padding: scale(20) },
  topRow: { flexDirection: "row", marginBottom: scale(16) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: scale(10) },
  idBadge: { backgroundColor: "#000", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  idText: { color: "#fff", fontSize: moderateScale(11), fontWeight: "700" },
  gameBadge: { backgroundColor: COLORS.primary, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  gameText: { color: "#fff", fontSize: moderateScale(11), fontWeight: "600" },
  fmtBadge: { backgroundColor: COLORS.surface, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  fmtText: { color: COLORS.text, fontSize: moderateScale(11) },
  title: { fontSize: moderateScale(22), fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  desc: { fontSize: moderateScale(14), color: COLORS.textSecondary, lineHeight: moderateScale(20) },
  img: { width: scale(140), height: scale(140), borderRadius: 8 },
  imgPlaceholder: { width: scale(140), height: scale(140), borderRadius: 8, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  viewImgBtn: { marginTop: 8, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  viewImgText: { color: COLORS.primary, fontSize: moderateScale(11), fontWeight: "600" },
  section: { backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(14), marginBottom: scale(12), borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: moderateScale(14), fontWeight: "600", color: COLORS.text, marginBottom: 8 },
  sectionText: { fontSize: moderateScale(14), color: COLORS.textSecondary },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: moderateScale(14), color: COLORS.textSecondary },
  val: { fontSize: moderateScale(14), color: COLORS.text },
  reportBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: "#E53935", backgroundColor: "rgba(229,57,53,0.1)" },
  closeActionBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 6, backgroundColor: COLORS.error, alignItems: "center" },
});
