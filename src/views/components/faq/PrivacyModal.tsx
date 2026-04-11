import { PRIVACY_POLICY } from "../../../models/constants/legal-text";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

const isWeb = Platform.OS === "web";
type LegalSection = { heading: string; body: string };

interface PrivacyModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PrivacyModal({ visible, onClose }: PrivacyModalProps) {
  if (!visible) return null;

  const innerContent = (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text allowFontScaling={false} style={s.headerTitle}>PRIVACY POLICY</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text allowFontScaling={false} style={s.lastUpdated}>Effective Date: {PRIVACY_POLICY.lastUpdated}</Text>
        <Text allowFontScaling={false} style={s.preamble}>{PRIVACY_POLICY.preamble}</Text>
        {PRIVACY_POLICY.sections.map((section: LegalSection, index: number) => (
          <View key={index} style={s.section}>
            <Text allowFontScaling={false} style={s.heading}>{section.heading}</Text>
            <Text allowFontScaling={false} style={s.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity style={s.acceptButton} onPress={onClose}>
          <Text allowFontScaling={false} style={s.acceptButtonText}>Accept & Close</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.mobileOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={s.mobileContainer}>{innerContent}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 700, maxWidth: "92%" as any, height: "82vh" as any, backgroundColor: "#000000", borderRadius: RADIUS.xl, borderWidth: 1, borderColor: "#2C2C2E", overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, display: "flex" as any, flexDirection: "column" },
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: wxSc(20) },
  mobileContainer: { backgroundColor: COLORS.background, borderRadius: wxSc(20), width: "100%", maxWidth: 500, height: "85%" as any, flexDirection: "column" as any },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SPACING.lg), paddingTop: wxSc(SPACING.lg), paddingBottom: wxSc(SPACING.md) },
  headerTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: wxMs(20), fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#2C2C2E" },
  scrollContent: { padding: wxSc(SPACING.lg), paddingBottom: wxSc(SPACING.xl) },
  lastUpdated: { color: "#6B7280", fontSize: wxMs(13), marginBottom: wxSc(SPACING.md) },
  preamble: { color: "#D1D5DB", fontSize: wxMs(14), lineHeight: wxMs(22), marginBottom: wxSc(SPACING.lg) },
  section: { marginBottom: wxSc(SPACING.lg) },
  heading: { color: "#3B82F6", fontSize: wxMs(16), fontWeight: "600", marginBottom: wxSc(SPACING.sm) },
  body: { color: "#D1D5DB", fontSize: wxMs(14), lineHeight: wxMs(22) },
  footer: { padding: wxSc(SPACING.md) },
  acceptButton: { paddingVertical: wxSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
});
