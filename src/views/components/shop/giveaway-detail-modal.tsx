import React, { useState } from "react";
import { Image, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { RADIUS } from "../../../theme/spacing";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

const C = { bg: "#000000", card: "#1C1C1E", border: "#2C2C2E", blue: "#007AFF", white: "#FFFFFF", gray: "#8E8E93", lightGray: "#AEAEB2", green: "#30D158", amber: "#FF9F0A" };
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };
const FS = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20 };

const DEFAULT_RULES_SECTIONS = [
  { heading: "", body: "NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase or payment of any kind will not increase your chances of winning. Void where prohibited by law." },
  { heading: "1. Eligibility", body: "Giveaways hosted on the Compete app are open to legal residents of the United States who are 18 years of age or older at the time of entry. Employees, officers, and directors of Compete and its affiliates, and their immediate family members, are not eligible to participate. Void where prohibited or restricted by law." },
  { heading: "2. How to Enter", body: "No purchase necessary. To enter a giveaway, you must have a registered Compete account in good standing. Complete the entry form with your full legal name, date of birth, email address, and phone number. Limit one (1) entry per person per giveaway." },
  { heading: "3. Entry Period", body: "Each giveaway has a specific start and end date displayed on the giveaway listing. Entries must be received before the posted end date and time. Late entries will not be accepted." },
  { heading: "4. Winner Selection", body: "Winners are selected at random from all eligible entries received during the entry period. The odds of winning depend on the number of eligible entries received." },
  { heading: "5. Winner Notification", body: "The winner will be notified via the email address and/or phone number provided at the time of entry. The winner must respond within seven (7) days of notification to claim their prize. If the winner does not respond, the prize may be forfeited." },
  { heading: "6. Prizes", body: "The prize for each giveaway is described on the giveaway listing page. Prizes are non-transferable and cannot be exchanged for cash. Compete reserves the right to substitute a prize of equal or greater value. Winners are solely responsible for any applicable taxes." },
  { heading: "7. Identity Verification", body: "Winners may be required to present a valid government-issued photo ID to verify their identity and age before receiving their prize." },
  { heading: "8. General Conditions", body: "By entering a giveaway, you agree to be bound by these Official Rules and the decisions of Compete, which are final and binding. Compete reserves the right to cancel, suspend, or modify any giveaway at any time for any reason." },
  { heading: "9. Privacy", body: "Information collected during giveaway entry is subject to the Compete Privacy Policy. Your information will be used for giveaway administration, winner notification, and prize fulfillment." },
  { heading: "10. Governing Law", body: "These Official Rules are governed by the laws of the United States and the state in which Compete operates." },
  { heading: "11. Apple Disclaimer", body: "This giveaway is in no way sponsored, endorsed, administered by, or associated with Apple Inc. Any questions regarding the giveaway should be directed to Compete, not Apple." },
];

function FullRulesModal({ visible, customRulesText, onClose }: { visible: boolean; customRulesText: string | null; onClose: () => void }) {
  if (!visible) return null;
  const content = (
    <>
      <View style={rm.header}>
        <TouchableOpacity onPress={onClose} style={rm.closeBtn}><Text allowFontScaling={false} style={rm.closeBtnText}>✕</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={rm.headerTitle}>Official Rules</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={rm.divider} />
      <ScrollView style={rm.scroll} contentContainerStyle={rm.scrollContent} showsVerticalScrollIndicator onScrollBeginDrag={Keyboard.dismiss}>
        {DEFAULT_RULES_SECTIONS.map((section, i) => (
          <View key={i} style={rm.section}>
            {section.heading ? <Text allowFontScaling={false} style={rm.heading}>{section.heading}</Text> : null}
            <Text allowFontScaling={false} style={rm.body}>{section.body}</Text>
          </View>
        ))}
        {customRulesText ? (
          <View style={rm.customSection}>
            <Text allowFontScaling={false} style={rm.customHeading}>Additional Rules</Text>
            <Text allowFontScaling={false} style={rm.body}>{customRulesText}</Text>
          </View>
        ) : null}
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SP.lg), paddingTop: scale(SP.lg), paddingBottom: scale(SP.md) },
  closeBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeBtnText: { color: C.white, fontSize: moderateScale(20), fontWeight: "700" },
  headerTitle: { color: C.white, fontSize: moderateScale(FS.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.border },
  scroll: { flex: 1 },
  scrollContent: { padding: scale(SP.xl), paddingBottom: scale(SP.lg) },
  section: { marginBottom: scale(20) },
  heading: { color: C.blue, fontSize: moderateScale(16), fontWeight: "600", marginBottom: scale(8) },
  body: { color: "#D1D5DB", fontSize: moderateScale(14), lineHeight: moderateScale(22) },
  customSection: { marginTop: scale(8), marginBottom: scale(20), paddingTop: scale(16), borderTopWidth: 1, borderTopColor: C.border },
  customHeading: { color: C.amber, fontSize: moderateScale(16), fontWeight: "600", marginBottom: scale(8) },
  footer: { padding: scale(SP.lg), paddingBottom: Platform.OS === "ios" ? 34 : scale(SP.lg), borderTopWidth: 1, borderTopColor: C.border },
  acceptBtn: { paddingVertical: scale(14), borderRadius: scale(10), backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  acceptBtnText: { color: C.white, fontSize: moderateScale(16), fontWeight: "600" },
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
  label: { fontSize: moderateScale(FS.sm), color: C.gray, flex: 1 },
  value: { fontSize: moderateScale(FS.sm), color: C.white, fontWeight: "600", flex: 2, textAlign: "right" },
});

interface GiveawayDetailModalProps {
  visible: boolean;
  giveaway: Giveaway | null;
  isEntered: boolean;
  daysRemaining: string;
  onClose: () => void;
  onEnter: () => void;
}

export function GiveawayDetailModal({ visible, giveaway, isEntered, daysRemaining, onClose, onEnter }: GiveawayDetailModalProps) {
  const [showRules, setShowRules] = useState(false);
  if (!giveaway || !visible) return null;

  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent = maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;
  const isClosed = giveaway.status === "ended" || giveaway.status === "awarded" || (maxEntries > 0 && entryCount >= maxEntries);
  const formatValue = (value: number | null) => value ? `$${value.toLocaleString()}` : "—";
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No end date";
    return new Date(dateString).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const innerContent = (
    <>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeButton}><Text allowFontScaling={false} style={s.closeButtonText}>✕</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={s.headerTitle}>Giveaway Details</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} onScrollBeginDrag={Keyboard.dismiss}>
        <View style={s.imageContainer}>
          {giveaway.image_url ? (
            <Image source={{ uri: giveaway.image_url }} style={s.image} resizeMode="contain" />
          ) : (
            <View style={s.imagePlaceholder}><Text allowFontScaling={false} style={s.imagePlaceholderText}>🎁</Text></View>
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
          <DetailRow label="Entry Limit" value={maxEntries > 0 ? "1 per person" : "Unlimited"} />
          <DetailRow label="Entries So Far" value={`${entryCount}`} />
          {giveaway.end_date ? <DetailRow label="End Date" value={formatDate(giveaway.end_date)} /> : maxEntries > 0 ? <DetailRow label="Entry Cap" value={`${maxEntries} entries`} /> : <DetailRow label="End Date" value="Ongoing" />}
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
          <Text allowFontScaling={false} style={s.rulesButtonIcon}>📜</Text>
          <Text allowFontScaling={false} style={s.rulesButtonText}>View Official Rules</Text>
          <Text allowFontScaling={false} style={s.rulesButtonChevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={s.bottomBar}>
        {isClosed ? (
          <View style={[s.enterButton, s.closedButton]}><Text allowFontScaling={false} style={s.closedButtonText}>Entry Period Closed</Text></View>
        ) : isEntered ? (
          <View style={[s.enterButton, s.enteredButton]}><Text allowFontScaling={false} style={s.enteredButtonText}>Already Entered ✓</Text></View>
        ) : (
          <TouchableOpacity style={s.enterButton} onPress={onEnter}><Text allowFontScaling={false} style={s.enterButtonText}>Enter Giveaway</Text></TouchableOpacity>
        )}
        <TouchableOpacity style={s.cancelButton} onPress={onClose}><Text allowFontScaling={false} style={s.cancelButtonText}>Close</Text></TouchableOpacity>
      </View>
      <FullRulesModal visible={showRules} customRulesText={giveaway.rules_text} onClose={() => setShowRules(false)} />
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
  mobileCardWrapper: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(20) },
  mobileCard: { width: "100%", maxWidth: 480, height: "86%" as any, backgroundColor: C.bg, borderRadius: scale(20), borderWidth: 1, borderColor: C.border, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SP.lg), paddingTop: scale(SP.lg), paddingBottom: scale(SP.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: C.white, fontSize: moderateScale(20), fontWeight: "700" },
  headerTitle: { color: C.white, fontSize: moderateScale(FS.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.border },
  scroll: { flex: 1 },
  scrollContent: { padding: scale(SP.xl), paddingBottom: scale(SP.lg) },
  imageContainer: { width: "100%", height: scale(180), borderRadius: scale(12), overflow: "hidden", backgroundColor: C.card, marginBottom: scale(SP.md) },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { fontSize: moderateScale(60) },
  prizeCard: { backgroundColor: C.card, borderRadius: scale(12), padding: scale(SP.lg), marginBottom: scale(SP.md), borderWidth: 1, borderColor: C.border },
  prizeCardLabel: { fontSize: moderateScale(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  prizeCardName: { fontSize: moderateScale(FS.lg), fontWeight: "700", color: C.white, marginBottom: scale(SP.md) },
  prizeCardDescLabel: { fontSize: moderateScale(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  prizeCardDesc: { fontSize: moderateScale(FS.sm), color: C.lightGray, lineHeight: moderateScale(20) },
  detailsCard: { backgroundColor: C.card, borderRadius: scale(12), padding: scale(SP.lg), marginBottom: scale(SP.md), borderWidth: 1, borderColor: C.border },
  detailsTitle: { fontSize: moderateScale(FS.xs), fontWeight: "700", color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: scale(SP.md) },
  progressContainer: { marginTop: scale(SP.md) },
  progressBackground: { height: 6, backgroundColor: "#3A3A3C", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: C.blue, borderRadius: 3 },
  progressLabel: { fontSize: moderateScale(FS.xs), color: C.gray, marginTop: 4, textAlign: "right" },
  rulesButton: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: scale(10), padding: scale(SP.md), borderWidth: 1, borderColor: C.border, gap: scale(SP.sm), marginBottom: scale(SP.sm) },
  rulesButtonIcon: { fontSize: moderateScale(16) },
  rulesButtonText: { flex: 1, color: C.blue, fontSize: moderateScale(FS.sm), fontWeight: "600" },
  rulesButtonChevron: { color: C.gray, fontSize: moderateScale(20), fontWeight: "300" },
  bottomBar: { flexDirection: "row", padding: scale(SP.lg), gap: scale(SP.md), borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === "ios" ? 34 : scale(SP.lg) },
  enterButton: { flex: 1, backgroundColor: C.blue, borderRadius: scale(12), paddingVertical: scale(SP.lg), alignItems: "center" },
  enterButtonText: { color: C.white, fontSize: moderateScale(FS.md), fontWeight: "700" },
  enteredButton: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  enteredButtonText: { color: C.gray, fontSize: moderateScale(FS.md), fontWeight: "600" },
  closedButton: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  closedButtonText: { color: C.gray, fontSize: moderateScale(FS.md), fontWeight: "600" },
  cancelButton: { flex: 1, backgroundColor: C.card, borderRadius: scale(12), paddingVertical: scale(SP.lg), alignItems: "center", borderWidth: 1, borderColor: C.border },
  cancelButtonText: { color: C.white, fontSize: moderateScale(FS.md), fontWeight: "600" },
});
