import { TERMS_OF_SERVICE } from "../../../models/constants/legal-text";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
type LegalSection = { heading: string; body: string };

interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TermsModal({ visible, onClose }: TermsModalProps) {
  if (!visible) return null;

  const innerContent = (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text allowFontScaling={false} style={s.headerTitle}>TERMS OF SERVICE</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text allowFontScaling={false} style={s.lastUpdated}>Effective Date: {TERMS_OF_SERVICE.lastUpdated}</Text>
        <Text allowFontScaling={false} style={s.preamble}>{TERMS_OF_SERVICE.preamble}</Text>
        {TERMS_OF_SERVICE.sections.map((section: LegalSection, index: number) => (
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
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: scale(20) },
  mobileContainer: { backgroundColor: COLORS.background, borderRadius: scale(20), width: "100%", maxWidth: 500, height: "85%" as any, flexDirection: "column" as any },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: moderateScale(20), fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#2C2C2E" },
  scrollContent: { padding: scale(SPACING.lg), paddingBottom: scale(SPACING.xl) },
  lastUpdated: { color: "#6B7280", fontSize: moderateScale(13), marginBottom: scale(SPACING.md) },
  preamble: { color: "#D1D5DB", fontSize: moderateScale(14), lineHeight: moderateScale(22), marginBottom: scale(SPACING.lg) },
  section: { marginBottom: scale(SPACING.lg) },
  heading: { color: "#3B82F6", fontSize: moderateScale(16), fontWeight: "600", marginBottom: scale(SPACING.sm) },
  body: { color: "#D1D5DB", fontSize: moderateScale(14), lineHeight: moderateScale(22) },
  footer: { padding: scale(SPACING.md) },
  acceptButton: { paddingVertical: scale(SPACING.md), borderRadius: RADIUS.md, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});
