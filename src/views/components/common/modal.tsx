import { ReactNode } from "react";
import { Modal as RNModal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface ModalProps { visible: boolean; onClose: () => void; title?: string; children: ReactNode; }

export const Modal = ({ visible, onClose, title, children }: ModalProps) => {
  return (
    <RNModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            {title && <Text allowFontScaling={false} style={styles.title}>{title}</Text>}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.content}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end" },
  container: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: "90%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text },
  closeButton: { padding: scale(SPACING.sm) },
  closeText: { fontSize: moderateScale(FONT_SIZES.xl), color: COLORS.textSecondary },
  content: { padding: scale(SPACING.md) },
});
