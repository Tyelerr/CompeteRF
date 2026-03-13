// src/views/components/faq/TermsModal.tsx

import { TERMS_OF_SERVICE } from "../../../models/constants/legal-text";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

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
        <Text style={s.headerTitle}>TERMS OF SERVICE</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.lastUpdated}>
          Effective Date: {TERMS_OF_SERVICE.lastUpdated}
        </Text>
        <Text style={s.preamble}>{TERMS_OF_SERVICE.preamble}</Text>

        {TERMS_OF_SERVICE.sections.map(
          (section: LegalSection, index: number) => (
            <View key={index} style={s.section}>
              <Text style={s.heading}>{section.heading}</Text>
              <Text style={s.body}>{section.body}</Text>
            </View>
          ),
        )}
      </ScrollView>

      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity style={s.acceptButton} onPress={onClose}>
          <Text style={s.acceptButtonText}>Accept & Close</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.mobileOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={s.mobileContainer}>{innerContent}</View>
        <TouchableOpacity style={s.mobileCloseButton} onPress={onClose}>
          <Text style={s.mobileCloseButtonText}>Accept & Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: "fixed" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 2000,
  },
  dialogWrap: {
    position: "fixed" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 2001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: 700,
    maxWidth: "92%" as any,
    height: "82vh" as any,
    backgroundColor: "#000000",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "#2C2C2E",
    overflow: "hidden" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    display: "flex" as any,
    flexDirection: "column",
  },
  mobileOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  mobileContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    width: "100%" as any,
    maxWidth: 500,
    height: "85%" as any,
    overflow: "hidden",
  },
  mobileCloseButton: {
    backgroundColor: "#E74C3C",
    borderRadius: 12,
    margin: 12,
    width: "100%" as any,
    maxWidth: 500,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  mobileCloseButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: FONT_SIZES.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    letterSpacing: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#2C2C2E" },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  lastUpdated: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  preamble: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  heading: {
    color: "#3B82F6",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  body: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    padding: SPACING.md,
  },
  acceptButton: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
