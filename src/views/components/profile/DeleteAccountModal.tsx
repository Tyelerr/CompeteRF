import {
  ActivityIndicator,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

interface DeleteAccountModalProps {
  visible: boolean;
  confirmText: string;
  onChangeConfirmText: (text: string) => void;
  isConfirmed: boolean;
  deleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

export function DeleteAccountModal({ visible, confirmText, onChangeConfirmText, isConfirmed, deleting, onCancel, onDelete }: DeleteAccountModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} enableOnAndroid enableAutomaticScroll keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} extraScrollHeight={80} extraHeight={80}>
            <View style={styles.modal}>
              <Text allowFontScaling={false} style={styles.title}>⚠️ Delete Account</Text>
              <Text allowFontScaling={false} style={styles.warning}>This action is permanent and cannot be undone.</Text>
              <Text allowFontScaling={false} style={styles.body}>The following will be deleted:</Text>
              <View style={styles.list}>
                <Text allowFontScaling={false} style={styles.listItem}>• Your profile and profile image</Text>
                <Text allowFontScaling={false} style={styles.listItem}>• Favorites, saved searches, and search alerts</Text>
                <Text allowFontScaling={false} style={styles.listItem}>• Giveaway entries and winner history</Text>
                <Text allowFontScaling={false} style={styles.listItem}>• Support tickets and notifications</Text>
                <Text allowFontScaling={false} style={styles.listItem}>• Messages and conversation history</Text>
              </View>
              <Text allowFontScaling={false} style={styles.bodyBold}>If you are a bar owner or tournament director, all venues, tournaments, and templates you manage will also be permanently deleted.</Text>
              <Text allowFontScaling={false} style={styles.confirmLabel}>Type <Text style={styles.deleteWord}>DELETE</Text> to confirm:</Text>
              <TextInput allowFontScaling={false} style={styles.input} value={confirmText} onChangeText={onChangeConfirmText} placeholder="Type DELETE here" placeholderTextColor={COLORS.textMuted} autoCapitalize="characters" autoCorrect={false} editable={!deleting} />
              <View style={styles.buttons}>
                <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={deleting}>
                  <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.deleteButton, (!isConfirmed || deleting) && styles.deleteButtonDisabled]} onPress={onDelete} disabled={!isConfirmed || deleting}>
                  {deleting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text allowFontScaling={false} style={styles.deleteButtonText}>Delete My Account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)", justifyContent: "center", padding: scale(SPACING.lg) },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  modal: { width: "100%", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.error },
  title: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.error, marginBottom: scale(SPACING.sm) },
  warning: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.error, marginBottom: scale(SPACING.md) },
  body: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: scale(SPACING.sm) },
  bodyBold: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600", marginTop: scale(SPACING.sm), marginBottom: scale(SPACING.md) },
  list: { marginBottom: scale(SPACING.xs) },
  listItem: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(22), paddingLeft: scale(SPACING.xs) },
  confirmLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500", marginBottom: scale(SPACING.sm) },
  deleteWord: { color: COLORS.error, fontWeight: "700" },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, marginBottom: scale(SPACING.lg), textAlign: "center" },
  buttons: { flexDirection: "row", gap: scale(SPACING.sm), alignItems: "stretch" },
  cancelButton: { flex: 1, paddingVertical: scale(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", textAlign: "center" },
  deleteButton: { flex: 1, paddingVertical: scale(14), borderRadius: RADIUS.md, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center" },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", textAlign: "center" },
});
