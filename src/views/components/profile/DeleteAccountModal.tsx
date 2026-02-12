// src/views/components/profile/DeleteAccountModal.tsx

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

interface DeleteAccountModalProps {
  visible: boolean;
  confirmText: string;
  onChangeConfirmText: (text: string) => void;
  isConfirmed: boolean;
  deleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

export function DeleteAccountModal({
  visible,
  confirmText,
  onChangeConfirmText,
  isConfirmed,
  deleting,
  onCancel,
  onDelete,
}: DeleteAccountModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.scrollContent}
            enableOnAndroid={true}
            enableAutomaticScroll={true}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            extraScrollHeight={80}
            extraHeight={80}
          >
            <View style={styles.modal}>
              <Text style={styles.title}>{"\u26A0\uFE0F"} Delete Account</Text>

              <Text style={styles.warning}>
                This action is permanent and cannot be undone.
              </Text>

              <Text style={styles.body}>The following will be deleted:</Text>

              <View style={styles.list}>
                <Text style={styles.listItem}>
                  {"\u2022"} Your profile and profile image
                </Text>
                <Text style={styles.listItem}>
                  {"\u2022"} Favorites, saved searches, and search alerts
                </Text>
                <Text style={styles.listItem}>
                  {"\u2022"} Giveaway entries and winner history
                </Text>
                <Text style={styles.listItem}>
                  {"\u2022"} Support tickets and notifications
                </Text>
                <Text style={styles.listItem}>
                  {"\u2022"} Messages and conversation history
                </Text>
              </View>

              <Text style={styles.bodyBold}>
                If you are a bar owner or tournament director, all venues,
                tournaments, and templates you manage will also be permanently
                deleted.
              </Text>

              <Text style={styles.confirmLabel}>
                Type <Text style={styles.deleteWord}>DELETE</Text> to confirm:
              </Text>

              <TextInput
                style={styles.input}
                value={confirmText}
                onChangeText={onChangeConfirmText}
                placeholder="Type DELETE here"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
              />

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onCancel}
                  disabled={deleting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.deleteButton,
                    (!isConfirmed || deleting) && styles.deleteButtonDisabled,
                  ]}
                  onPress={onDelete}
                  disabled={!isConfirmed || deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.deleteButtonText}>
                      Delete My Account
                    </Text>
                  )}
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  modal: {
    width: "100%",
    backgroundColor: COLORS.backgroundCard || "#1A1D24",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: "#EF4444",
    marginBottom: SPACING.sm,
  },
  warning: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: "#EF4444",
    marginBottom: SPACING.md,
  },
  body: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  bodyBold: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  list: {
    marginBottom: SPACING.xs,
  },
  listItem: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
    paddingLeft: SPACING.xs,
  },
  confirmLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    marginBottom: SPACING.sm,
  },
  deleteWord: {
    color: "#EF4444",
    fontWeight: "700",
  },
  input: {
    backgroundColor: COLORS.surface || "#0F1117",
    borderWidth: 1,
    borderColor: COLORS.border || "#374151",
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border || "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
