import React, { useState } from "react";
import { Image, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { GIVEAWAY_RULES_TITLE } from "../../../models/constants/giveaway-rules";
import { endsLabel, entryLimitLabel } from "../../../utils/giveaway-rules";
import { GiveawayRulesContent } from "../giveaway/GiveawayRulesContent";
import { RADIUS } from "../../../theme/spacing";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

const C = { bg: "#000000", card: "#1C1C1E", border: "#2C2C2E", blue: "#007AFF", white: "#FFFFFF", gray: "#8E8E93", lightGray: "#AEAEB2", green: "#30D158", amber: "#FF9F0A" };
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };
const FS = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20 };

function FullRulesModal({ visible, giveaway, onClose }: { visible: boolean; giveaway: Giveaway; onClose: () => void }) {
  if (!visible) return null;
  const content = (
    <>
      <View style={rm.header}>
        <TouchableOpacity onPress={onClose} style={rm.closeBtn}><Text allowFontScaling={false} style={rm.closeBtnText}>{"\u2715"}</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={rm.headerTitle}>{GIVEAWAY_RULES_TITLE}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={rm.divider} />
      <ScrollView style={rm.scroll} contentContainerStyle={rm.scrollContent} showsVerticalScrollIndicator onScrollBeginDrag={Keyboard.dismiss}>
        <GiveawayRulesContent giveaway={giveaway} customRulesText={giveaway.rules_text} />
      </ScrollView>
      <View style={rm.footer}>
        <TouchableOpacity style={rm.acceptBtn} onPress={onClose}>
          <Text allowFontScaling={false} style={rm.acceptBtnText}>Accept & Close</Text>
        </TouchableOpacity>
      </View>
    </>
  );
  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={rm.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={rm.dialogWrap} pointerEvents="box-none"><View style={rm.dialog}>{content}</View></View>
      </>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={rm.mobileBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={rm.mobileCardWrap} pointerEvents="box-none"><View style={rm.mobileCard}>{content}</View></View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 3000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 3001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 640, maxWidth: "92%" as any, maxHeight: "88vh" as any, backgroundColor: "#0F1117", borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, overflow: "hidden" as any },
  mobileBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)" },
  mobileCardWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  mobileCard: { backgroundColor: "#0F1117", borderRadius: 20, width: "100%", maxWidth: 480, height: "82%" as any, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SP.lg), paddingTop: wxSc(SP.lg), paddingBottom: wxSc(SP.md) },
  closeBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeBtnText: { color: C.white, fontSize: wxMs(20), fontWeight: "700" },
  headerTitle: { color: C.white, fontSize: wxMs(FS.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.border },
  scroll: { flex: 1 },
  scrollContent: { padding: wxSc(SP.xl), paddingBottom: wxSc(SP.lg) },
  footer: { padding: wxSc(SP.lg), paddingBottom: Platform.OS === "ios" ? 34 : wxSc(SP.lg), borderTopWidth: 1, borderTopColor: C.border },
  acceptBtn: { paddingVertical: wxSc(14), borderRadius: wxSc(10), backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  acceptBtnText: { color: C.white, fontSize: wxMs(16), fontWeight: "600" },
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={dr.row}>
      <Text allowFontScaling={false} style={dr.label}>{label}</Text>
      <Text allowFontScaling={false} style={dr.value}>{value}</Text>
    </View>
  );
}
const dr = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: wxMs(FS.sm), color: C.gray, flex: 1 },
  value: { fontSize: wxMs(FS.sm), color: C.white, fontWeight: "600", flex: 2, textAlign: "right" },
});

interface GiveawayDetailModalProps {
  visible: boolean;
  giveaway: Giveaway | null;
  isEntered: boolean;
  daysRemaining: string;
  onClose: () => void;
  onEnter: () => void;
  /** Wallet giveaway past its end time (computed in the viewmodel). */
  pastEndDate?: boolean;
}

export function GiveawayDetailModal({ visible, giveaway, isEntered, daysRemaining, onClose, onEnter, pastEndDate = false }: GiveawayDetailModalProps) {
  const [showRules, setShowRules] = useState(false);
  if (!giveaway || !visible) return null;

  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent = maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;
  const isClosed = giveaway.status === "ended" || giveaway.status === "awarded" || (maxEntries > 0 && entryCount >= maxEntries) || pastEndDate;
  const formatValue = (value: number | null) => value ? `$${value.toLocaleString()}` : "\u2014";

  const innerContent = (
    <>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeButton}><Text allowFontScaling={false} style={s.closeButtonText}>{"\u2715"}</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={s.headerTitle}>Giveaway Details</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} onScrollBeginDrag={Keyboard.dismiss}>
        <View style={s.imageContainer}>
          {giveaway.image_url ? (
            <Image source={{ uri: giveaway.image_url }} style={s.image} resizeMode="contain" />
          ) : (
            <View style={s.imagePlaceholder}><Text allowFontScaling={false} style={s.imagePlaceholderText}>{"\uD83C\uDF81"}</Text></View>
          )}
        </View>
        <View style={s.prizeCard}>
          <Text allowFontScaling={false} style={s.prizeCardLabel}>Prize</Text>
          <Text allowFontScaling={false} style={s.prizeCardName}>{giveaway.name}</Text>
          {giveaway.description ? (
            <>
              <Text allowFontScaling={false} style={s.prizeCardDescLabel}>Description</Text>
              <Text allowFontScaling={false} style={s.prizeCardDesc}>{giveaway.description}</Text>
            </>
          ) : null}
        </View>
        <View style={s.detailsCard}>
          <Text allowFontScaling={false} style={s.detailsTitle}>Giveaway Info</Text>
          <DetailRow label="Approximate Value" value={formatValue(giveaway.prize_value)} />
          <DetailRow label="Entry Method" value={giveaway.entry_mode === "wallet" ? "Giveaway Entries" : "Single Free Entry"} />
          <DetailRow label="Entry Limit" value={entryLimitLabel(giveaway)} />
          <DetailRow label="Entries So Far" value={`${entryCount}`} />
          <DetailRow label="Ends" value={endsLabel(giveaway) ?? "Ongoing"} />
          <DetailRow label="Number of Winners" value="1" />
          <DetailRow label="Min Age" value={`${giveaway.min_age}+`} />
          {maxEntries > 0 && (
            <View style={s.progressContainer}>
              <View style={s.progressBackground}>
                <View style={[s.progressFill, { width: `${progressPercent}%` as any }]} />
              </View>
              <Text allowFontScaling={false} style={s.progressLabel}>{entryCount} / {maxEntries} entries filled</Text>
            </View>
          )}
          <View style={[dr.row, { borderBottomWidth: 0, marginBottom: 0, marginTop: 4 }]}>
            <Text allowFontScaling={false} style={dr.label}>Status</Text>
            <Text allowFontScaling={false} style={[dr.value, { color: isClosed ? C.amber : C.green }]}>{isClosed ? "Entry Period Closed" : daysRemaining}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.rulesButton} onPress={() => setShowRules(true)} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={s.rulesButtonIcon}>{"\uD83D\uDCDC"}</Text>
          <Text allowFontScaling={false} style={s.rulesButtonText}>View Official Rules</Text>
          <Text allowFontScaling={false} style={s.rulesButtonChevron}>{"\u203A"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={s.bottomBar}>
        {isClosed ? (
          <View style={[s.enterButton, s.closedButton]}><Text allowFontScaling={false} style={s.closedButtonText}>Entry Period Closed</Text></View>
        ) : isEntered ? (
          <View style={[s.enterButton, s.enteredButton]}><Text allowFontScaling={false} style={s.enteredButtonText}>{"Already Entered \u2713"}</Text></View>
        ) : (
          <TouchableOpacity style={s.enterButton} onPress={onEnter}><Text allowFontScaling={false} style={s.enterButtonText}>Enter Giveaway</Text></TouchableOpacity>
        )}
        <TouchableOpacity style={s.cancelButton} onPress={onClose}><Text allowFontScaling={false} style={s.cancelButtonText}>Close</Text></TouchableOpacity>
      </View>
      <FullRulesModal visible={showRules} giveaway={giveaway} onClose={() => setShowRules(false)} />
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap} pointerEvents="box-none"><View style={s.dialog}>{innerContent}</View></View>
      </>
    );
  }
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.mobileBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.mobileCardWrapper} pointerEvents="box-none"><View style={s.mobileCard}>{innerContent}</View></View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 640, maxWidth: "92%" as any, maxHeight: "90vh" as any, backgroundColor: C.bg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  mobileBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  mobileCardWrapper: { flex: 1, justifyContent: "center", alignItems: "center", padding: wxSc(20) },
  mobileCard: { width: "100%", maxWidth: 480, height: "86%" as any, backgroundColor: C.bg, borderRadius: wxSc(20), borderWidth: 1, borderColor: C.border, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SP.lg), paddingTop: wxSc(SP.lg), paddingBottom: wxSc(SP.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: C.white, fontSize: wxMs(20), fontWeight: "700" },
  headerTitle: { color: C.white, fontSize: wxMs(FS.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.border },
  scroll: { flex: 1 },
  scrollContent: { padding: wxSc(SP.xl), paddingBottom: wxSc(SP.lg) },
  imageContainer: { width: "100%", height: wxSc(180), borderRadius: wxSc(12), overflow: "hidden", backgroundColor: C.card, marginBottom: wxSc(SP.md) },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { fontSize: wxMs(60) },
  prizeCard: { backgroundColor: C.card, borderRadius: wxSc(12), padding: wxSc(SP.lg), marginBottom: wxSc(SP.md), borderWidth: 1, borderColor: C.border },
  prizeCardLabel: { fontSize: wxMs(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  prizeCardName: { fontSize: wxMs(FS.lg), fontWeight: "700", color: C.white, marginBottom: wxSc(SP.md) },
  prizeCardDescLabel: { fontSize: wxMs(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  prizeCardDesc: { fontSize: wxMs(FS.sm), color: C.lightGray, lineHeight: wxMs(20) },
  detailsCard: { backgroundColor: C.card, borderRadius: wxSc(12), padding: wxSc(SP.lg), marginBottom: wxSc(SP.md), borderWidth: 1, borderColor: C.border },
  detailsTitle: { fontSize: wxMs(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: wxSc(SP.md) },
  progressContainer: { marginTop: wxSc(SP.md) },
  progressBackground: { height: 6, backgroundColor: "#3A3A3C", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: C.blue, borderRadius: 3 },
  progressLabel: { fontSize: wxMs(FS.xs), color: C.gray, marginTop: 4, textAlign: "right" },
  rulesButton: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: wxSc(10), padding: wxSc(SP.md), borderWidth: 1, borderColor: C.border, gap: wxSc(SP.sm), marginBottom: wxSc(SP.sm) },
  rulesButtonIcon: { fontSize: wxMs(16) },
  rulesButtonText: { flex: 1, color: C.blue, fontSize: wxMs(FS.sm), fontWeight: "600" },
  rulesButtonChevron: { color: C.gray, fontSize: wxMs(20), fontWeight: "300" },
  bottomBar: { flexDirection: "row", padding: wxSc(SP.lg), gap: wxSc(SP.md), borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === "ios" ? 34 : wxSc(SP.lg) },
  enterButton: { flex: 1, backgroundColor: C.blue, borderRadius: wxSc(12), paddingVertical: wxSc(SP.lg), alignItems: "center" },
  enterButtonText: { color: C.white, fontSize: wxMs(FS.md), fontWeight: "700" },
  enteredButton: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  enteredButtonText: { color: C.gray, fontSize: wxMs(FS.md), fontWeight: "600" },
  closedButton: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  closedButtonText: { color: C.gray, fontSize: wxMs(FS.md), fontWeight: "600" },
  cancelButton: { flex: 1, backgroundColor: C.card, borderRadius: wxSc(12), paddingVertical: wxSc(SP.lg), alignItems: "center", borderWidth: 1, borderColor: C.border },
  cancelButtonText: { color: C.white, fontSize: wxMs(FS.md), fontWeight: "600" },
});